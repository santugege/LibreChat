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

export type SubscriptionQuotaError = {
  type: 'subscription_quota';
  kind: SubscriptionQuotaKind;
  used: number;
  limit: number;
  planKey: string;
  resetAt: string;
};
