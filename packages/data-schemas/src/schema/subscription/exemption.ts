import { Schema } from 'mongoose';
import type { ISubscriptionQuotaExemption } from '~/types';

const quotaExemptionSchema = new Schema<ISubscriptionQuotaExemption>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, 'is invalid'],
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

quotaExemptionSchema.index({ email: 1, tenantId: 1 }, { unique: true });

export default quotaExemptionSchema;
