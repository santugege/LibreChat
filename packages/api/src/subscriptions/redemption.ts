import { createHash, randomBytes } from 'crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_MAX_BATCH_SIZE = 500;

type ObjectIdLike = string | { toString: () => string };

export type RedemptionRouteUser = {
  id: string;
  tenantId?: string;
};

export type CreateRedemptionBatchBody = {
  name: string;
  quantity: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey?: string;
  planName?: string;
  planDescription?: string;
  planAmount?: number;
  expiresAt?: string;
  note?: string;
  campaign?: string;
};

export type RedeemRedemptionCodeBody = {
  code: string;
};

type BatchLike = {
  _id: ObjectIdLike;
  name: string;
  quantity: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey: string;
  planName: string;
  planDescription?: string;
  planAmount?: number;
  expiresAt?: Date;
  note?: string;
  campaign?: string;
  createdBy: ObjectIdLike;
  tenantId?: string | null;
  createdAt?: Date;
};

type CodeLike = {
  _id: ObjectIdLike;
  batch?: ObjectIdLike;
  codeHash?: string;
  codePrefix?: string;
  status?: 'active' | 'redeemed' | 'disabled' | 'expired';
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey: string;
  planName: string;
  planDescription?: string;
  planAmount?: number;
  expiresAt?: Date;
  sourceSubscriptionId?: ObjectIdLike;
};

type SubscriptionLike = {
  _id?: ObjectIdLike;
  user?: ObjectIdLike;
  planKey: string;
  status: 'active' | 'expired' | 'cancelled';
  startsAt: Date;
  expiresAt: Date;
};

export type RedemptionServiceDb = {
  createSubscriptionRedemptionBatch: (input: {
    name: string;
    quantity: number;
    durationDays: number;
    textDailyLimit: number;
    imageDailyLimit: number;
    planKey: string;
    planName: string;
    planDescription?: string;
    planAmount?: number;
    expiresAt?: Date;
    note?: string;
    campaign?: string;
    createdBy: string;
    tenantId?: string;
  }) => Promise<BatchLike | null>;
  insertSubscriptionRedemptionCodes: (
    inputs: Array<{
      batch: ObjectIdLike;
      codeHash: string;
      codePrefix: string;
      durationDays: number;
      textDailyLimit: number;
      imageDailyLimit: number;
      planKey: string;
      planName: string;
      planDescription?: string;
      planAmount?: number;
      expiresAt?: Date;
      note?: string;
      tenantId?: string;
    }>,
  ) => Promise<CodeLike[]>;
  redeemSubscriptionRedemptionCode: (input: {
    codeHash: string;
    user: string;
    now: Date;
    tenantId?: string;
  }) => Promise<CodeLike | null>;
  createOrExtendUserSubscription: (input: {
    user: string;
    planKey: string;
    durationDays: number;
    sourceOrderId: ObjectIdLike;
    now: Date;
    tenantId?: string;
    planName?: string;
    planDescription?: string;
    planAmount?: number;
    textDailyLimit?: number;
    imageDailyLimit?: number;
  }) => Promise<SubscriptionLike | null>;
};

export type CreateRedemptionServiceDeps = {
  db: RedemptionServiceDb;
  secret?: string;
  maxBatchSize?: number;
  now?: () => Date;
};

export function normalizeRedemptionCode(code: string): string {
  const compact = code
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');

  return compact.startsWith('LC') ? `LC-${compact.slice(2)}` : compact;
}

export function hashRedemptionCode(code: string, secret: string): string {
  return createHash('sha256').update(`${normalizeRedemptionCode(code)}:${secret}`).digest('hex');
}

function generateCode(): string {
  const bytes = randomBytes(16);
  let chars = '';

  for (const byte of bytes) {
    chars += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }

  return `LC-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(
    12,
    16,
  )}`;
}

function getOptionalDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Invalid redemption expiration date');
  }

  return date;
}

