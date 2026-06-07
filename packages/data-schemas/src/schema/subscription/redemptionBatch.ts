import { Schema } from 'mongoose';
import type { ISubscriptionRedemptionBatch } from '~/types';

const redemptionBatchSchema = new Schema<ISubscriptionRedemptionBatch>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'quantity must be an integer',
      },
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
    note: {
      type: String,
      default: undefined,
    },
    campaign: {
      type: String,
      default: undefined,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
      default: null,
    },
  },
  { timestamps: true },
);

redemptionBatchSchema.index({ tenantId: 1, createdAt: -1 });
redemptionBatchSchema.index({ tenantId: 1, campaign: 1, createdAt: -1 });

export default redemptionBatchSchema;
