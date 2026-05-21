import { startSubscriptionOrderReconciliation } from './reconciliation';

describe('startSubscriptionOrderReconciliation', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('invokes reconcileOrder on stuck subscription payment orders', async () => {
    jest.useFakeTimers();
    const listStuckSubscriptionPaymentOrders = jest.fn().mockResolvedValue([
      { outTradeNo: 'lc_stuck_1' },
      { outTradeNo: 'lc_stuck_2' },
    ]);
    const reconcileOrder = jest.fn().mockResolvedValue({ status: 'completed', changed: true });
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const stop = startSubscriptionOrderReconciliation({
      db: { listStuckSubscriptionPaymentOrders },
      paymentService: { reconcileOrder },
      intervalMs: 1000,
      batchSize: 2,
      ageMs: 15 * 60_000,
      logger,
    });

    await jest.advanceTimersByTimeAsync(1000);
    stop();

    expect(listStuckSubscriptionPaymentOrders).toHaveBeenCalledWith({
      olderThan: expect.any(Date),
      limit: 2,
      statuses: ['pending', 'paid', 'fulfilling'],
    });
    expect(reconcileOrder).toHaveBeenCalledTimes(2);
    expect(reconcileOrder).toHaveBeenNthCalledWith(1, 'lc_stuck_1');
    expect(reconcileOrder).toHaveBeenNthCalledWith(2, 'lc_stuck_2');
  });
});
