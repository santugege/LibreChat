import express from 'express';

import type {
  TSubscriptionAdminOrder,
  TSubscriptionAdminOrdersResponse,
  TSubscriptionOrderStatus,
} from 'librechat-data-provider';
import type { QuotaServiceDeps } from './quota';
import type {
  CreateZPayOrderInput,
  CreateZPayOrderResult,
  ReconcileSubscriptionPaymentOrderOptions,
  ReconcileSubscriptionPaymentOrderResult,
  SubscriptionPaymentObjectId,
  SubscriptionPaymentOrderStatus,
} from './payment/service';
import { logger } from '@librechat/data-schemas';
import { signEasyPay } from './payment/easypay';
import type { SubscriptionPlanView } from './types';
import { parsePagination } from '../admin/pagination';
import { getSubscriptionConfig } from './config';
import { createQuotaService } from './quota';
import { getQuotaWindow } from './windows';

type RouteUser = {
  id?: string;
  _id?: SubscriptionPaymentObjectId;
  tenantId?: string | null;
};

type SubscriptionRequest = express.Request & {
  user?: RouteUser;
};

type ActiveSubscription = {
  planKey: string;
  planName?: string;
  planDescription?: string;
  planAmount?: number;
  textDailyLimit?: number;
  imageDailyLimit?: number;
  status?: 'active' | 'expired' | 'cancelled';
  startsAt?: Date;
  expiresAt?: Date;
};

type SubscriptionPaymentOrderView = {
  _id: SubscriptionPaymentObjectId;
  outTradeNo: string;
  status: SubscriptionPaymentOrderStatus;
  planKey: string;
  amount: number;
  payUrl?: string;
  qrCode?: string;
  qrImageUrl?: string;
  expiresAt: Date;
  completedAt?: Date;
  createdAt?: Date;
};

type SubscriptionAdminPaymentOrderView = {
  id: string;
  outTradeNo: string;
  tradeNo?: string;
  userId: string;
  user?: {
    id: string;
    name?: string;
    username?: string;
    email?: string;
    avatar?: string;
  };
  planKey: string;
  amount: number;
  paymentType: 'alipay' | 'wxpay';
  status: TSubscriptionOrderStatus;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
  paidAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  failedReason?: string;
};

type CountSubscriptionPaymentOrdersInput = {
  status?: TSubscriptionOrderStatus;
  tenantId?: string;
};

type ListSubscriptionPaymentOrdersInput = CountSubscriptionPaymentOrdersInput & {
  limit: number;
  offset: number;
};

