import type { SubscriptionPlanView, SubscriptionQuotaKind, SubscriptionQuotaError } from './types';
import type { SubscriptionConfig } from './config';
import { getSubscriptionConfig } from './config';
import { getQuotaWindow } from './windows';

export type ConsumeSubscriptionQuotaInput = {
  user: string;
  kind: SubscriptionQuotaKind;
  amount: number;
  limit: number;
  windowKey: string;
  windowStart: Date;
  windowEnd: Date;
  requestId: string;
  tenantId?: string;
};

export type ConsumeSubscriptionQuotaResult = {
  allowed: boolean;
  used: number;
  limit: number;
  resetAt: Date;
};

export type QuotaServiceDeps = {
  getPlans: (tenantId?: string) => Promise<SubscriptionPlanView[]>;
  findActiveUserSubscription: (
    user: string,
    now?: Date,
    tenantId?: string,
  ) => Promise<{ planKey: string } | null>;
  consumeSubscriptionQuota: (
    input: ConsumeSubscriptionQuotaInput,
  ) => Promise<ConsumeSubscriptionQuotaResult>;
};

export type ConsumeQuotaInput = {
  userId: string;
  kind: SubscriptionQuotaKind;
  amount: number;
  requestId: string;
  now?: Date;
  tenantId?: string;
  timezone?: string;
};

export type SubscriptionQuotaUsage = {
  used: number;
  limit: number;
  resetAt: string;
  windowKey: string;
};

export type ConsumeQuotaAllowed = {
  allowed: true;
  plan: SubscriptionPlanView;
  usage: SubscriptionQuotaUsage;
};

export type ConsumeQuotaDenied = {
  allowed: false;
  plan: SubscriptionPlanView;
  usage: SubscriptionQuotaUsage;
  error: SubscriptionQuotaError;
};

export type ConsumeQuotaResult = ConsumeQuotaAllowed | ConsumeQuotaDenied;

function createFreePlan(config: SubscriptionConfig): SubscriptionPlanView {
  return {
    key: 'free',
    name: 'Free',
    price: 0,
    durationDays: 0,
    textDailyLimit: config.freeTextDailyLimit,
    imageDailyLimit: config.freeImageDailyLimit,
    enabled: true,
    sortOrder: 0,
  };
}

function getLimit(plan: SubscriptionPlanView, kind: SubscriptionQuotaKind): number {
  return kind === 'text' ? plan.textDailyLimit : plan.imageDailyLimit;
}

function assertValidAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Subscription quota amount must be a positive integer');
  }
}

function createUsage(
  result: ConsumeSubscriptionQuotaResult,
  windowKey: string,
): SubscriptionQuotaUsage {
  return {
    used: result.used,
    limit: result.limit,
    resetAt: result.resetAt.toISOString(),
    windowKey,
  };
}

export function createQuotaService(
  deps: QuotaServiceDeps,
  config: SubscriptionConfig = getSubscriptionConfig(),
) {
  async function resolvePlan(
    userId: string,
    now = new Date(),
    tenantId?: string,
  ): Promise<SubscriptionPlanView> {
    const [plans, activeSubscription] = await Promise.all([
      deps.getPlans(tenantId),
      deps.findActiveUserSubscription(userId, now, tenantId),
    ]);
    const fallbackFreePlan = createFreePlan(config);
    const activePlan = activeSubscription
      ? plans.find((plan) => plan.key === activeSubscription.planKey)
      : undefined;
    if (activeSubscription) {
      return activePlan ?? fallbackFreePlan;
    }

    return plans.find((plan) => plan.key === 'free') ?? fallbackFreePlan;
  }

  async function consume(input: ConsumeQuotaInput): Promise<ConsumeQuotaResult> {
    assertValidAmount(input.amount);

    const now = input.now ?? new Date();
    const timezone = input.timezone ?? config.timezone;
    const plan = await resolvePlan(input.userId, now, input.tenantId);
    const limit = getLimit(plan, input.kind);
    const window = getQuotaWindow(now, timezone);
    const quotaInput: ConsumeSubscriptionQuotaInput = {
      user: input.userId,
      kind: input.kind,
      amount: input.amount,
      limit,
      windowKey: window.windowKey,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      requestId: input.requestId,
      ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
    };
    const result = await deps.consumeSubscriptionQuota(quotaInput);
    const usage = createUsage(result, window.windowKey);

    if (result.allowed) {
      return {
        allowed: true,
        plan,
        usage,
      };
    }

    return {
      allowed: false,
      plan,
      usage,
      error: {
        type: 'subscription_quota',
        kind: input.kind,
        used: result.used,
        limit: result.limit,
        planKey: plan.key,
        resetAt: result.resetAt.toISOString(),
      },
    };
  }

  return {
    resolvePlan,
    consume,
  };
}
