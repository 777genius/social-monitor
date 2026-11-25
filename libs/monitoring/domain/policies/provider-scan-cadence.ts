import { DomainError } from '@social-monitor/shared-kernel';

export type ProviderScanCadenceProfile = {
  readonly minimumIntervalSeconds: number;
  readonly defaultIntervalSeconds: number;
  readonly defaultFreshnessSeconds: number;
  readonly defaultRetryBudget: number;
};

const fallbackProviderScanCadenceProfile: ProviderScanCadenceProfile = {
  minimumIntervalSeconds: 900,
  defaultIntervalSeconds: 1_800,
  defaultFreshnessSeconds: 1_800,
  defaultRetryBudget: 2,
};

const providerScanCadenceProfiles = new Map<string, ProviderScanCadenceProfile>([
  [
    'fake-source',
    {
      minimumIntervalSeconds: 60,
      defaultIntervalSeconds: 300,
      defaultFreshnessSeconds: 300,
      defaultRetryBudget: 2,
    },
  ],
  [
    'hacker-news',
    {
      minimumIntervalSeconds: 300,
      defaultIntervalSeconds: 900,
      defaultFreshnessSeconds: 900,
      defaultRetryBudget: 2,
    },
  ],
  [
    'rss',
    {
      minimumIntervalSeconds: 300,
      defaultIntervalSeconds: 1_800,
      defaultFreshnessSeconds: 1_800,
      defaultRetryBudget: 2,
    },
  ],
  [
    'github',
    {
      minimumIntervalSeconds: 300,
      defaultIntervalSeconds: 1_800,
      defaultFreshnessSeconds: 1_800,
      defaultRetryBudget: 2,
    },
  ],
  [
    'github-issues',
    {
      minimumIntervalSeconds: 300,
      defaultIntervalSeconds: 1_800,
      defaultFreshnessSeconds: 1_800,
      defaultRetryBudget: 2,
    },
  ],
  [
    'reddit',
    {
      minimumIntervalSeconds: 900,
      defaultIntervalSeconds: 1_800,
      defaultFreshnessSeconds: 1_800,
      defaultRetryBudget: 3,
    },
  ],
  [
    'github-trending-page',
    {
      minimumIntervalSeconds: 86_400,
      defaultIntervalSeconds: 86_400,
      defaultFreshnessSeconds: 86_400,
      defaultRetryBudget: 1,
    },
  ],
  [
    'github-repo-radar',
    {
      minimumIntervalSeconds: 21_600,
      defaultIntervalSeconds: 21_600,
      defaultFreshnessSeconds: 21_600,
      defaultRetryBudget: 1,
    },
  ],
  [
    'x-twitter',
    {
      minimumIntervalSeconds: 86_400,
      defaultIntervalSeconds: 86_400,
      defaultFreshnessSeconds: 86_400,
      defaultRetryBudget: 3,
    },
  ],
  [
    'x-twitter-experimental-daily',
    {
      minimumIntervalSeconds: 86_400,
      defaultIntervalSeconds: 86_400,
      defaultFreshnessSeconds: 86_400,
      defaultRetryBudget: 3,
    },
  ],
  [
    'telegram',
    {
      minimumIntervalSeconds: 3_600,
      defaultIntervalSeconds: 3_600,
      defaultFreshnessSeconds: 3_600,
      defaultRetryBudget: 2,
    },
  ],
]);

export const minimumScanIntervalSecondsForProvider = (providerKey: string): number =>
  providerScanCadenceProfile(providerKey).minimumIntervalSeconds;

export const providerScanCadenceProfile = (providerKey: string): ProviderScanCadenceProfile =>
  providerScanCadenceProfiles.get(providerKey) ?? fallbackProviderScanCadenceProfile;

export type EffectiveProviderScanCadence = {
  readonly minimumIntervalSeconds: number;
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
  readonly providerMinimumIntervalEnforced: boolean;
};

export const effectiveProviderScanCadence = (params: {
  readonly providerKey: string;
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
}): EffectiveProviderScanCadence => {
  const minimumIntervalSeconds = minimumScanIntervalSecondsForProvider(params.providerKey);

  return {
    minimumIntervalSeconds,
    intervalSeconds: Math.max(params.intervalSeconds, minimumIntervalSeconds),
    freshnessSeconds: Math.max(params.freshnessSeconds, minimumIntervalSeconds),
    providerMinimumIntervalEnforced:
      params.intervalSeconds < minimumIntervalSeconds ||
      params.freshnessSeconds < minimumIntervalSeconds,
  };
};

export const validateProviderScanCadence = (params: {
  readonly providerKey: string;
  readonly intervalSeconds: number;
}): DomainError | null => {
  const minimumIntervalSeconds = minimumScanIntervalSecondsForProvider(params.providerKey);

  if (params.intervalSeconds >= minimumIntervalSeconds) {
    return null;
  }

  return new DomainError('validation.failed', 'Scan interval is too aggressive for source provider', {
    providerKey: params.providerKey,
    intervalSeconds: params.intervalSeconds,
    minimumIntervalSeconds,
  });
};
