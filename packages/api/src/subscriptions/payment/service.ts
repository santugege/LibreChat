import { randomUUID } from 'crypto';

import type { EasyPayParams } from './easypay';
import { signEasyPay, verifyEasyPayNotify } from './easypay';

const ORDER_TTL_MS = 30 * 60 * 1000;
const AMOUNT_TOLERANCE = 0.001;
const ZPAY_FETCH_TIMEOUT_MS = 10 * 1000;
const ZPAY_RESPONSE_MAX_BYTES = 64 * 1024;

type ZPayEnvName =
  | 'ZPAY_API_BASE'
  | 'ZPAY_PID'
  | 'ZPAY_PKEY'
  | 'ZPAY_NOTIFY_URL'
  | 'ZPAY_RETURN_URL';

export type SubscriptionPaymentType = 'alipay' | 'wxpay';

export type SubscriptionPaymentOrderStatus =
  | 'pending'
  | 'paid'
  | 'fulfilling'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'failed';

export type SubscriptionPaymentObjectId = string | { toString: () => string };

export type SubscriptionPaymentPlan = {
  key: string;
  name: string;
  description?: string;
  price: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  enabled: boolean;
  sortOrder: number;
};

export type CreateSubscriptionPaymentOrderInput = {
  user: string;
  outTradeNo: string;
  tradeNo?: string;
  planKey: string;
  durationDays: number;
  amount: number;
  paymentType: SubscriptionPaymentType;
  status: 'pending';
  payUrl?: string;
  qrCode?: string;
  qrImageUrl?: string;
  expiresAt: Date;
  tenantId?: string;
};

export type SubscriptionPaymentOrder = {
  _id: SubscriptionPaymentObjectId;
  user: SubscriptionPaymentObjectId;
  outTradeNo: string;
  tradeNo?: string;
  planKey: string;
  durationDays?: number;
  amount: number;
  paymentType: SubscriptionPaymentType;
  status: SubscriptionPaymentOrderStatus;
  payUrl?: string;
  qrCode?: string;
  qrImageUrl?: string;
  rawNotify?: string;
  expiresAt?: Date;
  paidAt?: Date;
  fulfillingAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  failedReason?: string;
  tenantId?: string | null;
};

export type CreateOrExtendUserSubscriptionInput = {
  user: string;
  planKey: string;
  durationDays: number;
  sourceOrderId: SubscriptionPaymentObjectId;
  tenantId?: string;
};

export type SubscriptionPaymentUserSubscription = {
  _id: SubscriptionPaymentObjectId;
  user: SubscriptionPaymentObjectId;
  planKey: string;
  startsAt?: Date;
  expiresAt?: Date;
  sourceOrderId?: SubscriptionPaymentObjectId;
  sourceOrderIds?: SubscriptionPaymentObjectId[];
  tenantId?: string | null;
};

export type SubscriptionPaymentFulfillmentLock = {
  fulfillingAt: Date;
};

export type SubscriptionPaymentDb = {
  getEnabledSubscriptionPlans: (tenantId?: string) => Promise<SubscriptionPaymentPlan[]>;
  createSubscriptionPaymentOrder: (
    input: CreateSubscriptionPaymentOrderInput,
  ) => Promise<{ _id: SubscriptionPaymentObjectId } | null>;
  findSubscriptionPaymentOrderByTradeNo: (
    outTradeNo: string,
  ) => Promise<SubscriptionPaymentOrder | null>;
  markSubscriptionOrderPaid: (
    outTradeNo: string,
    tradeNo: string,
    rawNotify: string,
  ) => Promise<SubscriptionPaymentOrder | null>;
  markSubscriptionOrderFulfilling: (
    outTradeNo: string,
    now?: Date,
  ) => Promise<SubscriptionPaymentFulfillmentLock | null>;
  markSubscriptionOrderCompleted: (
    outTradeNo: string,
    fulfillingAt: Date,
  ) => Promise<SubscriptionPaymentOrder | null>;
  markSubscriptionOrderFailed: (
    outTradeNo: string,
    reason: string,
    fulfillingAt: Date,
  ) => Promise<SubscriptionPaymentOrder | null>;
  createOrExtendUserSubscription: (
    input: CreateOrExtendUserSubscriptionInput,
  ) => Promise<SubscriptionPaymentUserSubscription | null>;
};

export type CreateZPayOrderInput = {
  user: {
    id: string;
    tenantId?: string | null;
  };
  body: {
    planKey: string;
    paymentType: SubscriptionPaymentType;
    isMobile?: boolean;
  };
  ip?: string;
};

export type CreateZPayOrderResult = {
  orderId: string;
  outTradeNo: string;
  status: 'pending';
  payUrl?: string;
  qrCode?: string;
  qrImageUrl?: string;
  expiresAt: string;
};

type ZPayCreateResponse = {
  code: number | 'error';
  msg?: string;
  trade_no?: string;
  payurl?: string;
  payurl2?: string;
  qrcode?: string;
  img?: string;
};

