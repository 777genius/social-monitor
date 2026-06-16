import type { ScanJobStatus } from '../../domain';
import type { ScanExecutionAttemptStatus } from '../../ports';
import type { ScanStatusFailureClass, ScanStatusUserState } from './scan-status-view';

export type ScanExecutionAttemptResponseDto = {
  readonly sourceBindingId: string;
  readonly status: ScanExecutionAttemptStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
  readonly failureReason?: string;
};

export type ScanStatusResponseDto = {
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly status: ScanJobStatus;
  readonly userState: ScanStatusUserState;
  readonly failureClass?: ScanStatusFailureClass;
  readonly operatorAction: string;
  readonly requestedAt: string;
  readonly enqueuedAt?: string;
  readonly completedAt?: string;
  readonly failureReason?: string;
  readonly latestAttempt?: ScanExecutionAttemptResponseDto;
};
