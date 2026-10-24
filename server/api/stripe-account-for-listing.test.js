jest.mock('../api-util/sdk', () => ({
  getSdk: jest.fn(),
  getIntegrationSdk: jest.fn(),
  serialize: jest.fn(),
}));
jest.mock('../log', () => ({ error: jest.fn() }));

const { getSdk, getIntegrationSdk, serialize } = require('../api-util/sdk');
const stripeAccountForListing = require('./stripe-account-for-listing');

const LISTING_ID = '5f4d2b1a-3c6e-4b7f-9a8d-1e2f3a4b5c6d';
const AUTHOR_ID = '6a5b4c3d-2e1f-4a0b-8c9d-0e1f2a3b4c5d';
const STRIPE_ACCOUNT_ID = 'acct_seller';

const listingResponse = state => ({
  data: {
    data: {
      id: { uuid: LISTING_ID },
      type: 'listing',
      attributes: { state },
      relationships: { author: { data: { id: { uuid: AUTHOR_ID }, type: 'user' } } },
    },
  },
});

const notFound = () => Object.assign(new Error('Not found'), { status: 404, data: {} });

const fakeSdks = ({ loggedIn = true, banned = false, marketplaceListing, integrationListing }) => {
  const sdk = {
    currentUser: {
      show: jest.fn(() =>
        loggedIn
          ? Promise.resolve({ data: { data: { id: { uuid: 'buyer' }, attributes: { banned } } } })
          : Promise.reject(Object.assign(new Error('Unauthorized'), { status: 401, data: {} }))
      ),
    },
    listings: {
      show: jest.fn(() =>
        marketplaceListing ? Promise.resolve(marketplaceListing) : Promise.reject(notFound())
      ),
    },
  };
  const integrationSdk = {
    listings: {
      show: jest.fn(() =>
        integrationListing ? Promise.resolve(integrationListing) : Promise.reject(notFound())
      ),
    },
    users: {
      show: jest.fn(() =>
        Promise.resolve({
          data: {
            data: { id: { uuid: AUTHOR_ID }, type: 'user' },
            included: [
              { type: 'stripeAccount', attributes: { stripeAccountId: STRIPE_ACCOUNT_ID } },
            ],
          },
        })
      ),
    },
  };
  getSdk.mockReturnValue(sdk);
  getIntegrationSdk.mockReturnValue(integrationSdk);
  return { sdk, integrationSdk };
};

// Resolves once the handler has finished the response, whichever way it sends the body.
const call = body =>
  new Promise(resolve => {
    const res = { headers: {} };
    const finish = payload => {
      res.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
      resolve(res);
      return res;
    };
    res.status = jest.fn(code => {
      res.statusCode = code;
      return res;
    });
    res.set = jest.fn((key, value) => {
      res.headers[key] = value;
      return res;
    });
    res.send = jest.fn(finish);
    res.json = jest.fn(finish);
    res.end = jest.fn(() => res);
    stripeAccountForListing({ body, ip: '203.0.113.7' }, res);
  });

describe('stripe-account-for-listing', () => {
  // The Jest config resets mock implementations before each test.
  beforeEach(() => {
    serialize.mockImplementation(data => JSON.stringify(data));
  });

  it('returns the seller account id for a published listing', async () => {
    const { integrationSdk } = fakeSdks({
      marketplaceListing: listingResponse('published'),
      integrationListing: listingResponse('published'),
    });

    const res = await call({ listingId: LISTING_ID });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(STRIPE_ACCOUNT_ID);
    expect(integrationSdk.users.show).toHaveBeenCalledWith(
      expect.objectContaining({
        id: { uuid: AUTHOR_ID },
        include: ['stripeAccount'],
        'fields.stripeAccount': ['stripeAccountId'],
      })
    );
  });

  it('refuses a closed listing without reading the seller', async () => {
    const { integrationSdk } = fakeSdks({
      marketplaceListing: listingResponse('closed'),
      integrationListing: listingResponse('closed'),
    });

    const res = await call({ listingId: LISTING_ID });

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(STRIPE_ACCOUNT_ID);
    expect(integrationSdk.users.show).not.toHaveBeenCalled();
  });

  it('refuses a draft listing, which only the Integration API can see', async () => {
    const { integrationSdk } = fakeSdks({
      marketplaceListing: null,
      integrationListing: listingResponse('draft'),
    });

    const res = await call({ listingId: LISTING_ID });

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(STRIPE_ACCOUNT_ID);
    expect(integrationSdk.users.show).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not logged in, before reading the listing', async () => {
    const { sdk, integrationSdk } = fakeSdks({
      loggedIn: false,
      marketplaceListing: listingResponse('published'),
      integrationListing: listingResponse('published'),
    });

    const res = await call({ listingId: LISTING_ID });

    expect(res.statusCode).toBe(401);
    expect(sdk.listings.show).not.toHaveBeenCalled();
    expect(integrationSdk.listings.show).not.toHaveBeenCalled();
    expect(integrationSdk.users.show).not.toHaveBeenCalled();
  });

  it('refuses a banned user', async () => {
    const { integrationSdk } = fakeSdks({
      banned: true,
      marketplaceListing: listingResponse('published'),
      integrationListing: listingResponse('published'),
    });

    const res = await call({ listingId: LISTING_ID });

    expect(res.statusCode).toBe(403);
    expect(integrationSdk.users.show).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', undefined],
    ['a missing listingId', {}],
    ['a listingId that is not a UUID', { listingId: 'not-a-uuid' }],
    ['a listingId that is not a string', { listingId: { uuid: LISTING_ID } }],
    ['extra fields', { listingId: LISTING_ID, userId: AUTHOR_ID }],
  ])('rejects %s with 400 before calling Sharetribe', async (_, body) => {
    const { sdk, integrationSdk } = fakeSdks({
      marketplaceListing: listingResponse('published'),
      integrationListing: listingResponse('published'),
    });

    const res = await call(body);

    expect(res.statusCode).toBe(400);
    expect(sdk.currentUser.show).not.toHaveBeenCalled();
    expect(integrationSdk.users.show).not.toHaveBeenCalled();
  });

  it('answers 501 when the Integration SDK is not configured', async () => {
    fakeSdks({ marketplaceListing: listingResponse('published') });
    getIntegrationSdk.mockReturnValue(null);

    const res = await call({ listingId: LISTING_ID });

    expect(res.statusCode).toBe(501);
  });

  it('sends no internal details when the Integration API fails', async () => {
    const { integrationSdk } = fakeSdks({
      marketplaceListing: listingResponse('published'),
      integrationListing: listingResponse('published'),
    });
    integrationSdk.users.show.mockRejectedValue(new Error('Integration API secret mismatch'));

    const res = await call({ listingId: LISTING_ID });

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret mismatch');
  });
});
