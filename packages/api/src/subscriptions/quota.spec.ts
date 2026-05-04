import type { SubscriptionPlanView } from './types';
import type { QuotaServiceDeps } from './quota';
import type { SubscriptionConfig } from './config';
import { getSubscriptionConfig } from './config';
import { createQuotaService } from './quota';
import { getQuotaWindow } from './windows';

const config: SubscriptionConfig = {
  enabled: true,
  timezone: 'Asia/Shanghai',
};

function plan(overrides: Partial<SubscriptionPlanView> = {}): SubscriptionPlanView {
  return {
    key: 'free',
    name: 'Free',
    price: 0,
    durationDays: 0,
    textDailyLimit: 2,
    imageDailyLimit: 1,
    enabled: true,
    sortOrder: 0,
    ...overrides,
  };
}

function getLocalDateTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const getPart = (type: string): string => {
    const part = parts.find((value) => value.type === type);
    if (!part) {
      throw new Error(`Missing ${type} date part`);
    }

    return part.value;
  };

  return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}`;
}

describe('getQuotaWindow', () => {
  test('uses the configured IANA timezone for daily quota boundaries', () => {
    const window = getQuotaWindow(new Date('2026-05-01T18:00:00.000Z'), 'Asia/Shanghai');

    expect(window.windowKey).toBe('2026-05-02');
    expect(window.windowStart.toISOString()).toBe('2026-05-01T16:00:00.000Z');
    expect(window.windowEnd.toISOString()).toBe('2026-05-02T16:00:00.000Z');
  });

  test('uses DST-aware midnight boundaries', () => {
    const window = getQuotaWindow(new Date('2026-03-08T07:30:00.000Z'), 'America/New_York');

    expect(window.windowKey).toBe('2026-03-08');
    expect(window.windowStart.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(window.windowEnd.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  test('uses DST fall-back midnight boundaries', () => {
    const window = getQuotaWindow(new Date('2026-11-01T06:30:00.000Z'), 'America/New_York');

    expect(window.windowKey).toBe('2026-11-01');
    expect(window.windowStart.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(window.windowEnd.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  test('supports non-hour-offset time zones', () => {
    const window = getQuotaWindow(new Date('2026-05-01T18:30:00.000Z'), 'Asia/Kathmandu');

    expect(window.windowKey).toBe('2026-05-02');
    expect(window.windowStart.toISOString()).toBe('2026-05-01T18:15:00.000Z');
    expect(window.windowEnd.toISOString()).toBe('2026-05-02T18:15:00.000Z');
  });

  test('does not resolve DST-at-midnight starts to the previous local date', () => {
    const window = getQuotaWindow(new Date('2026-03-08T07:37:00.000Z'), 'America/Havana');

    expect(window.windowKey).toBe('2026-03-08');
    expect(getLocalDateTime(window.windowStart, 'America/Havana')).not.toBe('2026-03-07 23:00');
    expect(getLocalDateTime(window.windowStart, 'America/Havana').startsWith('2026-03-08')).toBe(
      true,
    );
  });
});

describe('getSubscriptionConfig', () => {
  test('parses subscription enabled and timezone env settings', () => {
    expect(
      getSubscriptionConfig({
        SUBSCRIPTIONS_ENABLED: ' TRUE ',
        SUBSCRIPTION_QUOTA_TIMEZONE: 'America/New_York',
      }),
    ).toEqual({
      enabled: true,
      timezone: 'America/New_York',
    });

    expect(
      getSubscriptionConfig({
        SUBSCRIPTIONS_ENABLED: 'false',
      }),
    ).toEqual({
      enabled: false,
      timezone: 'Asia/Shanghai',
    });
  });

  test('falls back to the default timezone when env timezone is invalid', () => {
    expect(
      getSubscriptionConfig({
        SUBSCRIPTION_QUOTA_TIMEZONE: 'Not/A_Zone',
      }).timezone,
    ).toBe('Asia/Shanghai');
  });

});

describe('createQuotaService', () => {
  test('returns structured quota denial when the daily limit is exhausted', async () => {
    const quotaPlan = plan({ textDailyLimit: 2 });
    const deps: QuotaServiceDeps = {
      getPlans: async () => [quotaPlan],
      findActiveUserSubscription: async () => null,
      consumeSubscriptionQuota: async (input) => ({
        allowed: false,
        used: 2,
        limit: input.limit,
        resetAt: input.windowEnd,
      }),
    };

    const service = createQuotaService(deps, config);
    const result = await service.consume({
      userId: 'user-1',
      kind: 'text',
      amount: 1,
      requestId: 'request-3',
      now: new Date('2026-05-01T18:00:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    if (result.allowed) {
      throw new Error('Expected quota denial');
    }
    expect(result.error).toEqual({
      type: 'subscription_quota',
      kind: 'text',
      used: 2,
      limit: 2,
      planKey: 'free',
      resetAt: '2026-05-02T16:00:00.000Z',
    });
    expect(result.usage).toEqual({
      used: 2,
      limit: 2,
      resetAt: '2026-05-02T16:00:00.000Z',
      windowKey: '2026-05-02',
    });
  });

  test('selects the active subscription plan over the free plan', async () => {
    const now = new Date('2026-05-01T18:00:00.000Z');
    const freePlan = plan({ key: 'free', textDailyLimit: 2 });
    const proPlan = plan({ key: 'pro', name: 'Pro', textDailyLimit: 100, sortOrder: 1 });
    let receivedTenantId: string | undefined;
    let receivedSubscriptionTenantId: string | undefined;
    let receivedConsumptionTenantId: string | undefined;
    let receivedLimit: number | undefined;

    const deps: QuotaServiceDeps = {
      getPlans: async (tenantId) => {
        receivedTenantId = tenantId;
        return [freePlan, proPlan];
      },
      findActiveUserSubscription: async (_user, _now, tenantId) => {
        receivedSubscriptionTenantId = tenantId;
        return { planKey: 'pro' };
      },
      consumeSubscriptionQuota: async (input) => {
        receivedConsumptionTenantId = input.tenantId;
        receivedLimit = input.limit;
        return {
          allowed: true,
          used: 1,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    };

    const service = createQuotaService(deps, config);
    const result = await service.consume({
      userId: 'user-1',
      tenantId: 'tenant-a',
      kind: 'text',
      amount: 1,
      requestId: 'request-1',
      now,
    });

    expect(receivedTenantId).toBe('tenant-a');
    expect(receivedSubscriptionTenantId).toBe('tenant-a');
    expect(receivedConsumptionTenantId).toBe('tenant-a');
    expect(receivedLimit).toBe(100);
    expect(result.allowed).toBe(true);
    expect(result.plan.key).toBe('pro');
    expect(result.usage.limit).toBe(100);
  });

  test('denies quota when no free database plan exists', async () => {
    const paidPlan = plan({ key: 'pro', name: 'Pro', textDailyLimit: 100, imageDailyLimit: 20 });
    let consumeCalls = 0;

    const deps: QuotaServiceDeps = {
      getPlans: async () => [paidPlan],
      findActiveUserSubscription: async () => null,
      consumeSubscriptionQuota: async (input) => {
        consumeCalls += 1;
        return {
          allowed: true,
          used: input.amount,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    };

    const service = createQuotaService(deps, config);
    const result = await service.consume({
      userId: 'user-1',
      kind: 'text',
      amount: 1,
      requestId: 'request-paid-only',
      now: new Date('2026-05-01T18:00:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    if (result.allowed) {
      throw new Error('Expected plan unavailable denial');
    }
    expect(result.error).toEqual({
      type: 'subscription_plan_unavailable',
      kind: 'text',
      planKey: 'free',
      reason: 'missing',
      resetAt: '2026-05-02T16:00:00.000Z',
    });
    expect(result.plan).toBeUndefined();
    expect(result.usage).toBeUndefined();
    expect(consumeCalls).toBe(0);
  });

  test('denies quota when active subscription plan is missing', async () => {
    const paidPlan = plan({ key: 'pro', name: 'Pro', textDailyLimit: 100, imageDailyLimit: 20 });
    let consumeCalls = 0;

    const deps: QuotaServiceDeps = {
      getPlans: async () => [paidPlan],
      findActiveUserSubscription: async () => ({ planKey: 'missing-plan' }),
      consumeSubscriptionQuota: async (input) => {
        consumeCalls += 1;
        return {
          allowed: true,
          used: input.amount,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    };

    const service = createQuotaService(deps, config);
    const result = await service.consume({
      userId: 'user-1',
      kind: 'image',
      amount: 1,
      requestId: 'request-missing-plan',
      now: new Date('2026-05-01T18:00:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    if (result.allowed) {
      throw new Error('Expected plan unavailable denial');
    }
    expect(result.error).toEqual({
      type: 'subscription_plan_unavailable',
      kind: 'image',
      planKey: 'missing-plan',
      reason: 'missing',
      resetAt: '2026-05-02T16:00:00.000Z',
    });
    expect(result.plan).toBeUndefined();
    expect(result.usage).toBeUndefined();
    expect(consumeCalls).toBe(0);
  });

  test('denies quota when free database plan is disabled', async () => {
    const disabledFreePlan = plan({ enabled: false });
    let consumeCalls = 0;

    const deps: QuotaServiceDeps = {
      getPlans: async () => [disabledFreePlan],
      findActiveUserSubscription: async () => null,
      consumeSubscriptionQuota: async (input) => {
        consumeCalls += 1;
        return {
          allowed: true,
          used: input.amount,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    };

    const service = createQuotaService(deps, config);
    const result = await service.consume({
      userId: 'user-1',
      kind: 'image',
      amount: 1,
      requestId: 'image-request-1',
      now: new Date('2026-05-01T18:00:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    if (result.allowed) {
      throw new Error('Expected plan unavailable denial');
    }
    expect(result.error).toEqual({
      type: 'subscription_plan_unavailable',
      kind: 'image',
      planKey: 'free',
      reason: 'disabled',
      resetAt: '2026-05-02T16:00:00.000Z',
    });
    expect(result.plan).toBeUndefined();
    expect(result.usage).toBeUndefined();
    expect(consumeCalls).toBe(0);
  });
});
