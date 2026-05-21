import { logger as defaultLogger } from '@librechat/data-schemas';

import type {
  ReconcileSubscriptionPaymentOrderResult,
  SubscriptionPaymentOrderStatus,
} from './payment/service';

type Logger = {
  info?: (message: string, meta?: object) => void;
  warn?: (message: string, meta?: object) => void;
  error?: (message: string, meta?: object) => void;
};

type StuckSubscriptionPaymentOrder = {
  outTradeNo: string;
};

type SubscriptionOrderReconciliationDb = {
  listStuckSubscriptionPaymentOrders: (input: {
    olderThan: Date;
    limit: number;
    statuses: SubscriptionPaymentOrderStatus[];
  }) => Promise<StuckSubscriptionPaymentOrder[]>;
};

type SubscriptionOrderReconciliationPaymentService = {
  reconcileOrder: (outTradeNo: string) => Promise<ReconcileSubscriptionPaymentOrderResult>;
};

export type StartSubscriptionOrderReconciliationInput = {
  paymentService: SubscriptionOrderReconciliationPaymentService;
  db: SubscriptionOrderReconciliationDb;
  intervalMs?: number;
  batchSize?: number;
  ageMs?: number;
  logger?: Logger;
};

export type StopSubscriptionOrderReconciliation = () => void;

const defaultIntervalMs = 5 * 60_000;
const defaultBatchSize = 50;
const defaultAgeMs = 15 * 60_000;
const stuckOrderStatuses: SubscriptionPaymentOrderStatus[] = ['pending', 'paid', 'fulfilling'];

export function startSubscriptionOrderReconciliation(
  input: StartSubscriptionOrderReconciliationInput,
): StopSubscriptionOrderReconciliation {
  const intervalMs = input.intervalMs ?? defaultIntervalMs;
  const batchSize = input.batchSize ?? defaultBatchSize;
  const ageMs = input.ageMs ?? defaultAgeMs;
  const log = input.logger ?? defaultLogger;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) {
      return;
    }

    running = true;
    try {
      const olderThan = new Date(Date.now() - ageMs);
      const orders = await input.db.listStuckSubscriptionPaymentOrders({
        olderThan,
        limit: batchSize,
        statuses: stuckOrderStatuses,
      });

      for (const order of orders) {
        try {
          const result = await input.paymentService.reconcileOrder(order.outTradeNo);
          log.info?.('[subscriptions] Reconciled stuck payment order', {
            outTradeNo: order.outTradeNo,
            status: result.status,
            changed: result.changed,
          });
        } catch (error) {
          log.warn?.('[subscriptions] Failed to reconcile stuck payment order', {
            outTradeNo: order.outTradeNo,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      log.error?.('[subscriptions] Payment order reconciliation sweep failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => {
    clearInterval(timer);
  };
}