type SubscriptionQuotaExemptionView = {
  email: string;
  tenantId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

type SubscriptionUsageBucketView = {
  textUsed: number;
  imageUsed: number;
};

type SubscriptionRouteDb = {
  listSubscriptionPlans: (tenantId?: string) => Promise<SubscriptionPlanView[]>;
  createSubscriptionPlan: (
    input: SubscriptionPlanView & { tenantId?: string },
  ) => Promise<SubscriptionPlanView | null>;
  updateSubscriptionPlan: (
    key: string,
    input: Partial<Omit<SubscriptionPlanView, 'key'>>,
    tenantId?: string,
  ) => Promise<SubscriptionPlanView | null>;
  deleteSubscriptionPlan: (key: string, tenantId?: string) => Promise<SubscriptionPlanView | null>;
  listSubscriptionQuotaExemptions: (tenantId?: string) => Promise<SubscriptionQuotaExemptionView[]>;
  createSubscriptionQuotaExemption: (input: {
    email: string;
    tenantId?: string;
  }) => Promise<SubscriptionQuotaExemptionView | null>;
  deleteSubscriptionQuotaExemption: (
    email: string,
    tenantId?: string,
  ) => Promise<SubscriptionQuotaExemptionView | null>;
  isSubscriptionQuotaExempt: (email: string, tenantId?: string) => Promise<boolean>;
  getEnabledSubscriptionPlans: (tenantId?: string) => Promise<SubscriptionPlanView[]>;
  findActiveUserSubscription: (
    user: string,
    now?: Date,
    tenantId?: string,
  ) => Promise<ActiveSubscription | null>;
  consumeSubscriptionQuota: QuotaServiceDeps['consumeSubscriptionQuota'];
  getSubscriptionUsageBucket: (
    user: string,
    windowKey: string,
    tenantId?: string,
  ) => Promise<SubscriptionUsageBucketView | null>;
  getSubscriptionPaymentOrder: (
    orderId: string,
    user: string,
    tenantId?: string,
  ) => Promise<SubscriptionPaymentOrderView | null>;
  getSubscriptionPaymentOrderById: (
    orderId: string,
    tenantId?: string,
  ) => Promise<SubscriptionPaymentOrderView | null>;
  listSubscriptionPaymentOrders: (
    input: ListSubscriptionPaymentOrdersInput,
  ) => Promise<SubscriptionAdminPaymentOrderView[]>;
  countSubscriptionPaymentOrders: (input: CountSubscriptionPaymentOrdersInput) => Promise<number>;
};

type SubscriptionPaymentRouteService = {
  createOrder: (input: CreateZPayOrderInput) => Promise<CreateZPayOrderResult>;
  handleZPayNotify: (rawBody: string) => Promise<void>;
  reconcileOrder: (
    outTradeNo: string,
    options?: ReconcileSubscriptionPaymentOrderOptions,
  ) => Promise<ReconcileSubscriptionPaymentOrderResult>;
};

type SubscriptionStatusResponse = {
  plan: SubscriptionPlanView;
  subscription: {
    planKey: string;
    status: 'active' | 'expired' | 'cancelled';
    startsAt: string;
    expiresAt: string;
  } | null;
  usage: {
    windowKey: string;
    resetAt: string;
    text: { used: number; limit: number };
    image: { used: number; limit: number };
  };
};

type CreateSubscriptionRouterDeps = {
  db: SubscriptionRouteDb;
  requireJwtAuth: express.RequestHandler;
  requireAdminAccess: express.RequestHandler;
  createQuotaService?: (deps: QuotaServiceDeps) => ReturnType<typeof createQuotaService>;
  createPaymentService: (db: SubscriptionRouteDb) => SubscriptionPaymentRouteService;
};

type StringRecord = {
  [key: string]: string | string[] | number | boolean | null | undefined;
};

const invalidSubscriptionPlanRequestMessage = 'Invalid subscription plan request';
const invalidQuotaExemptionRequestMessage = 'Invalid subscription quota exemption request';
const invalidSubscriptionPaymentOrderRequestMessage = 'Invalid subscription payment order request';
const subscriptionOrderStatuses = new Set<TSubscriptionOrderStatus>([
  'pending',
  'paid',
  'fulfilling',
  'completed',
  'expired',
  'cancelled',
  'failed',
]);
const subscriptionPlanCreateKeys = [
  'key',
  'name',
  'description',
  'price',
  'durationDays',
  'textDailyLimit',
  'imageDailyLimit',
  'enabled',
  'sortOrder',
] as const;
const subscriptionPlanPatchKeys = subscriptionPlanCreateKeys.filter((key) => key !== 'key');
const quotaExemptionKeys = ['email'] as const;
const reconcilePollAgeMs = 20 * 1000;
const reconcilePollTerminalStatuses = new Set<SubscriptionPaymentOrderStatus>([
  'completed',
  'cancelled',
  'expired',
]);

function isObjectRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getObjectId(value: SubscriptionPaymentObjectId): string {
  return typeof value === 'string' ? value : value.toString();
}

function getAuthenticatedUser(req: express.Request): { id: string; tenantId?: string } {
  const user = (req as SubscriptionRequest).user;
  const id = user?.id ?? (user?._id ? getObjectId(user._id) : undefined);
  const tenantId = user?.tenantId ?? undefined;

  if (!id) {
    throw new Error('Authenticated user is required');
  }

  return {
    id,
    ...(tenantId ? { tenantId } : {}),
  };
}

function getCreateOrderBody(body: unknown): CreateZPayOrderInput['body'] {
  if (!isObjectRecord(body)) {
    throwInvalidSubscriptionPaymentOrderRequest();
  }

  const { planKey, paymentType, isMobile } = body;
  const isValidPaymentType = paymentType === 'alipay' || paymentType === 'wxpay';

  if (typeof planKey !== 'string' || !isValidPaymentType) {
    throwInvalidSubscriptionPaymentOrderRequest();
  }

  return {
    planKey,
    paymentType,
    ...(typeof isMobile === 'boolean' ? { isMobile } : {}),
  };
}

function getQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return getQueryString(value[0]);
  }

  return undefined;
}

