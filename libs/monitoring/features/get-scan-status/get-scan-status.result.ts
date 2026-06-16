import type { ScanJobStatus } from '../../domain';
import type { ScanExecutionAttemptStatus } from '../../ports';

export type ScanExecutionAttemptView = {
  readonly sourceBindingId: string;
  readonly status: ScanExecutionAttemptStatus;
  readonly startedAt: Date;
  readonly finishedAt?: Date;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
  readonly failureReason?: string;
};

export type GetScanStatusResult = {
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly status: ScanJobStatus;
  readonly requestedAt: Date;
  readonly enqueuedAt?: Date;
  readonly completedAt?: Date;
  readonly failureReason?: string;
  readonly latestAttempt?: ScanExecutionAttemptView;
};
