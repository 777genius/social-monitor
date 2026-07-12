import {
  minimumScanIntervalSecondsForProvider,
  providerScanCadenceProfile,
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

  it('exposes conservative default scan cadences without coupling scan cadence to digest cadence', () => {
    expect(providerScanCadenceProfile('reddit')).toEqual({
      minimumIntervalSeconds: 900,
      defaultIntervalSeconds: 1_800,
      defaultFreshnessSeconds: 1_800,
      defaultRetryBudget: 3,
    });
    expect(providerScanCadenceProfile('github-trending-page')).toEqual({
      minimumIntervalSeconds: 86_400,
      defaultIntervalSeconds: 86_400,
      defaultFreshnessSeconds: 86_400,
      defaultRetryBudget: 1,
    });
    expect(providerScanCadenceProfile('unknown-provider')).toEqual({
      minimumIntervalSeconds: 900,
      defaultIntervalSeconds: 1_800,
      defaultFreshnessSeconds: 1_800,
      defaultRetryBudget: 2,
    });
  });
});