function getAdminOrdersQuery(query: express.Request['query']): ListSubscriptionPaymentOrdersInput {
  const status = getQueryString(query.status);
  const pagination = parsePagination({
    limit: getQueryString(query.limit),
    offset: getQueryString(query.offset),
  });

  if (status && !subscriptionOrderStatuses.has(status as TSubscriptionOrderStatus)) {
    throwInvalidSubscriptionPaymentOrderRequest();
  }

  return {
    ...pagination,
    ...(status ? { status: status as TSubscriptionOrderStatus } : {}),
  };
}

function getNonemptyString(record: { [key: string]: unknown }, key: string): string {
  const value = record[key];

  if (typeof value !== 'string' || !value.trim()) {
    throwInvalidSubscriptionPlanRequest();
  }

  return value.trim();
}

function getOptionalDescription(record: {
  [key: string]: unknown;
}): Pick<SubscriptionPlanView, 'description'> {
  const value = record.description;

  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'string') {
    throwInvalidSubscriptionPlanRequest();
  }

  const description = value.trim();
  return description ? { description } : {};
}

function getPatchDescription(record: { [key: string]: unknown }): {
  description?: string | undefined;
} {
  const value = record.description;

  if (value === undefined || value === null) {
    return { description: undefined };
  }

  if (typeof value !== 'string') {
    throwInvalidSubscriptionPlanRequest();
  }

  const description = value.trim();
  return { description: description || undefined };
}

function getFiniteNumber(record: { [key: string]: unknown }, key: string): number {
  const value = record[key];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throwInvalidSubscriptionPlanRequest();
  }

  return value;
}

function getNonnegativeNumber(record: { [key: string]: unknown }, key: string): number {
  const value = getFiniteNumber(record, key);

  if (value < 0) {
    throwInvalidSubscriptionPlanRequest();
  }

  return value;
}

function getPositiveInteger(record: { [key: string]: unknown }, key: string): number {
  const value = getFiniteNumber(record, key);

  if (!Number.isInteger(value) || value <= 0) {
    throwInvalidSubscriptionPlanRequest();
  }

  return value;
}

function getNonnegativeInteger(record: { [key: string]: unknown }, key: string): number {
  const value = getFiniteNumber(record, key);

  if (!Number.isInteger(value) || value < 0) {
    throwInvalidSubscriptionPlanRequest();
  }

  return value;
}

function getInteger(record: { [key: string]: unknown }, key: string): number {
  const value = getFiniteNumber(record, key);

  if (!Number.isInteger(value)) {
    throwInvalidSubscriptionPlanRequest();
  }

  return value;
}

function getBoolean(record: { [key: string]: unknown }, key: string): boolean {
  const value = record[key];

  if (typeof value !== 'boolean') {
    throwInvalidSubscriptionPlanRequest();
  }

  return value;
}

function getSubscriptionPlanBody(body: unknown): SubscriptionPlanView {
  if (!isObjectRecord(body)) {
    throwInvalidSubscriptionPlanRequest();
  }

  assertAllowedKeys(body, subscriptionPlanCreateKeys);

  return {
    key: getNonemptyString(body, 'key'),
    name: getNonemptyString(body, 'name'),
    ...getOptionalDescription(body),
    price: getNonnegativeNumber(body, 'price'),
    durationDays: getPositiveInteger(body, 'durationDays'),
    textDailyLimit: getNonnegativeInteger(body, 'textDailyLimit'),
    imageDailyLimit: getNonnegativeInteger(body, 'imageDailyLimit'),
    enabled: getBoolean(body, 'enabled'),
    sortOrder: getInteger(body, 'sortOrder'),
  };
}

