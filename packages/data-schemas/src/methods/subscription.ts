import type { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';
import type {
  ISubscriptionPlan,
  IUserSubscription,
  SubscriptionOrderStatus,
  SubscriptionPaymentType,
  SubscriptionQuotaKind,
  ISubscriptionPaymentOrder,
  ISubscriptionUsageEvent,
  ISubscriptionUsageBucket,
  ISubscriptionQuotaExemption,
} from '~/types';
import { runAsSystem } from '~/config/tenantContext';

type ObjectIdInput = string | Types.ObjectId;
type UsageField = 'textUsed' | 'imageUsed';
type RequestIdsField = 'textRequestIds' | 'imageRequestIds';
const DAY_MS = 24 * 60 * 60 * 1000;
const FULFILLING_LOCK_TTL_MS = 10 * 60 * 1000;
const MAX_SUBSCRIPTION_EXTENSION_ATTEMPTS = 10;
type QuotaEventDimensions = {
  windowStart: Date;
  windowEnd: Date;
  limit: number;
};

export type UpsertSubscriptionPlanInput = Pick<
  ISubscriptionPlan,
  | 'key'
  | 'name'
  | 'price'
  | 'durationDays'
  | 'textDailyLimit'
  | 'imageDailyLimit'
  | 'enabled'
  | 'sortOrder'
> & {
  description?: string | undefined;
  tenantId?: string;
};

export type CreateSubscriptionPlanInput = UpsertSubscriptionPlanInput;

export type UpdateSubscriptionPlanInput = Partial<
  Omit<UpsertSubscriptionPlanInput, 'key' | 'tenantId'>
>;

export type CreateSubscriptionQuotaExemptionInput = {
  email: string;
  tenantId?: string;
};

export type ConsumeSubscriptionQuotaInput = {
  user: ObjectIdInput;
  kind: SubscriptionQuotaKind;
  amount: number;
  limit: number;
  windowKey: string;
  windowStart: Date;
  windowEnd: Date;
  requestId: string;
  tenantId?: string;
};

export type ConsumeSubscriptionQuotaResult = {
  allowed: boolean;
  used: number;
  limit: number;
  resetAt: Date;
};

export type CreateSubscriptionPaymentOrderInput = {
  user: ObjectIdInput;
  outTradeNo: string;
  tradeNo?: string;
  planKey: string;
  durationDays?: number;
  amount: number;
  paymentType: SubscriptionPaymentType;
  status?: SubscriptionOrderStatus;
  payUrl?: string;
  qrCode?: string;
  expiresAt: Date;
  tenantId?: string;
};

export type CreateOrExtendUserSubscriptionInput = {
  user: ObjectIdInput;
  planKey: string;
  durationDays: number;
  sourceOrderId: ObjectIdInput;
  now?: Date;
  tenantId?: string;
};

export type SubscriptionPaymentOrderLock = {
  fulfillingAt: Date;
};

function getTenantFilter(tenantId?: string): { tenantId: string | null } {
  return { tenantId: tenantId ?? null };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /\S+@\S+\.\S+/.test(email);
}

function getValidEmail(email: string): string {
  const normalized = normalizeEmail(email);

  if (!isValidEmail(normalized)) {
    throw new Error('Invalid subscription quota exemption email');
  }

  return normalized;
}

function isQuotaKind(kind: string): kind is SubscriptionQuotaKind {
  return kind === 'text' || kind === 'image';
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validateConsumeSubscriptionQuotaInput(input: ConsumeSubscriptionQuotaInput): void {
  if (!isQuotaKind(input.kind)) {
    throw new Error('Invalid subscription quota input: kind must be text or image');
  }

  if (!Number.isInteger(input.amount) || input.amount < 1) {
    throw new Error('Invalid subscription quota input: amount must be a positive integer');
  }

  if (!Number.isInteger(input.limit) || input.limit < 0) {
    throw new Error('Invalid subscription quota input: limit must be a nonnegative integer');
  }

  if (typeof input.requestId !== 'string' || input.requestId.trim().length === 0) {
    throw new Error('Invalid subscription quota input: requestId must be a nonempty string');
  }

  if (typeof input.windowKey !== 'string' || input.windowKey.trim().length === 0) {
    throw new Error('Invalid subscription quota input: windowKey must be a nonempty string');
  }

  if (!isValidDate(input.windowStart) || !isValidDate(input.windowEnd)) {
    throw new Error(
      'Invalid subscription quota input: windowStart and windowEnd must be valid Dates',
    );
  }

  if (input.windowEnd.getTime() <= input.windowStart.getTime()) {
    throw new Error('Invalid subscription quota input: windowEnd must be after windowStart');
  }
}

function validateCreateOrExtendUserSubscriptionInput(
  input: CreateOrExtendUserSubscriptionInput,
): void {
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1) {
    throw new Error('Invalid subscription duration: durationDays must be a positive integer');
  }
}

function getUsageField(kind: SubscriptionQuotaKind): UsageField {
  return kind === 'text' ? 'textUsed' : 'imageUsed';
}

function getRequestIdsField(kind: SubscriptionQuotaKind): RequestIdsField {
  return kind === 'text' ? 'textRequestIds' : 'imageRequestIds';
}

function getUsedValue(
  bucket: Pick<ISubscriptionUsageBucket, 'textUsed' | 'imageUsed'> | null | undefined,
  field: UsageField,
): number {
  if (!bucket) {
    return 0;
  }

  return field === 'textUsed' ? bucket.textUsed : bucket.imageUsed;
}

function getRequestIdsValue(
  bucket: Pick<ISubscriptionUsageBucket, 'textRequestIds' | 'imageRequestIds'> | null | undefined,
  field: RequestIdsField,
): string[] {
  if (!bucket) {
    return [];
  }

  return field === 'textRequestIds' ? bucket.textRequestIds : bucket.imageRequestIds;
}

function getUsageIncrement(field: UsageField, amount: number): Partial<Record<UsageField, number>> {
  return field === 'textUsed' ? { textUsed: amount } : { imageUsed: amount };
}

function getRequestIdUpdate(
  field: RequestIdsField,
  requestId: string,
): Partial<Record<RequestIdsField, string>> {
  return field === 'textRequestIds'
    ? { textRequestIds: requestId }
    : { imageRequestIds: requestId };
}

function getFulfilledSourceOrderFilter(
  sourceOrderId: Types.ObjectId,
): FilterQuery<IUserSubscription> {
  return {
    $or: [{ sourceOrderId }, { sourceOrderIds: sourceOrderId }],
  };
}

function getSourceOrderIdsToAdd(
  previousSourceOrderId: Types.ObjectId | undefined,
  sourceOrderId: Types.ObjectId,
): Types.ObjectId[] {
  if (!previousSourceOrderId) {
    return [sourceOrderId];
  }

  return [previousSourceOrderId, sourceOrderId];
}

function getFulfillmentKey(user: Types.ObjectId, tenantId: string | null): string {
  return `${tenantId ?? 'tenantless'}:${user.toString()}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

function getInputQuotaDimensions(input: ConsumeSubscriptionQuotaInput): QuotaEventDimensions {
  return {
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    limit: input.limit,
  };
}

function getEventQuotaDimensions(
  event: Pick<ISubscriptionUsageEvent, 'windowStart' | 'windowEnd' | 'limit'>,
): QuotaEventDimensions | null {
  if (
    !isValidDate(event.windowStart) ||
    !isValidDate(event.windowEnd) ||
    typeof event.limit !== 'number' ||
    !Number.isInteger(event.limit) ||
    event.limit < 0
  ) {
    return null;
  }

  return {
    windowStart: event.windowStart,
    windowEnd: event.windowEnd,
    limit: event.limit,
  };
}

function isMatchingQuotaEvent(
  event: ISubscriptionUsageEvent,
  input: ConsumeSubscriptionQuotaInput,
  user: Types.ObjectId,
): boolean {
  const eventDimensions = getEventQuotaDimensions(event);
  const inputDimensions = getInputQuotaDimensions(input);

  return (
    eventDimensions !== null &&
    event.user.toString() === user.toString() &&
    event.kind === input.kind &&
    event.amount === input.amount &&
    event.bucketKey === input.windowKey &&
    eventDimensions.windowStart.getTime() === inputDimensions.windowStart.getTime() &&
    eventDimensions.windowEnd.getTime() === inputDimensions.windowEnd.getTime() &&
    eventDimensions.limit === inputDimensions.limit
  );
}

function assertMatchingQuotaEvent(
  event: ISubscriptionUsageEvent,
  input: ConsumeSubscriptionQuotaInput,
  user: Types.ObjectId,
): void {
  if (!isMatchingQuotaEvent(event, input, user)) {
    throw new Error(
      'Subscription quota requestId collision: existing usage event dimensions differ',
    );
  }
}

export function createSubscriptionMethods(mongoose: typeof import('mongoose')) {
  function toObjectId(value: ObjectIdInput): Types.ObjectId {
    return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value);
  }

  async function upsertSubscriptionPlan(
    input: UpsertSubscriptionPlanInput,
  ): Promise<ISubscriptionPlan | null> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      const query: FilterQuery<ISubscriptionPlan> = {
        key: input.key,
        ...getTenantFilter(input.tenantId),
      };

      return (await SubscriptionPlan.findOneAndUpdate(
        query,
        { $set: input },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
      ).lean()) as ISubscriptionPlan | null;
    });
  }

  async function getEnabledSubscriptionPlans(tenantId?: string): Promise<ISubscriptionPlan[]> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      return (await SubscriptionPlan.find({
        enabled: true,
        ...getTenantFilter(tenantId),
      })
        .sort({ sortOrder: 1, price: 1 })
        .lean()) as ISubscriptionPlan[];
    });
  }

  async function listSubscriptionPlans(tenantId?: string): Promise<ISubscriptionPlan[]> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      return (await SubscriptionPlan.find(getTenantFilter(tenantId))
        .sort({ sortOrder: 1, price: 1, key: 1 })
        .lean()) as ISubscriptionPlan[];
    });
  }

  async function getSubscriptionPlan(
    key: string,
    tenantId?: string,
  ): Promise<ISubscriptionPlan | null> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      return (await SubscriptionPlan.findOne({
        key,
        ...getTenantFilter(tenantId),
      }).lean()) as ISubscriptionPlan | null;
    });
  }

  async function createSubscriptionPlan(
    input: CreateSubscriptionPlanInput,
  ): Promise<ISubscriptionPlan | null> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      const plan = await SubscriptionPlan.create({
        ...input,
        ...getTenantFilter(input.tenantId),
      });
      return plan.toObject() as ISubscriptionPlan;
    });
  }

  async function updateSubscriptionPlan(
    key: string,
    input: UpdateSubscriptionPlanInput,
    tenantId?: string,
  ): Promise<ISubscriptionPlan | null> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      const { description, ...setInput } = input;
      const update: UpdateQuery<ISubscriptionPlan> = {};

      if (Object.keys(setInput).length > 0) {
        update.$set = setInput;
      }

      if (Object.prototype.hasOwnProperty.call(input, 'description')) {
        if (description === undefined) {
          update.$unset = { description: '' };
        } else {
          update.$set = { ...(update.$set ?? {}), description };
        }
      }

      return (await SubscriptionPlan.findOneAndUpdate(
        { key, ...getTenantFilter(tenantId) },
        update,
        { new: true, runValidators: true },
      ).lean()) as ISubscriptionPlan | null;
    });
  }

  async function deleteSubscriptionPlan(
    key: string,
    tenantId?: string,
  ): Promise<ISubscriptionPlan | null> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      return (await SubscriptionPlan.findOneAndDelete({
        key,
        ...getTenantFilter(tenantId),
      }).lean()) as ISubscriptionPlan | null;
    });
  }

  async function listSubscriptionQuotaExemptions(
    tenantId?: string,
  ): Promise<ISubscriptionQuotaExemption[]> {
    return await runAsSystem(async () => {
      const Exemption = mongoose.models
        .SubscriptionQuotaExemption as Model<ISubscriptionQuotaExemption>;
      return (await Exemption.find(getTenantFilter(tenantId))
        .sort({ email: 1 })
        .lean()) as ISubscriptionQuotaExemption[];
    });
  }

  async function createSubscriptionQuotaExemption(
    input: CreateSubscriptionQuotaExemptionInput,
  ): Promise<ISubscriptionQuotaExemption | null> {
    return await runAsSystem(async () => {
      const Exemption = mongoose.models
        .SubscriptionQuotaExemption as Model<ISubscriptionQuotaExemption>;
      const email = getValidEmail(input.email);
      const query: FilterQuery<ISubscriptionQuotaExemption> = {
        email,
        ...getTenantFilter(input.tenantId),
      };

      return (await Exemption.findOneAndUpdate(
        query,
        { $set: query },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
      ).lean()) as ISubscriptionQuotaExemption | null;
    });
  }

  async function deleteSubscriptionQuotaExemption(
    emailInput: string,
    tenantId?: string,
  ): Promise<ISubscriptionQuotaExemption | null> {
    return await runAsSystem(async () => {
      const Exemption = mongoose.models
        .SubscriptionQuotaExemption as Model<ISubscriptionQuotaExemption>;
      const email = getValidEmail(emailInput);
      return (await Exemption.findOneAndDelete({
        email,
        ...getTenantFilter(tenantId),
      }).lean()) as ISubscriptionQuotaExemption | null;
    });
  }

  async function isSubscriptionQuotaExempt(
    emailInput: string,
    tenantId?: string,
  ): Promise<boolean> {
    return await runAsSystem(async () => {
      const Exemption = mongoose.models
        .SubscriptionQuotaExemption as Model<ISubscriptionQuotaExemption>;
      const email = normalizeEmail(emailInput);

      if (!isValidEmail(email)) {
        return false;
      }

      const exemption = await Exemption.exists({
        email,
        ...getTenantFilter(tenantId),
      });
      return exemption !== null;
    });
  }

  async function findActiveUserSubscription(
    user: ObjectIdInput,
    now = new Date(),
    tenantId?: string,
  ): Promise<IUserSubscription | null> {
    return await runAsSystem(async () => {
      const UserSubscription = mongoose.models.UserSubscription as Model<IUserSubscription>;
      return (await UserSubscription.findOne({
        user: toObjectId(user),
        status: 'active',
        startsAt: { $lte: now },
        expiresAt: { $gt: now },
        ...getTenantFilter(tenantId),
      })
        .sort({ expiresAt: -1 })
        .lean()) as IUserSubscription | null;
    });
  }

  async function consumeSubscriptionQuota(
    input: ConsumeSubscriptionQuotaInput,
  ): Promise<ConsumeSubscriptionQuotaResult> {
    validateConsumeSubscriptionQuotaInput(input);

    return await runAsSystem(async () => {
      const Bucket = mongoose.models.SubscriptionUsageBucket as Model<ISubscriptionUsageBucket>;
      const Event = mongoose.models.SubscriptionUsageEvent as Model<ISubscriptionUsageEvent>;
      const user = toObjectId(input.user);
      const usedField = getUsageField(input.kind);
      const requestIdsField = getRequestIdsField(input.kind);
      const tenantFilter = getTenantFilter(input.tenantId);
      const eventQuery: FilterQuery<ISubscriptionUsageEvent> = {
        requestId: input.requestId,
        ...tenantFilter,
      };
      const bucketQuery: FilterQuery<ISubscriptionUsageBucket> = {
        user,
        windowKey: input.windowKey,
        ...tenantFilter,
      };
      const resultFromEvent = async (
        event: ISubscriptionUsageEvent,
      ): Promise<ConsumeSubscriptionQuotaResult> => {
        assertMatchingQuotaEvent(event, input, user);
        const bucket = await Bucket.findOne(bucketQuery).lean();
        const used = getUsedValue(bucket, usedField);
        const eventDimensions = getEventQuotaDimensions(event);

        return {
          allowed: event.status === 'committed',
          used,
          limit: eventDimensions?.limit ?? input.limit,
          resetAt: eventDimensions?.windowEnd ?? input.windowEnd,
        };
      };

      const existingEvent = (await Event.findOne(
        eventQuery,
      ).lean()) as ISubscriptionUsageEvent | null;
      if (existingEvent) {
        return await resultFromEvent(existingEvent);
      }

      const bucketInsert: UpdateQuery<ISubscriptionUsageBucket> = {
        $setOnInsert: {
          user,
          windowKey: input.windowKey,
          windowStart: input.windowStart,
          windowEnd: input.windowEnd,
          textRequestIds: [],
          imageRequestIds: [],
          ...tenantFilter,
        },
      };
      try {
        await Bucket.updateOne(bucketQuery, bucketInsert, {
          upsert: true,
          setDefaultsOnInsert: true,
        });
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }

      const quotaQuery: FilterQuery<ISubscriptionUsageBucket> = {
        ...bucketQuery,
        [usedField]: { $lte: input.limit - input.amount },
        [requestIdsField]: { $ne: input.requestId },
      };
      const updated = await Bucket.findOneAndUpdate(
        quotaQuery,
        {
          $inc: getUsageIncrement(usedField, input.amount),
          $addToSet: getRequestIdUpdate(requestIdsField, input.requestId),
        },
        {
          new: true,
        },
      ).lean();

      const createOrReadEvent = async (
        status: 'committed' | 'released',
        quotaApplied: boolean,
        reason?: string,
      ): Promise<ConsumeSubscriptionQuotaResult> => {
        const rollbackConsumption = async (): Promise<void> => {
          await Bucket.updateOne(bucketQuery, {
            $inc: getUsageIncrement(usedField, -input.amount),
            $pull: getRequestIdUpdate(requestIdsField, input.requestId),
          });
        };
        const hasCommittedMatchingEvent = async (): Promise<boolean> => {
          try {
            const existing = (await Event.findOne(
              eventQuery,
            ).lean()) as ISubscriptionUsageEvent | null;
            return Boolean(
              existing &&
                existing.status === 'committed' &&
                isMatchingQuotaEvent(existing, input, user),
            );
          } catch {
            return false;
          }
        };
        const event = {
          user,
          kind: input.kind,
          amount: input.amount,
          requestId: input.requestId,
          bucketKey: input.windowKey,
          windowStart: input.windowStart,
          windowEnd: input.windowEnd,
          limit: input.limit,
          status,
          ...(reason ? { reason } : {}),
          ...tenantFilter,
        };

        try {
          await Event.create(event);
        } catch (error) {
          if (!isDuplicateKeyError(error)) {
            if (quotaApplied && !(await hasCommittedMatchingEvent())) {
              await rollbackConsumption();
            }
            throw error;
          }

          let existing: ISubscriptionUsageEvent | null;
          try {
            existing = (await Event.findOne(eventQuery).lean()) as ISubscriptionUsageEvent | null;
          } catch {
            if (quotaApplied) {
              await rollbackConsumption();
            }
            throw error;
          }

          if (!existing || !isMatchingQuotaEvent(existing, input, user)) {
            if (quotaApplied) {
              await rollbackConsumption();
            }
            throw new Error(
              'Subscription quota requestId collision: existing usage event dimensions differ',
            );
          }

          if (quotaApplied && existing.status !== 'committed') {
            await rollbackConsumption();
          }

          return await resultFromEvent(existing);
        }

        const bucket = await Bucket.findOne(bucketQuery).lean();
        return {
          allowed: status === 'committed',
          used: getUsedValue(bucket, usedField),
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      };

      if (!updated) {
        const bucket = await Bucket.findOne(bucketQuery).lean();
        const requestIds = getRequestIdsValue(bucket, requestIdsField);

        if (requestIds.includes(input.requestId)) {
          return await createOrReadEvent('committed', false);
        }

        return await createOrReadEvent('released', false, 'quota_exceeded');
      }

      return await createOrReadEvent('committed', true);
    });
  }

  async function createSubscriptionPaymentOrder(
    input: CreateSubscriptionPaymentOrderInput,
  ): Promise<ISubscriptionPaymentOrder | null> {
    return await runAsSystem(async () => {
      const Order = mongoose.models.SubscriptionPaymentOrder as Model<ISubscriptionPaymentOrder>;
      const order = await Order.create({
        user: toObjectId(input.user),
        outTradeNo: input.outTradeNo,
        ...(input.tradeNo ? { tradeNo: input.tradeNo } : {}),
        planKey: input.planKey,
        ...(input.durationDays ? { durationDays: input.durationDays } : {}),
        amount: input.amount,
        paymentType: input.paymentType,
        status: input.status ?? 'pending',
        ...(input.payUrl ? { payUrl: input.payUrl } : {}),
        ...(input.qrCode ? { qrCode: input.qrCode } : {}),
        expiresAt: input.expiresAt,
        ...getTenantFilter(input.tenantId),
      });

      return order.toObject() as ISubscriptionPaymentOrder;
    });
  }

  async function findSubscriptionPaymentOrderByTradeNo(
    outTradeNo: string,
  ): Promise<ISubscriptionPaymentOrder | null> {
    return await runAsSystem(async () => {
      const Order = mongoose.models.SubscriptionPaymentOrder as Model<ISubscriptionPaymentOrder>;
      return (await Order.findOne({ outTradeNo }).lean()) as ISubscriptionPaymentOrder | null;
    });
  }

  async function getSubscriptionPaymentOrder(
    orderId: ObjectIdInput,
    user: ObjectIdInput,
    tenantId?: string,
  ): Promise<ISubscriptionPaymentOrder | null> {
    return await runAsSystem(async () => {
      const Order = mongoose.models.SubscriptionPaymentOrder as Model<ISubscriptionPaymentOrder>;
      return (await Order.findOne({
        _id: toObjectId(orderId),
        user: toObjectId(user),
        ...getTenantFilter(tenantId),
      }).lean()) as ISubscriptionPaymentOrder | null;
    });
  }

  async function markSubscriptionOrderPaid(
    outTradeNo: string,
    tradeNo: string,
    rawNotify: string,
  ): Promise<ISubscriptionPaymentOrder | null> {
    return await runAsSystem(async () => {
      const Order = mongoose.models.SubscriptionPaymentOrder as Model<ISubscriptionPaymentOrder>;
      return (await Order.findOneAndUpdate(
        {
          outTradeNo,
          status: { $in: ['pending', 'paid'] },
        },
        {
          $set: {
            status: 'paid',
            tradeNo,
            rawNotify,
            paidAt: new Date(),
          },
        },
        { new: true, runValidators: true },
      ).lean()) as ISubscriptionPaymentOrder | null;
    });
  }

  async function markSubscriptionOrderFulfilling(
    outTradeNo: string,
    now = new Date(),
  ): Promise<SubscriptionPaymentOrderLock | null> {
    return await runAsSystem(async () => {
      const Order = mongoose.models.SubscriptionPaymentOrder as Model<ISubscriptionPaymentOrder>;
      const staleBefore = new Date(now.getTime() - FULFILLING_LOCK_TTL_MS);
      const updated = (await Order.findOneAndUpdate(
        {
          outTradeNo,
          $or: [
            { status: { $in: ['paid', 'failed'] } },
            {
              status: 'fulfilling',
              $or: [{ fulfillingAt: { $lte: staleBefore } }, { fulfillingAt: { $exists: false } }],
            },
          ],
        },
        {
          $set: {
            status: 'fulfilling',
            fulfillingAt: now,
          },
          $unset: {
            failedAt: '',
            failedReason: '',
          },
        },
        { new: true, runValidators: true },
      ).lean()) as ISubscriptionPaymentOrder | null;

      if (!updated?.fulfillingAt) {
        return null;
      }

      return { fulfillingAt: updated.fulfillingAt };
    });
  }

  async function markSubscriptionOrderCompleted(
    outTradeNo: string,
    fulfillingAt: Date,
  ): Promise<ISubscriptionPaymentOrder | null> {
    return await runAsSystem(async () => {
      const Order = mongoose.models.SubscriptionPaymentOrder as Model<ISubscriptionPaymentOrder>;
      return (await Order.findOneAndUpdate(
        {
          outTradeNo,
          status: 'fulfilling',
          fulfillingAt,
        },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
          },
        },
        { new: true, runValidators: true },
      ).lean()) as ISubscriptionPaymentOrder | null;
    });
  }

  async function markSubscriptionOrderFailed(
    outTradeNo: string,
    reason: string,
    fulfillingAt: Date,
  ): Promise<ISubscriptionPaymentOrder | null> {
    return await runAsSystem(async () => {
      const Order = mongoose.models.SubscriptionPaymentOrder as Model<ISubscriptionPaymentOrder>;
      return (await Order.findOneAndUpdate(
        {
          outTradeNo,
          status: 'fulfilling',
          fulfillingAt,
        },
        {
          $set: {
            status: 'failed',
            failedAt: new Date(),
            failedReason: reason,
          },
        },
        { new: true, runValidators: true },
      ).lean()) as ISubscriptionPaymentOrder | null;
    });
  }

  async function createOrExtendUserSubscription(
    input: CreateOrExtendUserSubscriptionInput,
  ): Promise<IUserSubscription | null> {
    validateCreateOrExtendUserSubscriptionInput(input);

    return await runAsSystem(async () => {
      const UserSubscription = mongoose.models.UserSubscription as Model<IUserSubscription>;
      const user = toObjectId(input.user);
      const sourceOrderId = toObjectId(input.sourceOrderId);
      const tenantFilter = getTenantFilter(input.tenantId);
      const now = input.now ?? new Date();
      const durationMs = input.durationDays * DAY_MS;
      const fulfillmentKey = getFulfillmentKey(user, tenantFilter.tenantId);
      const findBySourceOrder = async (): Promise<IUserSubscription | null> =>
        (await UserSubscription.findOne({
          ...getFulfilledSourceOrderFilter(sourceOrderId),
          ...tenantFilter,
        }).lean()) as IUserSubscription | null;
      const findByFulfillmentKey = async (): Promise<IUserSubscription | null> =>
        (await UserSubscription.findOne({
          fulfillmentKey,
          ...tenantFilter,
        }).lean()) as IUserSubscription | null;
      const extendSubscription = async (
        subscription: IUserSubscription,
      ): Promise<IUserSubscription | null> => {
        const isCurrent =
          subscription.status === 'active' && subscription.expiresAt.getTime() > now.getTime();
        const startsAt = isCurrent ? subscription.startsAt : now;
        const baseExpiresAt = isCurrent ? subscription.expiresAt : now;
        const expiresAt = new Date(baseExpiresAt.getTime() + durationMs);

        return (await UserSubscription.findOneAndUpdate(
          {
            _id: subscription._id,
            expiresAt: subscription.expiresAt,
            sourceOrderId: { $ne: sourceOrderId },
            sourceOrderIds: { $ne: sourceOrderId },
            ...tenantFilter,
          },
          {
            $set: {
              planKey: input.planKey,
              status: 'active',
              startsAt,
              expiresAt,
              sourceOrderId,
              fulfillmentKey,
            },
            $addToSet: {
              sourceOrderIds: {
                $each: getSourceOrderIdsToAdd(subscription.sourceOrderId, sourceOrderId),
              },
            },
          },
          { new: true, runValidators: true },
        ).lean()) as IUserSubscription | null;
      };

      for (let attempt = 0; attempt < MAX_SUBSCRIPTION_EXTENSION_ATTEMPTS; attempt++) {
        const existingSourceOrder = await findBySourceOrder();

        if (existingSourceOrder) {
          return existingSourceOrder;
        }

        const fulfilledSubscription = await findByFulfillmentKey();
        if (fulfilledSubscription) {
          const updated = await extendSubscription(fulfilledSubscription);

          if (updated) {
            return updated;
          }

          continue;
        }

        const activeSubscription = (await UserSubscription.findOne({
          user,
          status: 'active',
          expiresAt: { $gt: now },
          ...tenantFilter,
        })
          .sort({ expiresAt: -1 })
          .lean()) as IUserSubscription | null;

        if (!activeSubscription) {
          try {
            const subscription = await UserSubscription.create({
              user,
              planKey: input.planKey,
              status: 'active',
              startsAt: now,
              expiresAt: new Date(now.getTime() + durationMs),
              sourceOrderId,
              sourceOrderIds: [sourceOrderId],
              fulfillmentKey,
              ...tenantFilter,
            });

            return subscription.toObject() as IUserSubscription;
          } catch (error) {
            if (!isDuplicateKeyError(error)) {
              throw error;
            }

            const existingAfterDuplicate = await findBySourceOrder();
            if (existingAfterDuplicate) {
              return existingAfterDuplicate;
            }

            continue;
          }
        }

        const updated = await extendSubscription(activeSubscription);

        if (updated) {
          return updated;
        }
      }

      const existingSourceOrder = await findBySourceOrder();
      if (existingSourceOrder) {
        return existingSourceOrder;
      }

      throw new Error('Subscription fulfillment conflict: retry limit exceeded');
    });
  }

  return {
    upsertSubscriptionPlan,
    listSubscriptionPlans,
    getSubscriptionPlan,
    createSubscriptionPlan,
    updateSubscriptionPlan,
    deleteSubscriptionPlan,
    listSubscriptionQuotaExemptions,
    createSubscriptionQuotaExemption,
    deleteSubscriptionQuotaExemption,
    isSubscriptionQuotaExempt,
    getEnabledSubscriptionPlans,
    findActiveUserSubscription,
    consumeSubscriptionQuota,
    createSubscriptionPaymentOrder,
    findSubscriptionPaymentOrderByTradeNo,
    getSubscriptionPaymentOrder,
    markSubscriptionOrderPaid,
    markSubscriptionOrderFulfilling,
    markSubscriptionOrderCompleted,
    markSubscriptionOrderFailed,
    createOrExtendUserSubscription,
  };
}

export type SubscriptionMethods = ReturnType<typeof createSubscriptionMethods>;
