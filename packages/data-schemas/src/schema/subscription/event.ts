import { Schema } from 'mongoose';
import type { ISubscriptionUsageEvent } from '~/types';

const usageEventSchema = new Schema<ISubscriptionUsageEvent>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
      immutable: true,
    },
    kind: {
      type: String,
      enum: ['text', 'image'],
      required: true,
      immutable: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
    },
    requestId: {
      type: String,
      required: true,
      immutable: true,
    },
    bucketKey: {
      type: String,
      required: true,
      index: true,
      immutable: true,
    },
    windowStart: {
      type: Date,
      required: true,
      immutable: true,
    },
    windowEnd: {
      type: Date,
      required: true,
      immutable: true,
    },
    limit: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'limit must be an integer',
      },
      immutable: true,
    },
    status: {
      type: String,
      enum: ['committed', 'released'],
      default: 'committed',
      index: true,
    },
    reason: {
      type: String,
      default: undefined,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: undefined,
      immutable: true,
    },
    tenantId: {
      type: String,
      index: true,
      default: null,
      immutable: true,
    },
  },
  { timestamps: true },
);

usageEventSchema.index({ requestId: 1, tenantId: 1 }, { unique: true });

export default usageEventSchema;