function getSubscriptionPlanPatchBody(body: unknown): Partial<Omit<SubscriptionPlanView, 'key'>> {
  if (!isObjectRecord(body)) {
    throwInvalidSubscriptionPlanRequest();
  }

  assertAllowedKeys(body, subscriptionPlanPatchKeys);

  const patch: Partial<Omit<SubscriptionPlanView, 'key'>> = {};

  if (hasOwn(body, 'name')) {
    patch.name = getNonemptyString(body, 'name');
  }

  if (hasOwn(body, 'description')) {
    Object.assign(patch, getPatchDescription(body));
  }

  if (hasOwn(body, 'price')) {
    patch.price = getNonnegativeNumber(body, 'price');
  }

  if (hasOwn(body, 'durationDays')) {
    patch.durationDays = getPositiveInteger(body, 'durationDays');
  }

  if (hasOwn(body, 'textDailyLimit')) {
    patch.textDailyLimit = getNonnegativeInteger(body, 'textDailyLimit');
  }

  if (hasOwn(body, 'imageDailyLimit')) {
    patch.imageDailyLimit = getNonnegativeInteger(body, 'imageDailyLimit');
  }

  if (hasOwn(body, 'enabled')) {
    patch.enabled = getBoolean(body, 'enabled');
  }

  if (hasOwn(body, 'sortOrder')) {
    patch.sortOrder = getInteger(body, 'sortOrder');
  }

  return patch;
}

function hasOwn(record: { [key: string]: unknown }, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function assertAllowedKeys(
  record: { [key: string]: unknown },
  allowedKeys: readonly string[],
): void {
  Object.keys(record).forEach((key) => {
    if (!allowedKeys.includes(key)) {
      throwInvalidSubscriptionPlanRequest();
    }
  });
}

function throwInvalidSubscriptionPlanRequest(): never {
  throw new Error(invalidSubscriptionPlanRequestMessage);
}

function throwInvalidQuotaExemptionRequest(): never {
  throw new Error(invalidQuotaExemptionRequestMessage);
}

function throwInvalidSubscriptionPaymentOrderRequest(): never {
  throw new Error(invalidSubscriptionPaymentOrderRequestMessage);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getQuotaExemptionEmail(emailInput: unknown): string {
  if (typeof emailInput !== 'string') {
    throwInvalidQuotaExemptionRequest();
  }

  const email = normalizeEmail(emailInput);
  if (!/\S+@\S+\.\S+/.test(email)) {
    throwInvalidQuotaExemptionRequest();
  }

  return email;
}

function getQuotaExemptionBody(body: unknown): { email: string } {
  if (!isObjectRecord(body)) {
    throwInvalidQuotaExemptionRequest();
  }

  assertAllowedKeys(body, quotaExemptionKeys);
  return { email: getQuotaExemptionEmail(body.email) };
}

function isInvalidSubscriptionPlanRequest(error: unknown): boolean {
  return error instanceof Error && error.message === invalidSubscriptionPlanRequestMessage;
}

function isInvalidQuotaExemptionRequest(error: unknown): boolean {
  return error instanceof Error && error.message === invalidQuotaExemptionRequestMessage;
}

function isInvalidSubscriptionPaymentOrderRequest(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === invalidSubscriptionPaymentOrderRequestMessage ||
      error.message === 'Subscription plan is not available for checkout')
  );
}

function handleSubscriptionPlanRouteError(
  error: unknown,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (isInvalidSubscriptionPlanRequest(error)) {
    res.status(400).json({ message: invalidSubscriptionPlanRequestMessage });
    return;
  }

  next(error);
}

function handleQuotaExemptionRouteError(
  error: unknown,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (isInvalidQuotaExemptionRequest(error)) {
    res.status(400).json({ message: invalidQuotaExemptionRequestMessage });
    return;
  }

  next(error);
}

function handleSubscriptionPaymentOrderRouteError(
  error: unknown,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (isInvalidSubscriptionPaymentOrderRequest(error)) {
    res.status(400).json({ message: invalidSubscriptionPaymentOrderRequestMessage });
    return;
  }

  next(error);
}

function getActiveSubscriptionResponse(
  subscription: ActiveSubscription | null,
): SubscriptionStatusResponse['subscription'] {
  if (!subscription?.startsAt || !subscription.expiresAt) {
    return null;
  }

  return {
    planKey: subscription.planKey,
    status: subscription.status ?? 'active',
    startsAt: subscription.startsAt.toISOString(),
    expiresAt: subscription.expiresAt.toISOString(),
  };
}

