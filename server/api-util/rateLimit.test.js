const { rateLimit } = require('./rateLimit');

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.set = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
};

describe('rateLimit', () => {
  let time;
  let limiter;
  const hit = (ip = '203.0.113.7') => {
    const res = mockRes();
    const next = jest.fn();
    limiter({ ip }, res, next);
    return { res, next };
  };

  beforeEach(() => {
    time = 0;
    limiter = rateLimit({ windowMs: 60000, max: 2, now: () => time });
  });

  it('lets requests through up to the limit', () => {
    expect(hit().next).toHaveBeenCalled();
    expect(hit().next).toHaveBeenCalled();
  });

  it('answers 429 with Retry-After once the limit is passed', () => {
    hit();
    hit();
    time = 15000;
    const { res, next } = hit();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', '45');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 429, statusText: 'too-many-requests' })
    );
  });

  it('counts each IP separately', () => {
    hit();
    hit();

    expect(hit('198.51.100.1').next).toHaveBeenCalled();
  });

  it('starts a new window once the old one has passed', () => {
    hit();
    hit();
    time = 60000;

    expect(hit().next).toHaveBeenCalled();
  });
});
