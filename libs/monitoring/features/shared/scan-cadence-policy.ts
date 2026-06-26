import { DomainError } from '@social-monitor/shared-kernel';

const providerMinimumScanIntervalSeconds = new Map<string, number>([
  ['fake-source', 60],
  ['hacker-news', 300],
  ['rss', 300],
  ['github-issues', 300],
  ['reddit', 900],
  ['github-trending-page', 3_600],
  ['github-repo-radar', 21_600],
  ['telegram', 3_600],
]);

export const minimumScanIntervalSecondsForProvider = (providerKey: string): number =>
  providerMinimumScanIntervalSeconds.get(providerKey) ?? 900;

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