function createStatusResponse(
  plan: SubscriptionPlanView,
  subscription: ActiveSubscription | null,
  now: Date,
  usageBucket: SubscriptionUsageBucketView | null,
): SubscriptionStatusResponse {
  const config = getSubscriptionConfig();
  const window = getQuotaWindow(now, config.timezone);

  return {
    plan,
    subscription: getActiveSubscriptionResponse(subscription),
    usage: {
      windowKey: window.windowKey,
      resetAt: window.windowEnd.toISOString(),
      text: { used: usageBucket?.textUsed ?? 0, limit: plan.textDailyLimit },
      image: { used: usageBucket?.imageUsed ?? 0, limit: plan.imageDailyLimit },
    },
  };
}

function getBodyRecord(body: unknown): StringRecord {
  return isObjectRecord(body) ? (body as StringRecord) : {};
}

function createRawFormBody(body: unknown): string {
  if (typeof body === 'string') {
    return body;
  }

  const params = new URLSearchParams();
  Object.entries(getBodyRecord(body)).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }

    params.set(key, String(value));
  });

  return params.toString();
}

function getRawQuery(req: express.Request): string {
  const queryStart = req.originalUrl.indexOf('?');
  return queryStart === -1 ? '' : req.originalUrl.slice(queryStart + 1);
}

function getWebhookField(rawBody: string, key: string): string | undefined {
  const value = new URLSearchParams(rawBody).get(key)?.trim();
  return value ? value : undefined;
}

function getWebhookSignatureValid(rawBody: string): boolean | undefined {
  const pkey = process.env.ZPAY_PKEY?.trim();

  if (!pkey) {
    return undefined;
  }

  const params: Record<string, string> = {};
  new URLSearchParams(rawBody).forEach((value, key) => {
    params[key] = value;
  });

  const sign = params.sign;
  if (!sign) {
    return false;
  }

  return signEasyPay(params, pkey) === sign;
}

function getWebhookLogContext(rawBody: string): {
  outTradeNo?: string;
  tradeNo?: string;
  tradeStatus?: string;
  sigValid?: boolean;
} {
  const sigValid = getWebhookSignatureValid(rawBody);
  const outTradeNo = getWebhookField(rawBody, 'out_trade_no');
  const tradeNo = getWebhookField(rawBody, 'trade_no');
  const tradeStatus = getWebhookField(rawBody, 'trade_status');

  return {
    ...(outTradeNo ? { outTradeNo } : {}),
    ...(tradeNo ? { tradeNo } : {}),
    ...(tradeStatus ? { tradeStatus } : {}),
    ...(sigValid !== undefined ? { sigValid } : {}),
  };
}

function shouldReconcilePolledOrder(order: SubscriptionPaymentOrderView, now = new Date()): boolean {
  if (reconcilePollTerminalStatuses.has(order.status)) {
    return false;
  }

  if (!order.createdAt) {
    return false;
  }

  return now.getTime() - order.createdAt.getTime() >= reconcilePollAgeMs;
}

function serializeOrder(order: SubscriptionPaymentOrderView) {
  return {
    orderId: getObjectId(order._id),
    outTradeNo: order.outTradeNo,
    status: order.status,
    ...(order.payUrl ? { payUrl: order.payUrl } : {}),
    ...(order.qrCode ? { qrCode: order.qrCode } : {}),
    ...(order.qrImageUrl ? { qrImageUrl: order.qrImageUrl } : {}),
    expiresAt: order.expiresAt.toISOString(),
    planKey: order.planKey,
    amount: order.amount,
    ...(order.completedAt ? { completedAt: order.completedAt.toISOString() } : {}),
  };
}

function serializeDate(date: Date | undefined): string | undefined {
  return date ? date.toISOString() : undefined;
}