function assertInteger(value: number, name: string, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Invalid redemption request: ${name}`);
  }
}

function getPlanKey(body: CreateRedemptionBatchBody): string {
  return (
    body.planKey?.trim() ||
    `redeem-${body.durationDays}d-${body.textDailyLimit}t-${body.imageDailyLimit}i`
  );
}

function getPlanName(body: CreateRedemptionBatchBody): string {
  return body.planName?.trim() || body.name.trim();
}

function getCodePrefix(code: string): string {
  return code.slice(0, 7);
}

function getSecret(secret?: string): string {
  const value = secret ?? process.env.REDEMPTION_CODE_SECRET ?? process.env.JWT_SECRET;

  if (!value?.trim()) {
    throw new Error('REDEMPTION_CODE_SECRET or JWT_SECRET is required');
  }

  return value;
}

function serializeSubscription(subscription: SubscriptionLike) {
  return {
    planKey: subscription.planKey,
    status: subscription.status,
    startsAt: subscription.startsAt.toISOString(),
    expiresAt: subscription.expiresAt.toISOString(),
  };
}

function serializeBatch(batch: BatchLike) {
  return {
    id: batch._id.toString(),
    name: batch.name,
    quantity: batch.quantity,
    durationDays: batch.durationDays,
    textDailyLimit: batch.textDailyLimit,
    imageDailyLimit: batch.imageDailyLimit,
    planKey: batch.planKey,
    planName: batch.planName,
    ...(batch.expiresAt ? { expiresAt: batch.expiresAt.toISOString() } : {}),
    ...(batch.campaign ? { campaign: batch.campaign } : {}),
    ...(batch.createdAt ? { createdAt: batch.createdAt.toISOString() } : {}),
  };
}

export function createRedemptionService(deps: CreateRedemptionServiceDeps) {
  const secret = getSecret(deps.secret);
  const getNow = deps.now ?? (() => new Date());
  const maxBatchSize = deps.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;

  async function createBatch(input: {
    adminUser: RedemptionRouteUser;
    body: CreateRedemptionBatchBody;
  }) {
    const body = input.body;
    const name = body.name.trim();

    if (!name) {
      throw new Error('Invalid redemption request: name');
    }

    assertInteger(body.quantity, 'quantity', 1);
    assertInteger(body.durationDays, 'durationDays', 1);
    assertInteger(body.textDailyLimit, 'textDailyLimit', 0);
    assertInteger(body.imageDailyLimit, 'imageDailyLimit', 0);

    if (body.quantity > maxBatchSize) {
      throw new Error('Invalid redemption request: quantity exceeds maximum');
    }

    const expiresAt = getOptionalDate(body.expiresAt);
    const planKey = getPlanKey(body);
    const planName = getPlanName(body);
    const batch = await deps.db.createSubscriptionRedemptionBatch({
      name,
      quantity: body.quantity,
      durationDays: body.durationDays,
      textDailyLimit: body.textDailyLimit,
      imageDailyLimit: body.imageDailyLimit,
      planKey,
      planName,
      ...(body.planDescription ? { planDescription: body.planDescription } : {}),
      ...(body.planAmount !== undefined ? { planAmount: body.planAmount } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      ...(body.note ? { note: body.note } : {}),
      ...(body.campaign ? { campaign: body.campaign } : {}),
      createdBy: input.adminUser.id,
      ...(input.adminUser.tenantId ? { tenantId: input.adminUser.tenantId } : {}),
    });

    if (!batch) {
      throw new Error('Failed to create redemption batch');
    }

    const plaintextCodes = Array.from({ length: body.quantity }, () => generateCode());
    await deps.db.insertSubscriptionRedemptionCodes(
      plaintextCodes.map((code) => ({
        batch: batch._id,
        codeHash: hashRedemptionCode(code, secret),
        codePrefix: getCodePrefix(code),
        durationDays: body.durationDays,
        textDailyLimit: body.textDailyLimit,
        imageDailyLimit: body.imageDailyLimit,
        planKey,
        planName,
        ...(body.planDescription ? { planDescription: body.planDescription } : {}),
        ...(body.planAmount !== undefined ? { planAmount: body.planAmount } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        ...(body.note ? { note: body.note } : {}),
        ...(input.adminUser.tenantId ? { tenantId: input.adminUser.tenantId } : {}),
      })),
    );

    return {
      batch: serializeBatch(batch),
      codes: plaintextCodes.map((code) => ({
        code,
        prefix: getCodePrefix(code),
        ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
      })),
    };
  }

  async function redeem(input: { user: RedemptionRouteUser; body: RedeemRedemptionCodeBody }) {
    const code = normalizeRedemptionCode(input.body.code);

    if (code.length < 8 || code.length > 64) {
      throw new Error('Invalid redemption code');
    }

    const now = getNow();
    const redeemed = await deps.db.redeemSubscriptionRedemptionCode({
      codeHash: hashRedemptionCode(code, secret),
      user: input.user.id,
      now,
      ...(input.user.tenantId ? { tenantId: input.user.tenantId } : {}),
    });

    if (!redeemed) {
      throw new Error('Invalid redemption code');
    }

    const sourceOrderId = redeemed.sourceSubscriptionId ?? redeemed._id;
    const subscription = await deps.db.createOrExtendUserSubscription({
      user: input.user.id,
      planKey: redeemed.planKey,
      durationDays: redeemed.durationDays,
      sourceOrderId,
      now,
      ...(input.user.tenantId ? { tenantId: input.user.tenantId } : {}),
      planName: redeemed.planName,
      ...(redeemed.planDescription ? { planDescription: redeemed.planDescription } : {}),
      ...(redeemed.planAmount !== undefined ? { planAmount: redeemed.planAmount } : {}),
      textDailyLimit: redeemed.textDailyLimit,
      imageDailyLimit: redeemed.imageDailyLimit,
    });

    if (!subscription) {
      throw new Error('Redemption fulfillment failed');
    }

    return {
      subscription: serializeSubscription(subscription),
      plan: {
        key: redeemed.planKey,
        name: redeemed.planName,
        ...(redeemed.planDescription ? { description: redeemed.planDescription } : {}),
        price: redeemed.planAmount ?? 0,
        durationDays: redeemed.durationDays,
        textDailyLimit: redeemed.textDailyLimit,
        imageDailyLimit: redeemed.imageDailyLimit,
        enabled: true,
        sortOrder: 0,
      },
    };
  }

  return {
    createBatch,
    redeem,
  };
}
