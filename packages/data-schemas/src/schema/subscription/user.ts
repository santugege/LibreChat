import { Schema } from 'mongoose';
import type { IUserSubscription } from '~/types';

const userSubscriptionSchema = new Schema<IUserSubscription>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    planKey: {
      type: String,
      required: true,
      index: true,
    },
    planName: {
      type: String,
      default: undefined,
    },
    planDescription: {
      type: String,
      default: undefined,
    },
    planAmount: {
      type: Number,
      min: 0,
      default: undefined,
    },
    textDailyLimit: {
      type: Number,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'textDailyLimit must be an integer',
      },
      default: undefined,
    },
    imageDailyLimit: {
      type: Number,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'imageDailyLimit must be an integer',
      },
      default: undefined,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
      index: true,
    },
    startsAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    sourceOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionPaymentOrder',
      default: undefined,
    },
    sourceOrderIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'SubscriptionPaymentOrder',
      },
    ],
    fulfillmentKey: {
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

userSubscriptionSchema.index({ user: 1, status: 1, expiresAt: 1 });
userSubscriptionSchema.index(
  { sourceOrderIds: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceOrderIds: { $type: 'objectId' } },
  },
);
userSubscriptionSchema.index(
  { fulfillmentKey: 1 },
  {
    unique: true,
    partialFilterExpression: { fulfillmentKey: { $type: 'string' } },
  },
);

export default userSubscriptionSchema;
