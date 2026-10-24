const { sendApiError } = require('./apiError');

/**
 * Express middleware that allows at most `max` requests per client IP in each `windowMs` window,
 * and answers 429 after that.
 *
 * Counts live in this server process, so with several dynos the effective limit is `max` times the
 * dyno count. Behind Heroku's router, SERVER_SHARETRIBE_TRUST_PROXY must be 'true', otherwise
 * `req.ip` is the router's address and every caller shares one bucket.
 *
 * @param {Object} options
 * @param {Number} options.windowMs window length in milliseconds
 * @param {Number} options.max requests allowed per IP in one window
 * @param {Function} [options.now] clock, for tests
 * @returns {Function} Express middleware
 */
exports.rateLimit = ({ windowMs, max, now = Date.now }) => {
  const hits = new Map();
  let lastSweep = now();

  return function rateLimitMiddleware(req, res, next) {
    const time = now();

    // Drop expired windows so memory stays bounded by the callers of one window.
    if (time - lastSweep >= windowMs) {
      hits.forEach((entry, key) => {
        if (entry.resetAt <= time) {
          hits.delete(key);
        }
      });
      lastSweep = time;
    }

    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= time) {
      hits.set(key, { count: 1, resetAt: time + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - time) / 1000)));
      return sendApiError(res, 429, 'too-many-requests');
    }
    return next();
  };
};
