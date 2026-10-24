const { sendApiError } = require('./apiError');

describe('sendApiError', () => {
  it('sends the local API error shape with only a status and a code', () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.end = jest.fn(() => res);

    sendApiError(res, 404, 'listing-not-found');

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      name: 'LocalAPIError',
      message: 'Local API request failed',
      status: 404,
      statusText: 'listing-not-found',
    });
    expect(res.end).toHaveBeenCalled();
  });
});
