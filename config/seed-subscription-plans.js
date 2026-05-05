const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
require('./helpers');

createModels(mongoose);
const db = require('~/models');
const connect = require('./connect');

const plans = [
  {
    key: 'free',
    name: 'Free',
    description: 'Default free quota',
    price: 0,
    durationDays: 30,
    textDailyLimit: 20,
    imageDailyLimit: 2,
    enabled: true,
    sortOrder: 0,
  },
  {
    key: 'pro_monthly',
    name: 'Pro Monthly',
    description: 'Monthly subscription for regular usage',
    price: 29.9,
    durationDays: 30,
    textDailyLimit: 300,
    imageDailyLimit: 30,
    enabled: true,
    sortOrder: 10,
  },
];

(async () => {
  await connect();

  for (const plan of plans) {
    await db.upsertSubscriptionPlan(plan);
    console.green(`Seeded subscription plan: ${plan.key}`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (error) => {
  console.red(`Failed to seed subscription plans: ${error.message}`);
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
