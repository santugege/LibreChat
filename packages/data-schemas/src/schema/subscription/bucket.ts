import { Schema } from 'mongoose';
import type { ISubscriptionUsageBucket } from '~/types';

const usageBucketSchema = new Schema<ISubscriptionUsageBucket>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    windowKey: {
      type: String,
      required: true,
      index: true,
    },
    windowStart: {
      type: Date,
      required: true,
    },
    windowEnd: {
      type: Date,
      required: true,
    },
    textUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    imageUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    textRequestIds: {
      type: [String],
      default: [],
    },
    imageRequestIds: {
      type: [String],
      default: [],
    },
    tenantId: {
      type: String,
      index: true,
      default: null,
    },
  },
  { timestamps: true },
);

usageBucketSchema.index({ user: 1, windowKey: 1, tenantId: 1 }, { unique: true });

export default usageBucketSchema;
