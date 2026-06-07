import {
  createRedemptionService,
  hashRedemptionCode,
  normalizeRedemptionCode,
  type RedemptionServiceDb,
} from './redemption';

const now = new Date('2026-06-07T00:00:00.000Z');

const batch = {
  _id: 'batch-1',
  name: 'Taobao',
  quantity: 2,
  durationDays: 30,
  textDailyLimit: 1000,
  imageDailyLimit: 20,
  planKey: 'redeem-30d-1000t-20i',
  planName: 'Taobao',
  createdBy: 'admin-1',
};

function createRedemptionDb(overrides: Partial<RedemptionServiceDb> = {}): RedemptionServiceDb {
  return {
    createSubscriptionRedemptionBatch: async () => batch,
    insertSubscriptionRedemptionCodes: async (codes) =>
      codes.map((code, index) => ({
        ...code,
        _id: `code-${index + 1}`,
      })),
    redeemSubscriptionRedemptionCode: async () => null,
    createOrExtendUserSubscription: async () => null,
    ...overrides,
  };
}

describe('subscription redemption service', () => {
  test('normalizes pasted codes', () => {
    expect(normalizeRedemptionCode(' lc-abcd efgh ')).toBe('LC-ABCDEFGH');
    expect(normalizeRedemptionCode('lc-abcd-efgh')).toBe('LC-ABCDEFGH');
  });

  test('hashes normalized codes with the redemption secret', () => {
    expect(hashRedemptionCode(' lc-abcd efgh ', 'secret')).toBe(
      hashRedemptionCode('LC-ABCD-EFGH', 'secret'),
    );
    expect(hashRedemptionCode('LC-ABCD-EFGH', 'other-secret')).not.toBe(
      hashRedemptionCode('LC-ABCD-EFGH', 'secret'),
    );
  });

  test('generates plaintext once and stores only hashed codes', async () => {
    const inserted: Parameters<RedemptionServiceDb['insertSubscriptionRedemptionCodes']>[0] = [];
    const createdBatches: Parameters<
      RedemptionServiceDb['createSubscriptionRedemptionBatch']
    >[0][] = [];
    const service = createRedemptionService({
      secret: 'secret',
      now: () => now,
      db: createRedemptionDb({
        createSubscriptionRedemptionBatch: async (input) => {
          createdBatches.push(input);
          return { ...batch, ...input, _id: 'batch-1' };
        },
        insertSubscriptionRedemptionCodes: async (codes) => {
          inserted.push(...codes);
          return codes.map((code, index) => ({ ...code, _id: `code-${index + 1}` }));
        },
      }),
    });

    const result = await service.createBatch({
      adminUser: { id: 'admin-1', tenantId: 'tenant-a' },
      body: {
        name: ' Taobao ',
        quantity: 2,
        durationDays: 30,
        textDailyLimit: 1000,
        imageDailyLimit: 20,
        expiresAt: '2026-12-31T00:00:00.000Z',
        campaign: 'sku-30d',
      },
    });

    expect(result.codes).toHaveLength(2);
    expect(result.codes[0].code).toMatch(/^LC-/);
    expect(result.codes[0].expiresAt).toBe('2026-12-31T00:00:00.000Z');
    expect(createdBatches[0]).toMatchObject({
      name: 'Taobao',
      quantity: 2,
      durationDays: 30,
      textDailyLimit: 1000,
      imageDailyLimit: 20,
      planKey: 'redeem-30d-1000t-20i',
      planName: 'Taobao',
      campaign: 'sku-30d',
      createdBy: 'admin-1',
      tenantId: 'tenant-a',
    });
    expect(inserted).toHaveLength(2);
    expect(inserted[0].codeHash).toBe(hashRedemptionCode(result.codes[0].code, 'secret'));
    expect(inserted[0].codeHash).not.toBe(result.codes[0].code);
    expect(inserted[0]).not.toHaveProperty('code');
    expect(inserted[0].codePrefix).toBe(result.codes[0].prefix);
    expect(inserted[0]).toMatchObject({
      batch: 'batch-1',
      durationDays: 30,
      textDailyLimit: 1000,
      imageDailyLimit: 20,
      tenantId: 'tenant-a',
    });
  });

  test('redeems code into a subscription using the redemption code id as fulfillment source', async () => {
    let redeemInput: Parameters<RedemptionServiceDb['redeemSubscriptionRedemptionCode']>[0];
    let subscriptionInput: Parameters<
      RedemptionServiceDb['createOrExtendUserSubscription']
    >[0];
    const service = createRedemptionService({
      secret: 'secret',
      now: () => now,
      db: createRedemptionDb({
        redeemSubscriptionRedemptionCode: async (input) => {
          redeemInput = input;
          return {
            _id: 'code-1',
            batch: 'batch-1',
            codeHash: input.codeHash,
            codePrefix: 'LC-ABCD',
            status: 'redeemed',
            durationDays: 30,
            textDailyLimit: 1000,
            imageDailyLimit: 20,
            planKey: 'redeem-30d',
            planName: 'Taobao 30 Day',
            planAmount: 0,
            sourceSubscriptionId: 'code-1',
          };
        },
        createOrExtendUserSubscription: async (input) => {
          subscriptionInput = input;
          return {
            _id: 'sub-1',
            user: input.user,
            planKey: input.planKey,
            status: 'active',
            startsAt: now,
            expiresAt: new Date('2026-07-07T00:00:00.000Z'),
          };
        },
      }),
    });

    const result = await service.redeem({
      user: { id: 'user-1', tenantId: 'tenant-a' },
      body: { code: ' lc-abcd efgh ' },
    });

    expect(redeemInput!).toMatchObject({
      codeHash: hashRedemptionCode('LC-ABCDEFGH', 'secret'),
      user: 'user-1',
      now,
      tenantId: 'tenant-a',
    });
    expect(subscriptionInput!).toMatchObject({
      user: 'user-1',
      planKey: 'redeem-30d',
      durationDays: 30,
      sourceOrderId: 'code-1',
      now,
      tenantId: 'tenant-a',
      planName: 'Taobao 30 Day',
      planAmount: 0,
      textDailyLimit: 1000,
      imageDailyLimit: 20,
    });
    expect(result.subscription).toEqual({
      planKey: 'redeem-30d',
      status: 'active',
      startsAt: '2026-06-07T00:00:00.000Z',
      expiresAt: '2026-07-07T00:00:00.000Z',
    });
    expect(result.plan).toMatchObject({
      key: 'redeem-30d',
      name: 'Taobao 30 Day',
      price: 0,
      durationDays: 30,
      textDailyLimit: 1000,
      imageDailyLimit: 20,
    });
  });

  test('rejects unavailable and invalid redemption codes', async () => {
    const service = createRedemptionService({
      secret: 'secret',
      now: () => now,
      db: createRedemptionDb(),
    });

    await expect(
      service.redeem({ user: { id: 'user-1' }, body: { code: 'short' } }),
    ).rejects.toThrow('Invalid redemption code');
    await expect(
      service.redeem({ user: { id: 'user-1' }, body: { code: 'LC-DOES-NOT-EXIST' } }),
    ).rejects.toThrow('Invalid redemption code');
  });
});
