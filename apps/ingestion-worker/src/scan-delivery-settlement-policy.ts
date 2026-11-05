import { DomainError } from '@social-monitor/shared-kernel';

/**
 * Only a durably recorded failure may be acknowledged after handler failure.
 * Transient settlement/lease failures must be made available for another worker.
 * The caller owns the actual broker ack/nack and retry claim lifecycle.
 */
export type FailedScanDeliveryAction = 'acknowledge' | 'requeue' | 'reject';

// Only known connection, pool and transaction retry codes are safe to redeliver.
const transientPrismaCodes = new Set(['P1001', 'P1002', 'P1017', 'P2024', 'P2034']);

const transientFailureReasons = new Set([
  'scan_lease_held',
  'scan_lease_release_failed',
  'scan_failure_recording_failed',
  'scan_outcome_reporting_failed',
]);

export function decideFailedScanDeliveryAction(
  error: unknown,
  shuttingDown: boolean,
): FailedScanDeliveryAction {
  if (error instanceof DomainError && error.details.reason === 'scan_failure_recorded') {
    return 'acknowledge';
  }

  const databaseCode = error !== null && typeof error === 'object' &&
    'code' in error ? error.code : undefined;

  if (shuttingDown ||
      (typeof databaseCode === 'string' && transientPrismaCodes.has(databaseCode)) ||
      (error instanceof DomainError &&
        (error.code === 'operation.backpressure' ||
          (typeof error.details.reason === 'string' &&
            transientFailureReasons.has(error.details.reason))))) {
    return 'requeue';
  }

  return 'reject';
}
