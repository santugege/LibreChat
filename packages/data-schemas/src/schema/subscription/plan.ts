import { Schema } from 'mongoose';
import type { ISubscriptionPlan } from '~/types';

const planSchema = new Schema<ISubscriptionPlan>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: undefined,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
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
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'sortOrder must be an integer',
      },
    },
    tenantId: {
      type: String,
      index: true,
      default: null,
    },
  },
  { timestamps: true },
);

planSchema.index({ key: 1, tenantId: 1 }, { unique: true });
planSchema.index({ enabled: 1, sortOrder: 1 });

export default planSchema;
