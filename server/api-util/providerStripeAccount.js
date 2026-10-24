const { types } = require('sharetribe-flex-sdk');

const refusal = (status, code) => Object.assign(new Error(code), { status, code });

/**
 * Returns the Stripe Connect account id of the seller of a listing the current user can check out.
 * The checkout page needs it as `onBehalfOf` for the Payment Request Button, and it is not exposed
 * through the Marketplace API.
 *
 * Access: the caller must be a logged-in user who is not banned, and the listing must be published.
 * The listing is read through the caller's own Marketplace API session, which never shows other
 * users' drafts or pending listings. listings/show still returns closed listings by id, so the
 * state is checked as well. Only then is the Integration SDK used, for that one field.
 *
 * Marketplace API refusals keep their status (401, 403, 404). Integration API failures are thrown
 * without a status, so the caller treats them as server errors rather than as the user's fault.
 *
 * @param {Object} params
 * @param {Object} params.sdk Marketplace SDK acting as the caller
 * @param {Object} params.integrationSdk Integration SDK
 * @param {String} params.listingId listing UUID
 * @returns {Promise<String|null>} the account id, or null if the seller has not connected Stripe
 */
exports.providerStripeAccountIdForCheckout = ({ sdk, integrationSdk, listingId }) =>
  sdk.currentUser
    .show({ 'fields.currentUser': ['banned'] })
    .then(currentUserResponse => {
      if (currentUserResponse.data.data.attributes.banned) {
        throw refusal(403, 'forbidden');
      }
      return sdk.listings.show({
        id: new types.UUID(listingId),
        include: ['author'],
        'fields.listing': ['state'],
      });
    })
    .then(listingResponse => {
      const listing = listingResponse.data.data;
      const authorId = listing.relationships?.author?.data?.id;
      if (listing.attributes.state !== 'published' || !authorId) {
        throw refusal(404, 'listing-not-found');
      }
      return integrationSdk.users
        .show({
          id: authorId,
          include: ['stripeAccount'],
          'fields.stripeAccount': ['stripeAccountId'],
        })
        .catch(e => {
          throw Object.assign(new Error('Integration API user lookup failed'), { cause: e });
        });
    })
    .then(userResponse => {
      const included = userResponse.data.included || [];
      const stripeAccount = included.find(resource => resource.type === 'stripeAccount');
      return stripeAccount?.attributes?.stripeAccountId || null;
    });
