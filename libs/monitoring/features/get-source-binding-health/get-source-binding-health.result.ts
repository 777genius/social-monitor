import type { ScanJobStatus } from '../../domain';
import type { ScanExecutionAttemptStatus } from '../../ports';
import type { ScanProviderHealthState } from '../shared/scan-provider-health-summary';
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

export type SourceBindingProviderHealthState = ScanProviderHealthState;

export type SourceBindingHealthRecentWindowView = {
  readonly providerHealthState: SourceBindingProviderHealthState;
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly totalScans: number;
  readonly succeededScans: number;
  readonly failedScans: number;
  readonly activeScans: number;
  readonly rateLimitedScans: number;
  readonly providerUnavailableScans: number;
  readonly consecutiveFailures: number;
  readonly lastSucceededAt?: string;
  readonly lastFailedAt?: string;
  readonly operatorAction: string;
  readonly signals: readonly string[];
};

export type SourceBindingHealthPolicyView = ScanPolicyView & {
  readonly isDue: boolean;
};

export type SourceBindingHealthSchedulerDecision =
  | 'ready'
  | 'paused'
  | 'not_configured'
  | 'active_scan'
  | 'fresh_success'
  | 'rate_limit_backoff'
  | 'provider_failure_backoff'
  | 'scheduled_later';

export type SourceBindingHealthSchedulerDecisionView = {
  readonly canScanNow: boolean;
  readonly decision: SourceBindingHealthSchedulerDecision;
  readonly reason: string;
  readonly minimumIntervalSeconds: number;
  readonly configuredIntervalSeconds?: number;
  readonly effectiveIntervalSeconds?: number;
  readonly freshnessSeconds?: number;
  readonly providerMinimumIntervalEnforced?: boolean;
  readonly nextEligibleAt?: string;
  readonly waitSeconds?: number;
  readonly rateLimitBackoffUntil?: string;
  readonly providerFailureBackoffUntil?: string;
  readonly signals: readonly string[];
};

export type GetSourceBindingHealthResult = {
  readonly sourceBinding: SourceBindingView;
  readonly healthState: SourceBindingHealthState;
  readonly operatorAction: string;
  readonly evaluatedAt: string;
  readonly schedulerDecision: SourceBindingHealthSchedulerDecisionView;
  readonly scanPolicy?: SourceBindingHealthPolicyView;
  readonly latestScan?: SourceBindingHealthScanView;
  readonly freshness?: SourceBindingHealthFreshnessView;
  readonly recentWindow?: SourceBindingHealthRecentWindowView;
};
