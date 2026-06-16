import type { ScanPolicy, ScanPolicyProps } from '../../domain';

export type ScanPolicyView = Omit<ScanPolicyProps, 'nextRunAt' | 'createdAt'> & {
  readonly nextRunAt: string;
  readonly createdAt: string;
};

export const presentScanPolicy = (policy: ScanPolicy): ScanPolicyView => {
  const snapshot = policy.toSnapshot();

  return {
    ...snapshot,
    nextRunAt: snapshot.nextRunAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
  };
};
