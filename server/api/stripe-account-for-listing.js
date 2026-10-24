const { getSdk, getIntegrationSdk, serialize } = require('../api-util/sdk');
const { sendApiError } = require('../api-util/apiError');
const { providerStripeAccountIdForCheckout } = require('../api-util/providerStripeAccount');
const log = require('../log');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REFUSAL_CODES = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'listing-not-found',
};

// The body must be exactly { listingId: '<uuid string>' }. Returns null for anything else.
const parseBody = body => {
  const isPlainObject = !!body && typeof body === 'object' && !Array.isArray(body);
  if (!isPlainObject) {
    return null;
  }
  const keys = Object.keys(body);
  const { listingId } = body;
  const isValid =
    keys.length === 1 &&
    keys[0] === 'listingId' &&
    typeof listingId === 'string' &&
    UUID_PATTERN.test(listingId);
  return isValid ? { listingId } : null;
};

/**
 * Returns the seller's Stripe Connect account id for a listing the caller can check out.
 *
 * Used by the checkout page to initialise the Payment Request Button (Apple Pay / Google Pay /
 * Stripe Link) with `onBehalfOf`, so the wallet sheet's merchant matches the `on_behalf_of` account
 * on the Sharetribe-created PaymentIntent.
 *
 * Auth: a logged-in user who is not banned, for a published listing only. See
 * `providerStripeAccountIdForCheckout`. Rate limited per IP in `apiRouter.js`.
 */
module.exports = (req, res) => {
  const input = parseBody(req.body);
  if (!input) {
    return sendApiError(res, 400, 'invalid-listing-id');
  }

  const integrationSdk = getIntegrationSdk();
  if (!integrationSdk) {
    // Integration SDK credentials aren't configured. The client hides the wallet button.
    return sendApiError(res, 501, 'integration-sdk-not-configured');
  }

  const sdk = getSdk(req, res);

  return providerStripeAccountIdForCheckout({ sdk, integrationSdk, listingId: input.listingId })
    .then(providerStripeAccountId => {
      res
        .status(200)
        .set('Content-Type', 'application/transit+json')
        .send(serialize({ data: { providerStripeAccountId } }))
        .end();
    })
    .catch(e => {
      const refusalCode = REFUSAL_CODES[e.status];
      if (refusalCode) {
        return sendApiError(res, e.status, refusalCode);
      }
      log.error(e, 'stripe-account-for-listing-failed', {});
      return sendApiError(res, 500, 'stripe-account-lookup-failed');
    });
};
