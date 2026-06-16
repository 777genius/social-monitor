import type { ScanJobStatus } from '../../domain';
import type { ScanExecutionAttemptStatus } from '../../ports';
import type { ScanPolicyView } from '../shared/scan-policy-presenter';
import type { ScanStatusFailureClass, ScanStatusUserState } from '../shared/scan-status-view';
import type { SourceBindingView } from '../shared/source-binding-presenter';

export type SourceBindingHealthState =
  | 'paused'
  | 'not_configured'
  | 'scheduled'
  | 'scanning'
  | 'healthy'
  | 'stale'
  | 'degraded';

export type SourceBindingHealthAttemptView = {
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

export type SourceBindingHealthScanView = {
  readonly scanJobId: string;
  readonly status: ScanJobStatus;
  readonly userState: ScanStatusUserState;
  readonly failureClass?: ScanStatusFailureClass;
  readonly operatorAction: string;
  readonly requestedAt: string;
  readonly enqueuedAt?: string;
  readonly completedAt?: string;
  readonly failureReason?: string;
  readonly latestAttempt?: SourceBindingHealthAttemptView;
};

export type SourceBindingHealthFreshnessView = {
  readonly isFresh: boolean;
  readonly ageSeconds?: number;
  readonly freshnessDeadlineAt?: string;
  readonly staleBySeconds?: number;
};

export type SourceBindingHealthPolicyView = ScanPolicyView & {
  readonly isDue: boolean;
};

export type GetSourceBindingHealthResult = {
  readonly sourceBinding: SourceBindingView;
  readonly healthState: SourceBindingHealthState;
  readonly operatorAction: string;
  readonly evaluatedAt: string;
  readonly scanPolicy?: SourceBindingHealthPolicyView;
  readonly latestScan?: SourceBindingHealthScanView;
  readonly freshness?: SourceBindingHealthFreshnessView;
};
