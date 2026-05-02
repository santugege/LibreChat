import type { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';
import type {
  ISubscriptionPlan,
  IUserSubscription,
  SubscriptionQuotaKind,
  ISubscriptionUsageEvent,
  ISubscriptionUsageBucket,
} from '~/types';
import { runAsSystem } from '~/config/tenantContext';

type ObjectIdInput = string | Types.ObjectId;
type UsageField = 'textUsed' | 'imageUsed';
type RequestIdsField = 'textRequestIds' | 'imageRequestIds';
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
  description?: string;
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

function getTenantFilter(tenantId?: string): { tenantId: string | null } {
  return { tenantId: tenantId ?? null };
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
    throw new Error('Invalid subscription quota input: windowStart and windowEnd must be valid Dates');
  }

  if (input.windowEnd.getTime() <= input.windowStart.getTime()) {
    throw new Error('Invalid subscription quota input: windowEnd must be after windowStart');
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
  return field === 'textRequestIds' ? { textRequestIds: requestId } : { imageRequestIds: requestId };
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
    throw new Error('Subscription quota requestId collision: existing usage event dimensions differ');
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

      const existingEvent = (await Event.findOne(eventQuery).lean()) as ISubscriptionUsageEvent | null;
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
            const existing = (await Event.findOne(eventQuery).lean()) as ISubscriptionUsageEvent | null;
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

  return {
    upsertSubscriptionPlan,
    getEnabledSubscriptionPlans,
    findActiveUserSubscription,
    consumeSubscriptionQuota,
  };
}

export type SubscriptionMethods = ReturnType<typeof createSubscriptionMethods>;
