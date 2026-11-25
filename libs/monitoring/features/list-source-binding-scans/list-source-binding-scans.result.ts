import type { ScanJobStatus } from '../../domain';
import type { ScanExecutionAttemptStatus } from '../../ports';
import type { ScanStatusFailureClass, ScanStatusUserState } from '../shared/scan-status-view';

export type SourceBindingScanAttemptView = {
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

export type SourceBindingScanHistoryItemView = {
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly status: ScanJobStatus;
  readonly userState: ScanStatusUserState;
  readonly failureClass?: ScanStatusFailureClass;
  readonly operatorAction: string;
  readonly requestedAt: Date;
  readonly enqueuedAt?: Date;
  readonly completedAt?: Date;
  readonly failureReason?: string;
  readonly latestAttempt?: SourceBindingScanAttemptView;
};

export type ListSourceBindingScansResult = {
  readonly scanRequests: readonly SourceBindingScanHistoryItemView[];
  readonly nextCursor?: string;
};
