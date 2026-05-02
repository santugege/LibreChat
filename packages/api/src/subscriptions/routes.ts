import express from 'express';

import type { QuotaServiceDeps } from './quota';
import type {
  CreateZPayOrderInput,
  CreateZPayOrderResult,
  SubscriptionPaymentObjectId,
  SubscriptionPaymentOrderStatus,
} from './payment/service';
import type { SubscriptionPlanView } from './types';
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
  expiresAt: Date;
  completedAt?: Date;
};

type SubscriptionRouteDb = {
  getEnabledSubscriptionPlans: (tenantId?: string) => Promise<SubscriptionPlanView[]>;
  findActiveUserSubscription: (
    user: string,
    now?: Date,
    tenantId?: string,
  ) => Promise<ActiveSubscription | null>;
  consumeSubscriptionQuota: QuotaServiceDeps['consumeSubscriptionQuota'];
  getSubscriptionPaymentOrder: (
    orderId: string,
    user: string,
    tenantId?: string,
  ) => Promise<SubscriptionPaymentOrderView | null>;
};

type SubscriptionPaymentRouteService = {
  createOrder: (input: CreateZPayOrderInput) => Promise<CreateZPayOrderResult>;
  handleZPayNotify: (rawBody: string) => Promise<void>;
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
  createQuotaService?: (deps: QuotaServiceDeps) => ReturnType<typeof createQuotaService>;
  createPaymentService: (db: SubscriptionRouteDb) => SubscriptionPaymentRouteService;
};

type StringRecord = {
  [key: string]: string | string[] | number | boolean | null | undefined;
};

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
    throw new Error('Invalid subscription order request');
  }

  const { planKey, paymentType, isMobile } = body;
  const isValidPaymentType = paymentType === 'alipay' || paymentType === 'wxpay';

  if (typeof planKey !== 'string' || !isValidPaymentType) {
    throw new Error('Invalid subscription order request');
  }

  return {
    planKey,
    paymentType,
    ...(typeof isMobile === 'boolean' ? { isMobile } : {}),
  };
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
): SubscriptionStatusResponse {
  const config = getSubscriptionConfig();
  const window = getQuotaWindow(now, config.timezone);

  return {
    plan,
    subscription: getActiveSubscriptionResponse(subscription),
    usage: {
      windowKey: window.windowKey,
      resetAt: window.windowEnd.toISOString(),
      text: { used: 0, limit: plan.textDailyLimit },
      image: { used: 0, limit: plan.imageDailyLimit },
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

function serializeOrder(order: SubscriptionPaymentOrderView) {
  return {
    orderId: getObjectId(order._id),
    outTradeNo: order.outTradeNo,
    status: order.status,
    ...(order.payUrl ? { payUrl: order.payUrl } : {}),
    ...(order.qrCode ? { qrCode: order.qrCode } : {}),
    expiresAt: order.expiresAt.toISOString(),
    planKey: order.planKey,
    amount: order.amount,
    ...(order.completedAt ? { completedAt: order.completedAt.toISOString() } : {}),
  };
}

export function createSubscriptionRouter(deps: CreateSubscriptionRouterDeps): express.Router {
  const router = express.Router();
  const getQuotaService = deps.createQuotaService ?? createQuotaService;
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
      const quota = getQuotaService(quotaDeps);
      const [plan, activeSubscription] = await Promise.all([
        quota.resolvePlan(user.id, now, user.tenantId),
        deps.db.findActiveUserSubscription(user.id, now, user.tenantId),
      ]);

      res.json(createStatusResponse(plan, activeSubscription, now));
    } catch (error) {
      next(error);
    }
  });

  router.post('/orders', deps.requireJwtAuth, async (req, res, next) => {
    try {
      const user = getAuthenticatedUser(req);
      const payment = deps.createPaymentService(deps.db);
      const order = await payment.createOrder({
        user,
        body: getCreateOrderBody(req.body),
        ip: req.ip,
      });

      res.status(201).json(order);
    } catch (error) {
      next(error);
    }
  });

  router.get('/orders/:orderId', deps.requireJwtAuth, async (req, res, next) => {
    try {
      const user = getAuthenticatedUser(req);
      const order = await deps.db.getSubscriptionPaymentOrder(
        req.params.orderId,
        user.id,
        user.tenantId,
      );

      if (!order) {
        res.status(404).json({ message: 'Subscription payment order not found' });
        return;
      }

      res.json(serializeOrder(order));
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/payment/webhook/zpay',
    express.urlencoded({ extended: false }),
    async (req, res, next) => {
      try {
        const payment = deps.createPaymentService(deps.db);
        await payment.handleZPayNotify(createRawFormBody(req.body));
        res.status(200).send('success');
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
