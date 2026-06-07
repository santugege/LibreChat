import { Schema } from 'mongoose';
import type { ISubscriptionRedemptionCode } from '~/types';

const redemptionCodeSchema = new Schema<ISubscriptionRedemptionCode>(
  {
    batch: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionRedemptionBatch',
      required: true,
      index: true,
    },
    codeHash: {
      type: String,
      required: true,
    },
    codePrefix: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'redeemed', 'disabled', 'expired'],
      default: 'active',
      index: true,
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'durationDays must be an integer',
      },
    },
    textDailyLimit: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'textDailyLimit must be an integer',
      },
    },
    imageDailyLimit: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'imageDailyLimit must be an integer',
      },
    },
    planKey: {
      type: String,
      required: true,
      trim: true,
    },
    planName: {
      type: String,
      required: true,
      trim: true,
    },
    planDescription: {
      type: String,
      default: undefined,
    },
    planAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: undefined,
      index: true,
    },
    redeemedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
      index: true,
    },
    redeemedAt: {
      type: Date,
      default: undefined,
      index: true,
    },
    sourceSubscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'UserSubscription',
      default: undefined,
    },
    disableReason: {
      type: String,
      default: undefined,
    },
    note: {
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

redemptionCodeSchema.index({ codeHash: 1, tenantId: 1 }, { unique: true });
redemptionCodeSchema.index({ batch: 1, createdAt: 1 });
redemptionCodeSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
redemptionCodeSchema.index({ redeemedBy: 1, redeemedAt: -1 });

export default redemptionCodeSchema;
