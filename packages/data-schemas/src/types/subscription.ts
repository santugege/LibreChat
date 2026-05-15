import type { Document, Types } from 'mongoose';

export type SubscriptionQuotaKind = 'text' | 'image';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';
export type SubscriptionOrderStatus =
  | 'pending'
  | 'paid'
  | 'fulfilling'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'failed';

export type SubscriptionUsageEventStatus = 'committed' | 'released';
export type SubscriptionPaymentType = 'alipay' | 'wxpay';
export type SubscriptionUsageMetadata = Record<string, string | number | boolean>;

export interface ISubscriptionPlan extends Document {
  key: string;
  name: string;
  description?: string;
  price: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  enabled: boolean;
  sortOrder: number;
  tenantId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserSubscription extends Document {
  user: Types.ObjectId;
  planKey: string;
  status: SubscriptionStatus;
  startsAt: Date;
  expiresAt: Date;
  sourceOrderId?: Types.ObjectId;
  sourceOrderIds?: Types.ObjectId[];
  fulfillmentKey?: string;
  tenantId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISubscriptionUsageBucket extends Document {
  user: Types.ObjectId;
  windowKey: string;
  windowStart: Date;
  windowEnd: Date;
  textUsed: number;
  imageUsed: number;
  textRequestIds: string[];
  imageRequestIds: string[];
  tenantId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISubscriptionUsageEvent extends Document {
  user: Types.ObjectId;
  kind: SubscriptionQuotaKind;
  amount: number;
  requestId: string;
  bucketKey: string;
  windowStart: Date;
  windowEnd: Date;
  limit: number;
  status: SubscriptionUsageEventStatus;
  reason?: string;
  metadata?: SubscriptionUsageMetadata;
  tenantId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISubscriptionPaymentOrder extends Document {
  user: Types.ObjectId;
  outTradeNo: string;
  tradeNo?: string;
  planKey: string;
  durationDays?: number;
  amount: number;
  paymentType: SubscriptionPaymentType;
  status: SubscriptionOrderStatus;
  payUrl?: string;
  qrCode?: string;
  qrImageUrl?: string;
  rawNotify?: string;
  expiresAt: Date;
  paidAt?: Date;
  fulfillingAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  failedReason?: string;
  tenantId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISubscriptionQuotaExemption extends Document {
  email: string;
  tenantId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
