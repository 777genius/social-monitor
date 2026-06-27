import {
  minimumScanIntervalSecondsForProvider,
  validateProviderScanCadence,
} from './scan-cadence-policy';

describe('scan cadence policy', () => {
  it('enforces daily cadence for canonical and legacy X provider keys', () => {
    expect(minimumScanIntervalSecondsForProvider('x-twitter')).toBe(86_400);
    expect(minimumScanIntervalSecondsForProvider('x-twitter-experimental-daily')).toBe(86_400);

    expect(validateProviderScanCadence({
      providerKey: 'x-twitter',
      intervalSeconds: 3_600,
    })?.details).toEqual({
      providerKey: 'x-twitter',
      intervalSeconds: 3_600,
      minimumIntervalSeconds: 86_400,
    });
    expect(validateProviderScanCadence({
      providerKey: 'x-twitter',
      intervalSeconds: 86_400,
    })).toBeNull();
  });
});
