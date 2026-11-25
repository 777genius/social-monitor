import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { FailedScanCommand, ScanFailureQueuePort } from '../../ports';

export type ScanFailureDisposition = 'retry_scheduled' | 'dead_lettered' | 'superseded';

export const recordedScanFailure = (scanJobId: string, message: string,
  disposition: ScanFailureDisposition): DomainError =>
  new DomainError('external.dependency_unavailable', message, {
    scanJobId, reason: 'scan_failure_recorded', disposition,
  });

export const recordScanFailure = async (queue: ScanFailureQueuePort,
  command: FailedScanCommand, retryPending: boolean): Promise<Result<ScanFailureDisposition, DomainError>> => {
  try {
    if (retryPending) await queue.enqueueRetry({ ...command, nextAttemptNumber: command.attemptNumber + 1 });
    else await queue.deadLetter(command);
    return ok(retryPending ? 'retry_scheduled' : 'dead_lettered');
  } catch {
    return err(new DomainError('external.dependency_unavailable', 'Scan failure recording unavailable', {
      scanJobId: command.scanJobId, reason: 'scan_failure_recording_failed',
    }));
  }
};