function serializeAdminOrder(order: SubscriptionAdminPaymentOrderView): TSubscriptionAdminOrder {
  const createdAt = serializeDate(order.createdAt);
  const updatedAt = serializeDate(order.updatedAt);
  const paidAt = serializeDate(order.paidAt);
  const completedAt = serializeDate(order.completedAt);
  const failedAt = serializeDate(order.failedAt);

  return {
    id: order.id,
    outTradeNo: order.outTradeNo,
    ...(order.tradeNo ? { tradeNo: order.tradeNo } : {}),
    userId: order.userId,
    ...(order.user ? { user: order.user } : {}),
    planKey: order.planKey,
    amount: order.amount,
    paymentType: order.paymentType,
    status: order.status,
    expiresAt: order.expiresAt.toISOString(),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(paidAt ? { paidAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(failedAt ? { failedAt } : {}),
    ...(order.failedReason ? { failedReason: order.failedReason } : {}),
  };
}

function serializeQuotaExemption(exemption: SubscriptionQuotaExemptionView) {
  return {
    email: exemption.email,
    ...(exemption.tenantId ? { tenantId: exemption.tenantId } : {}),
    ...(exemption.createdAt ? { createdAt: new Date(exemption.createdAt).toISOString() } : {}),
    ...(exemption.updatedAt ? { updatedAt: new Date(exemption.updatedAt).toISOString() } : {}),
  };
}

export function createSubscriptionRouter(deps: CreateSubscriptionRouterDeps): express.Router {
  const router = express.Router();
  const getQuotaService = deps.createQuotaService ?? createQuotaService;
  const payment = deps.createPaymentService(deps.db);
  const quotaDeps: QuotaServiceDeps = {
    getPlans: deps.db.getEnabledSubscriptionPlans,
    findActiveUserSubscription: deps.db.findActiveUserSubscription,
    consumeSubscriptionQuota: deps.db.consumeSubscriptionQuota,
  };

  router.get('/plans', deps.requireJwtAuth, async (req, res, next) => {
    try {
      const user = getAuthenticatedUser(req);
      const plans = await deps.db.getEnabledSubscriptionPlans(user.tenantId);
      res.json(plans);
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', deps.requireJwtAuth, async (req, res, next) => {
    try {
      const user = getAuthenticatedUser(req);
      const now = new Date();
      const config = getSubscriptionConfig();
      const window = getQuotaWindow(now, config.timezone);
      const quota = getQuotaService(quotaDeps);
      const [plan, activeSubscription, usageBucket] = await Promise.all([
        quota.resolvePlan(user.id, now, user.tenantId),
        deps.db.findActiveUserSubscription(user.id, now, user.tenantId),
        deps.db.getSubscriptionUsageBucket(user.id, window.windowKey, user.tenantId),
      ]);

      res.json(createStatusResponse(plan, activeSubscription, now, usageBucket));
    } catch (error) {
      next(error);
    }
  });

  router.post('/orders', deps.requireJwtAuth, async (req, res, next) => {
    try {
      const user = getAuthenticatedUser(req);
      const order = await payment.createOrder({
        user,
        body: getCreateOrderBody(req.body),
        ip: req.ip,
      });

      res.status(201).json(order);
    } catch (error) {
      handleSubscriptionPaymentOrderRouteError(error, res, next);
    }
  });

  router.get('/orders/:orderId', deps.requireJwtAuth, async (req, res, next) => {
    try {
      const user = getAuthenticatedUser(req);
      let order = await deps.db.getSubscriptionPaymentOrder(
        req.params.orderId,
        user.id,
        user.tenantId,
      );

      if (!order) {
        res.status(404).json({ message: 'Subscription payment order not found' });
        return;
      }

      if (shouldReconcilePolledOrder(order)) {
        try {
          await payment.reconcileOrder(order.outTradeNo, { user: user.id });
          order =
            (await deps.db.getSubscriptionPaymentOrder(req.params.orderId, user.id, user.tenantId)) ??
            order;
        } catch (error) {
          logger.warn('[subscriptions] ZPay order polling reconcile failed', {
            orderId: req.params.orderId,
            outTradeNo: order.outTradeNo,
            error: error instanceof Error ? error.message : String(error),
          });
          order =
            (await deps.db.getSubscriptionPaymentOrder(req.params.orderId, user.id, user.tenantId)) ??
            order;
        }
      }

      res.json(serializeOrder(order));
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/admin/orders',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const query = getAdminOrdersQuery(req.query);
        const filter = {
          ...(query.status ? { status: query.status } : {}),
          ...(user.tenantId ? { tenantId: user.tenantId } : {}),
        };
        const [orders, total] = await Promise.all([
          deps.db.listSubscriptionPaymentOrders({
            ...filter,
            limit: query.limit,
            offset: query.offset,
          }),
          deps.db.countSubscriptionPaymentOrders(filter),
        ]);
        const response: TSubscriptionAdminOrdersResponse = {
          orders: orders.map(serializeAdminOrder),
          total,
          limit: query.limit,
          offset: query.offset,
        };

        res.json(response);
      } catch (error) {
        handleSubscriptionPaymentOrderRouteError(error, res, next);
      }
    },
  );

  router.post(
    '/admin/orders/:orderId/reconcile',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const order = await deps.db.getSubscriptionPaymentOrderById(
          req.params.orderId,
          user.tenantId,
        );

        if (!order) {
          res.status(404).json({ message: 'Subscription payment order not found' });
          return;
        }

        await payment.reconcileOrder(order.outTradeNo);
        const updated =
          (await deps.db.getSubscriptionPaymentOrderById(req.params.orderId, user.tenantId)) ??
          order;
        res.json(serializeOrder(updated));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/admin/plans',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const plans = await deps.db.listSubscriptionPlans(user.tenantId);
        res.json(plans);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/admin/plans',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const planInput = getSubscriptionPlanBody(req.body);
        const created = await deps.db.createSubscriptionPlan({
          ...planInput,
          ...(user.tenantId ? { tenantId: user.tenantId } : {}),
        });
        res.status(201).json(created);
      } catch (error) {
        handleSubscriptionPlanRouteError(error, res, next);
      }
    },
  );

  router.patch(
    '/admin/plans/:key',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const updated = await deps.db.updateSubscriptionPlan(
          req.params.key,
          getSubscriptionPlanPatchBody(req.body),
          user.tenantId,
        );

        if (!updated) {
          res.status(404).json({ message: 'Subscription plan not found' });
          return;
        }

        res.json(updated);
      } catch (error) {
        handleSubscriptionPlanRouteError(error, res, next);
      }
    },
  );

  router.delete(
    '/admin/plans/:key',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const deleted = await deps.db.deleteSubscriptionPlan(req.params.key, user.tenantId);

        if (!deleted) {
          res.status(404).json({ message: 'Subscription plan not found' });
          return;
        }

        res.json(deleted);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/admin/quota-exemptions',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const exemptions = await deps.db.listSubscriptionQuotaExemptions(user.tenantId);
        res.json(exemptions.map(serializeQuotaExemption));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/admin/quota-exemptions',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const created = await deps.db.createSubscriptionQuotaExemption({
          ...getQuotaExemptionBody(req.body),
          ...(user.tenantId ? { tenantId: user.tenantId } : {}),
        });
        res.status(201).json(created ? serializeQuotaExemption(created) : null);
      } catch (error) {
        handleQuotaExemptionRouteError(error, res, next);
      }
    },
  );

  router.delete(
    '/admin/quota-exemptions/:email',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const deleted = await deps.db.deleteSubscriptionQuotaExemption(
          getQuotaExemptionEmail(req.params.email),
          user.tenantId,
        );

        if (!deleted) {
          res.status(404).json({ message: 'Subscription quota exemption not found' });
          return;
        }

        res.json(serializeQuotaExemption(deleted));
      } catch (error) {
        handleQuotaExemptionRouteError(error, res, next);
      }
    },
  );

  router.get('/payment/webhook/zpay', async (req, res, next) => {
    const rawBody = getRawQuery(req);
    const context = getWebhookLogContext(rawBody);
    logger.info('[subscriptions] ZPay webhook received', context);
    try {
      await payment.handleZPayNotify(rawBody);
      res.status(200).send('success');
    } catch (error) {
      logger.warn('[subscriptions] ZPay webhook processing failed', {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(200).send('success');
    }
  });

  router.post(
    '/payment/webhook/zpay',
    express.urlencoded({ extended: false }),
    async (req, res, next) => {
      const rawBody = createRawFormBody(req.body);
      const context = getWebhookLogContext(rawBody);
      logger.info('[subscriptions] ZPay webhook received', context);
      try {
        await payment.handleZPayNotify(rawBody);
        res.status(200).send('success');
      } catch (error) {
        logger.warn('[subscriptions] ZPay webhook processing failed', {
          ...context,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(200).send('success');
      }
    },
  );

  return router;
}
