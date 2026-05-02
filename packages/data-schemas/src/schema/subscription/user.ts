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
    tenantId: {
      type: String,
      index: true,
      default: null,
    },
  },
  { timestamps: true },
);

userSubscriptionSchema.index({ user: 1, status: 1, expiresAt: 1 });

export default userSubscriptionSchema;
