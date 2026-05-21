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
  ) => Promise<ActiveSubscriptionPlanResolution | null>;
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
  plan?: SubscriptionPlanView;
  usage?: SubscriptionQuotaUsage;
  error: SubscriptionQuotaError;
};

export type ConsumeQuotaResult = ConsumeQuotaAllowed | ConsumeQuotaDenied;

type PlanUnavailableReason = 'missing' | 'disabled';

type ActiveSubscriptionPlanResolution = {
  planKey: string;
  planName?: string;
  planDescription?: string;
  planAmount?: number;
  textDailyLimit?: number;
  imageDailyLimit?: number;
};

type PlanResolution =
  | {
      available: true;
      plan: SubscriptionPlanView;
    }
  | {
      available: false;
      planKey: string;
      reason: PlanUnavailableReason;
    };

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

function getPlanResolution(
  plans: SubscriptionPlanView[],
  activeSubscription: ActiveSubscriptionPlanResolution | null,
): PlanResolution {
  const planKey = activeSubscription?.planKey ?? 'free';
  const plan = plans.find((value) => value.key === planKey);

  if (plan?.enabled) {
    return {
      available: true,
      plan,
    };
  }

  if (activeSubscription) {
    return {
      available: true,
      plan: {
        key: planKey,
        name: activeSubscription.planName ?? plan?.name ?? planKey,
        ...(activeSubscription.planDescription ?? plan?.description
          ? { description: activeSubscription.planDescription ?? plan?.description }
        : {}),
        price: activeSubscription.planAmount ?? plan?.price ?? 0,
        durationDays: 0,
        textDailyLimit: activeSubscription.textDailyLimit ?? plan?.textDailyLimit ?? 0,
        imageDailyLimit: activeSubscription.imageDailyLimit ?? plan?.imageDailyLimit ?? 0,
        enabled: true,
        sortOrder: 0,
      },
    };
  }

  if (!plan) {
    return {
      available: false,
      planKey,
      reason: 'missing',
    };
  }

  return {
    available: false,
    planKey,
    reason: 'disabled',
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
    const resolution = getPlanResolution(plans, activeSubscription);

    if (!resolution.available) {
      throw new Error(`Subscription plan is unavailable: ${resolution.planKey}`);
    }

    return resolution.plan;
  }

  async function consume(input: ConsumeQuotaInput): Promise<ConsumeQuotaResult> {
    assertValidAmount(input.amount);

    const now = input.now ?? new Date();
    const timezone = input.timezone ?? config.timezone;
    const [plans, activeSubscription] = await Promise.all([
      deps.getPlans(input.tenantId),
      deps.findActiveUserSubscription(input.userId, now, input.tenantId),
    ]);
    const planResolution = getPlanResolution(plans, activeSubscription);
    const window = getQuotaWindow(now, timezone);

    if (!planResolution.available) {
      return {
        allowed: false,
        error: {
          type: 'subscription_plan_unavailable',
          kind: input.kind,
          planKey: planResolution.planKey,
          reason: planResolution.reason,
          resetAt: window.windowEnd.toISOString(),
        },
      };
    }

    const plan = planResolution.plan;
    const limit = getLimit(plan, input.kind);
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
