const rateLimit = require('express-rate-limit');
const { limiterCache, removePorts } = require('@librechat/api');

const redemptionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id ?? req.user?._id?.toString();
    return userId ? `user:${userId}` : `ip:${removePorts(req)}`;
  },
  store: limiterCache('subscription_redemption_limiter'),
});

module.exports = redemptionLimiter;
