const { trustProxySetting } = require('./trustProxy');

describe('trustProxySetting', () => {
  it('leaves the Express default when the value is missing', () => {
    expect(trustProxySetting(null)).toBeNull();
    expect(trustProxySetting(undefined)).toBeNull();
    expect(trustProxySetting('')).toBeNull();
  });

  it('turns true and false into booleans', () => {
    expect(trustProxySetting('true')).toBe(true);
    expect(trustProxySetting('false')).toBe(false);
  });

  it('turns a whole number into a hop count', () => {
    expect(trustProxySetting('1')).toBe(1);
    expect(trustProxySetting('2')).toBe(2);
  });

  it('passes a list of trusted addresses through', () => {
    expect(trustProxySetting('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
  });
});
