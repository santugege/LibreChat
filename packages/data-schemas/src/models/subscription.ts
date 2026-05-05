import {
  planSchema,
  usageEventSchema,
  usageBucketSchema,
  paymentOrderSchema,
  userSubscriptionSchema,
  quotaExemptionSchema,
} from '~/schema/subscription';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type {
  ISubscriptionPlan,
  IUserSubscription,
  ISubscriptionUsageEvent,
  ISubscriptionUsageBucket,
  ISubscriptionPaymentOrder,
  ISubscriptionQuotaExemption,
} from '~/types';

export function createSubscriptionModels(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(planSchema);
  applyTenantIsolation(userSubscriptionSchema);
  applyTenantIsolation(usageBucketSchema);
  applyTenantIsolation(usageEventSchema);
  applyTenantIsolation(paymentOrderSchema);
  applyTenantIsolation(quotaExemptionSchema);

  return {
    SubscriptionPlan:
      mongoose.models.SubscriptionPlan ||
      mongoose.model<ISubscriptionPlan>('SubscriptionPlan', planSchema),
    UserSubscription:
      mongoose.models.UserSubscription ||
      mongoose.model<IUserSubscription>('UserSubscription', userSubscriptionSchema),
    SubscriptionUsageBucket:
      mongoose.models.SubscriptionUsageBucket ||
      mongoose.model<ISubscriptionUsageBucket>('SubscriptionUsageBucket', usageBucketSchema),
    SubscriptionUsageEvent:
      mongoose.models.SubscriptionUsageEvent ||
      mongoose.model<ISubscriptionUsageEvent>('SubscriptionUsageEvent', usageEventSchema),
    SubscriptionPaymentOrder:
      mongoose.models.SubscriptionPaymentOrder ||
      mongoose.model<ISubscriptionPaymentOrder>('SubscriptionPaymentOrder', paymentOrderSchema),
    SubscriptionQuotaExemption:
      mongoose.models.SubscriptionQuotaExemption ||
      mongoose.model<ISubscriptionQuotaExemption>(
        'SubscriptionQuotaExemption',
        quotaExemptionSchema,
      ),
  };
}
