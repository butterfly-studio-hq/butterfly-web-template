/**
 * Turns the SERVER_SHARETRIBE_TRUST_PROXY env value into Express's 'trust proxy' setting.
 *
 * - 'true' / 'false' become booleans. With `true`, Express trusts every hop, so `req.ip` is the
 *   leftmost X-Forwarded-For entry, which the client controls.
 * - A whole number becomes a hop count. Express ignores a numeric string, so it has to be a Number.
 *   On Heroku use 1: the router is the one proxy, and `req.ip` is then the address it saw.
 * - Anything else (e.g. 'loopback, 10.0.0.0/8') is passed through as a list of trusted addresses.
 *
 * @param {String|null} value the env value
 * @returns {Boolean|Number|String|null} the setting, or null to leave Express's default
 */
exports.trustProxySetting = value => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value === 'true' || value === 'false') {
    return value === 'true';
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return value;
};
