const { providerStripeAccountIdForCheckout } = require('./providerStripeAccount');

const LISTING_ID = '5f4d2b1a-3c6e-4b7f-9a8d-1e2f3a4b5c6d';
const AUTHOR_ID = { uuid: '6a5b4c3d-2e1f-4a0b-8c9d-0e1f2a3b4c5d' };

const fakeSdks = ({
  banned = false,
  state = 'published',
  author = AUTHOR_ID,
  included = [{ type: 'stripeAccount', attributes: { stripeAccountId: 'acct_seller' } }],
} = {}) => ({
  sdk: {
    currentUser: {
      show: jest.fn(() => Promise.resolve({ data: { data: { attributes: { banned } } } })),
    },
    listings: {
      show: jest.fn(() =>
        Promise.resolve({
          data: {
            data: {
              attributes: { state },
              relationships: author ? { author: { data: { id: author, type: 'user' } } } : {},
            },
          },
        })
      ),
    },
  },
  integrationSdk: {
    users: { show: jest.fn(() => Promise.resolve({ data: { data: {}, included } })) },
  },
});

const run = sdks => providerStripeAccountIdForCheckout({ ...sdks, listingId: LISTING_ID });

describe('providerStripeAccountIdForCheckout', () => {
  it('returns the account id of the author of a published listing', async () => {
    const sdks = fakeSdks();

    await expect(run(sdks)).resolves.toBe('acct_seller');
    expect(sdks.sdk.currentUser.show).toHaveBeenCalledWith({ 'fields.currentUser': ['banned'] });
    expect(sdks.sdk.listings.show).toHaveBeenCalledWith({
      id: expect.objectContaining({ uuid: LISTING_ID }),
      include: ['author'],
      'fields.listing': ['state'],
      'fields.user': ['profile.displayName'],
    });
    expect(sdks.integrationSdk.users.show).toHaveBeenCalledWith({
      id: AUTHOR_ID,
      include: ['stripeAccount'],
      'fields.stripeAccount': ['stripeAccountId'],
    });
  });

  it('returns null when the seller has not connected Stripe', async () => {
    await expect(run(fakeSdks({ included: [] }))).resolves.toBeNull();
  });

  it.each(['closed', 'draft', 'pendingApproval'])(
    'refuses a %s listing with 404 and never calls the Integration API',
    async state => {
      const sdks = fakeSdks({ state });

      await expect(run(sdks)).rejects.toMatchObject({ status: 404 });
      expect(sdks.integrationSdk.users.show).not.toHaveBeenCalled();
    }
  );

  it('refuses a listing without an author with 404', async () => {
    await expect(run(fakeSdks({ author: null }))).rejects.toMatchObject({ status: 404 });
  });

  it('refuses a banned user with 403 before reading the listing', async () => {
    const sdks = fakeSdks({ banned: true });

    await expect(run(sdks)).rejects.toMatchObject({ status: 403 });
    expect(sdks.sdk.listings.show).not.toHaveBeenCalled();
  });

  it('keeps the status of a Marketplace API refusal', async () => {
    const sdks = fakeSdks();
    sdks.sdk.currentUser.show.mockRejectedValue(Object.assign(new Error('x'), { status: 401 }));

    await expect(run(sdks)).rejects.toMatchObject({ status: 401 });
    expect(sdks.sdk.listings.show).not.toHaveBeenCalled();
  });

  it('turns an Integration API failure into an error without a status', async () => {
    const sdks = fakeSdks();
    const apiError = Object.assign(new Error('bad credentials'), { status: 401 });
    sdks.integrationSdk.users.show.mockRejectedValue(apiError);

    const error = await run(sdks).catch(e => e);

    expect(error.status).toBeUndefined();
    expect(error.cause).toBe(apiError);
  });
});
