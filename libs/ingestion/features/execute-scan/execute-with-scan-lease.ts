import { DomainError, err, type Result } from '@social-monitor/shared-kernel';

import type { ScanLease, ScanLeasePort } from '../../ports';

/** Cleanup failure is a retryable result and must not discard a persisted outcome. */
export const executeWithScanLease = async <T>(operation: () => Promise<Result<T, Error>>,
  leases: ScanLeasePort, lease: ScanLease): Promise<Result<T, Error>> => {
  let result: Result<T, Error>;
  try {
    result = await operation();
  } catch (error) {
    result = err(error instanceof Error ? error : new Error('Unknown scan execution failure'));
  }
  try {
    await leases.release(lease);
  } catch {
    return err(new DomainError('external.dependency_unavailable', 'Scan lease release unavailable', {
      scanJobId: lease.scanJobId, reason: 'scan_lease_release_failed',
    }));
  }
  return result;
};
