process.env.REACT_APP_MARKETPLACE_ROOT_URL = 'http://localhost:3000';

const apiRouter = require('./apiRouter');

const routeHandlerNames = path => {
  const layer = apiRouter.stack.find(l => l.route?.path === path);
  return layer.route.stack.map(l => l.name);
};

describe('apiRouter', () => {
  it('rate limits /stripe-account-for-listing before the handler runs', () => {
    const names = routeHandlerNames('/stripe-account-for-listing');

    expect(names.length).toBeGreaterThan(1);
    expect(names[0]).toBe('rateLimitMiddleware');
  });
});
