const {
  createQuotaService,
  createSubscriptionRouter,
  createSubscriptionPaymentService,
} = require('@librechat/api');
const db = require('~/models');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

module.exports = createSubscriptionRouter({
  db,
  requireJwtAuth,
  createQuotaService: (quotaDeps) => createQuotaService(quotaDeps),
  createPaymentService: () => createSubscriptionPaymentService(db),
});
