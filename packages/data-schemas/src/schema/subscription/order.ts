import { Schema } from 'mongoose';
import type { ISubscriptionPaymentOrder } from '~/types';

const paymentOrderSchema = new Schema<ISubscriptionPaymentOrder>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    outTradeNo: {
      type: String,
      required: true,
    },
    tradeNo: {
      type: String,
      default: undefined,
    },
    planKey: {
      type: String,
      required: true,
      index: true,
    },
    durationDays: {
      type: Number,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'durationDays must be an integer',
      },
      default: undefined,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentType: {
      type: String,
      enum: ['alipay', 'wxpay'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'fulfilling', 'completed', 'expired', 'cancelled', 'failed'],
      default: 'pending',
      index: true,
    },
    payUrl: {
      type: String,
      default: undefined,
    },
    qrCode: {
      type: String,
      default: undefined,
    },
    rawNotify: {
      type: String,
      default: undefined,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    paidAt: {
      type: Date,
      default: undefined,
    },
    fulfillingAt: {
      type: Date,
      default: undefined,
    },
    completedAt: {
      type: Date,
      default: undefined,
    },
    failedAt: {
      type: Date,
      default: undefined,
    },
    failedReason: {
      type: String,
      default: undefined,
    },
    tenantId: {
      type: String,
      index: true,
      default: null,
    },
  },
  { timestamps: true },
);

paymentOrderSchema.index({ outTradeNo: 1 }, { unique: true });
paymentOrderSchema.index({ user: 1, createdAt: -1 });
paymentOrderSchema.index({ status: 1, expiresAt: 1 });

export default paymentOrderSchema;
