import type { ScanPolicy, ScanPolicyProps } from '../../domain';
import { effectiveProviderScanCadence } from './scan-cadence-policy';

export type ScanPolicyCadenceView = {
  readonly providerKey: string;
  readonly minimumIntervalSeconds: number;
  readonly configuredIntervalSeconds: number;
  readonly configuredFreshnessSeconds: number;
  readonly effectiveIntervalSeconds: number;
  readonly effectiveFreshnessSeconds: number;
  readonly providerMinimumIntervalEnforced: boolean;
};

export type ScanPolicyView = Omit<ScanPolicyProps, 'nextRunAt' | 'createdAt'> & {
  readonly nextRunAt: string;
  readonly createdAt: string;
  readonly cadence?: ScanPolicyCadenceView;
};

export const presentScanPolicy = (
  policy: ScanPolicy,
  options?: { readonly providerKey?: string },
): ScanPolicyView => {
  const snapshot = policy.toSnapshot();
  const cadence = options?.providerKey === undefined
    ? undefined
    : buildCadenceView({
        providerKey: options.providerKey,
        intervalSeconds: snapshot.intervalSeconds,
        freshnessSeconds: snapshot.freshnessSeconds,
      });

  return {
    ...snapshot,
    nextRunAt: snapshot.nextRunAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
    cadence,
  };
};

const buildCadenceView = (params: {
  readonly providerKey: string;
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
}): ScanPolicyCadenceView => {
  const cadence = effectiveProviderScanCadence(params);

  return {
    providerKey: params.providerKey,
    minimumIntervalSeconds: cadence.minimumIntervalSeconds,
    configuredIntervalSeconds: params.intervalSeconds,
    configuredFreshnessSeconds: params.freshnessSeconds,
    effectiveIntervalSeconds: cadence.intervalSeconds,
    effectiveFreshnessSeconds: cadence.freshnessSeconds,
    providerMinimumIntervalEnforced: cadence.providerMinimumIntervalEnforced,
  };
};