function getRequiredEnv(name: ZPayEnvName): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function trimEndpointPath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '');
  const lower = trimmed.toLowerCase();
  const endpoint = ['/submit.php', '/mapi.php', '/api.php'].find((item) => lower.endsWith(item));

  if (!endpoint) {
    return trimmed;
  }

  return trimmed.slice(0, -endpoint.length).replace(/\/+$/, '');
}

export function normalizeZPayApiBase(apiBase: string): string {
  const trimmed = apiBase.trim();

  try {
    const parsed = new URL(trimmed);
    parsed.search = '';
    parsed.hash = '';
    parsed.pathname = trimEndpointPath(parsed.pathname);
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return trimEndpointPath(trimmed).replace(/\/+$/, '');
  }
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

function getRoundedAmount(value: number): number {
  return Number(formatAmount(value));
}

function createOutTradeNo(): string {
  return `lc_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function getOrderId(value: SubscriptionPaymentObjectId): string {
  return typeof value === 'string' ? value : value.toString();
}

function getTenantId(value?: string | null): string | undefined {
  return value ?? undefined;
}

function appendParams(body: URLSearchParams, params: EasyPayParams): void {
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value !== undefined) {
      body.set(key, value);
    }
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isObjectRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOptionalStringField(
  payload: { [key: string]: unknown },
  key: keyof ZPayCreateResponse,
): string | undefined {
  const value = payload[key];

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function getResponseCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getZPayCreateResponseCode(value: unknown): ZPayCreateResponse['code'] | null {
  if (value === 'error') {
    return value;
  }

  return getResponseCode(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function validatePaymentInstruction(value: string | undefined): void {
  if (value && !isHttpUrl(value)) {
    throw new Error('ZPay order creation response included invalid payment instructions');
  }
}

function validatePaymentInstructions(payload: ZPayCreateResponse): void {
  validatePaymentInstruction(payload.payurl);
  validatePaymentInstruction(payload.payurl2);
  validatePaymentInstruction(payload.qrcode);
  validatePaymentInstruction(payload.img);
}

async function readBoundedResponseBody(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > ZPAY_RESPONSE_MAX_BYTES) {
      throw new Error('ZPay order creation response too large');
    }

    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;

  while (true) {
    const result = await reader.read();

    if (result.done) {
      break;
    }

    bytes += result.value.byteLength;
    if (bytes > ZPAY_RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new Error('ZPay order creation response too large');
    }

    chunks.push(decoder.decode(result.value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join('');
}

function parseZPayCreateResponse(text: string): ZPayCreateResponse {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('ZPay order creation returned invalid JSON');
  }

  if (!isObjectRecord(parsed)) {
    throw new Error('ZPay order creation returned invalid response');
  }

  const code = getZPayCreateResponseCode(parsed.code);
  if (code === null) {
    throw new Error('ZPay order creation returned invalid response');
  }

  return {
    code,
    msg: getOptionalStringField(parsed, 'msg'),
    trade_no: getOptionalStringField(parsed, 'trade_no'),
    payurl: getOptionalStringField(parsed, 'payurl'),
    payurl2: getOptionalStringField(parsed, 'payurl2'),
    qrcode: getOptionalStringField(parsed, 'qrcode'),
    img: getOptionalStringField(parsed, 'img'),
  };
}

async function fetchZPayCreateResponse(
  url: string,
  init: Omit<RequestInit, 'signal'>,
): Promise<ZPayCreateResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ZPAY_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ZPay order creation failed with HTTP ${response.status}`);
    }

    const text = await readBoundedResponseBody(response);
    return parseZPayCreateResponse(text);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('ZPay order creation timed out');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function createSubscriptionPaymentService(db: SubscriptionPaymentDb) {
  async function findPlan(
    planKey: string,
    tenantId?: string,
  ): Promise<SubscriptionPaymentPlan | undefined> {
    const plans = await db.getEnabledSubscriptionPlans(tenantId);
    return plans.find((item) => item.key === planKey);
  }

  async function getPlan(planKey: string, tenantId?: string): Promise<SubscriptionPaymentPlan> {
    const plan = await findPlan(planKey, tenantId);

    if (!plan || !plan.enabled) {
      throw new Error('Subscription plan is not available');
    }

    return plan;
  }

  async function getCheckoutPlan(
    planKey: string,
    tenantId?: string,
  ): Promise<SubscriptionPaymentPlan> {
    const plan = await findPlan(planKey, tenantId);

    if (!plan || !plan.enabled || plan.price <= 0) {
      throw new Error('Subscription plan is not available for checkout');
    }

    return plan;
  }

  async function getFulfillmentDurationDays(
    order: SubscriptionPaymentOrder,
    tenantId?: string,
  ): Promise<number> {
    if (order.durationDays === undefined) {
      const plan = await getPlan(order.planKey, tenantId);
      return plan.durationDays;
    }

    if (!isPositiveInteger(order.durationDays)) {
      throw new Error('Invalid subscription payment order duration');
    }

    return order.durationDays;
  }

  async function createOrder(input: CreateZPayOrderInput): Promise<CreateZPayOrderResult> {
    const tenantId = getTenantId(input.user.tenantId);
    const plan = await getCheckoutPlan(input.body.planKey, tenantId);
    const apiBase = normalizeZPayApiBase(getRequiredEnv('ZPAY_API_BASE'));
    const pid = getRequiredEnv('ZPAY_PID');
    const pkey = getRequiredEnv('ZPAY_PKEY');
    const notifyUrl = getRequiredEnv('ZPAY_NOTIFY_URL');
    const returnUrl = getRequiredEnv('ZPAY_RETURN_URL');
    const now = Date.now();
    const outTradeNo = createOutTradeNo();
    const expiresAt = new Date(now + ORDER_TTL_MS);
    const amountText = formatAmount(plan.price);
    const amount = getRoundedAmount(plan.price);
    const params: EasyPayParams = {
      pid,
      type: input.body.paymentType,
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      return_url: returnUrl,
      name: plan.name,
      money: amountText,
      clientip: input.ip ?? '',
      ...(input.body.isMobile ? { device: 'mobile' } : {}),
    };
    const sign = signEasyPay(params, pkey);
    const body = new URLSearchParams();
    appendParams(body, params);
    body.set('sign', sign);
    body.set('sign_type', 'MD5');

    const payload = await fetchZPayCreateResponse(`${apiBase}/mapi.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (payload.code !== 1) {
      throw new Error(payload.msg || 'ZPay order creation failed');
    }

    validatePaymentInstructions(payload);
    const payUrl = input.body.isMobile && payload.payurl2 ? payload.payurl2 : payload.payurl;
    if (!payUrl && !payload.qrcode && !payload.img) {
      throw new Error('ZPay order creation response did not include payment instructions');
    }

    const order = await db.createSubscriptionPaymentOrder({
      user: input.user.id,
      ...(tenantId !== undefined ? { tenantId } : {}),
      outTradeNo,
      ...(payload.trade_no ? { tradeNo: payload.trade_no } : {}),
      planKey: plan.key,
      durationDays: plan.durationDays,
      amount,
      paymentType: input.body.paymentType,
      status: 'pending',
      ...(payUrl ? { payUrl } : {}),
      ...(payload.qrcode ? { qrCode: payload.qrcode } : {}),
      ...(payload.img ? { qrImageUrl: payload.img } : {}),
      expiresAt,
    });

    if (!order) {
      throw new Error('Subscription payment order was not created');
    }

    return {
      orderId: getOrderId(order._id),
      outTradeNo,
      status: 'pending',
      ...(payUrl ? { payUrl } : {}),
      ...(payload.qrcode ? { qrCode: payload.qrcode } : {}),
      ...(payload.img ? { qrImageUrl: payload.img } : {}),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async function handleZPayNotify(rawBody: string): Promise<void> {
    const notify = verifyEasyPayNotify(rawBody, getRequiredEnv('ZPAY_PKEY'));
    if (notify.pid !== getRequiredEnv('ZPAY_PID')) {
      throw new Error('EasyPay pid mismatch');
    }

    const order = await db.findSubscriptionPaymentOrderByTradeNo(notify.outTradeNo);

    if (!order) {
      throw new Error('Subscription payment order was not found');
    }

    if (Math.abs(order.amount - notify.amount) > AMOUNT_TOLERANCE) {
      throw new Error('Subscription payment amount mismatch');
    }

    if (!notify.success || order.status === 'completed') {
      return;
    }

    await db.markSubscriptionOrderPaid(notify.outTradeNo, notify.tradeNo, notify.rawBody);
    const lock = await db.markSubscriptionOrderFulfilling(notify.outTradeNo);

    if (!lock) {
      return;
    }

    try {
      const tenantId = getTenantId(order.tenantId);
      const durationDays = await getFulfillmentDurationDays(order, tenantId);
      const subscription = await db.createOrExtendUserSubscription({
        user: getOrderId(order.user),
        planKey: order.planKey,
        durationDays,
        sourceOrderId: order._id,
        ...(tenantId !== undefined ? { tenantId } : {}),
      });
      if (!subscription) {
        throw new Error('Subscription fulfillment did not create or extend a subscription');
      }
      const completed = await db.markSubscriptionOrderCompleted(
        notify.outTradeNo,
        lock.fulfillingAt,
      );
      if (!completed) {
        throw new Error('Subscription payment order completion failed');
      }
    } catch (error) {
      await db.markSubscriptionOrderFailed(
        notify.outTradeNo,
        getErrorMessage(error),
        lock.fulfillingAt,
      );
      throw error;
    }
  }

  return {
    createOrder,
    handleZPayNotify,
  };
}
