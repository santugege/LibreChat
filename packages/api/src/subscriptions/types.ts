export type SubscriptionQuotaKind = 'text' | 'image';

export type SubscriptionPlanView = {
  key: string;
  name: string;
  description?: string;
  price: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  enabled: boolean;
  sortOrder: number;
};

export type SubscriptionQuotaLimitError = {
  type: 'subscription_quota';
  kind: SubscriptionQuotaKind;
  used: number;
  limit: number;
  planKey: string;
  resetAt: string;
};

export type SubscriptionPlanUnavailableError = {
  type: 'subscription_plan_unavailable';
  kind: SubscriptionQuotaKind;
  planKey: string;
  reason: 'missing' | 'disabled';
  resetAt: string;
};

export type SubscriptionQuotaError =
  | SubscriptionQuotaLimitError
  | SubscriptionPlanUnavailableError;
