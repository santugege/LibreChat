const {
  createQuotaService,
  createSubscriptionRouter,
  createSubscriptionPaymentService,
} = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const db = require('~/models');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { requireCapability } = require('~/server/middleware/roles/capabilities');

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

module.exports = createSubscriptionRouter({
  db,
  requireJwtAuth,
  requireAdminAccess,
  createQuotaService: (quotaDeps) => createQuotaService(quotaDeps),
  createPaymentService: () => createSubscriptionPaymentService(db),
});
