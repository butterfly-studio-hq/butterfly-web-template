/**
 * Sends an error from a local API endpoint in the same shape as `handleError` in `sdk.js`, with a
 * short code and no internal details. `src/util/api.js` turns it into a rejected Error.
 *
 * @param {Object} res Express response
 * @param {Number} status HTTP status
 * @param {String} code short machine-readable reason, e.g. 'listing-not-found'
 */
exports.sendApiError = (res, status, code) => {
  res
    .status(status)
    .json({
      name: 'LocalAPIError',
      message: 'Local API request failed',
      status,
      statusText: code,
    })
    .end();
};
