import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

/** A persisted execution outcome is retried as reporting work, without rerunning ingestion. */
export const reportScanOutcome = async (
  scanJobId: string,
  report: () => Promise<void>,
): Promise<Result<void, DomainError>> => {
  try {
    await report();
    return ok(undefined);
  } catch (error) {
    if (error instanceof DomainError && error.code !== 'external.dependency_unavailable') {
      return err(error);
    }
    return err(new DomainError('external.dependency_unavailable', 'Scan outcome reporting unavailable', {
      scanJobId, reason: 'scan_outcome_reporting_failed',
    }));
  }
};
