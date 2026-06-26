import type { ScanJobStatus } from '../../domain';

export type RequestScanDecision =
  | 'created'
  | 'idempotent_replay'
  | 'active_scan'
  | 'fresh_success'
  | 'rate_limit_backoff'
  | 'provider_failure_backoff';

export type RequestScanDecisionView = {
  readonly decision: RequestScanDecision;
  readonly reason: string;
  readonly createdNewScan: boolean;
  readonly nextEligibleAt?: string;
  readonly waitSeconds?: number;
  readonly freshnessDeadlineAt?: string;
  readonly rateLimitBackoffUntil?: string;
  readonly providerFailureBackoffUntil?: string;
  readonly signals: readonly string[];
};

export type RequestScanResult = {
  readonly scanJobId: string;
  readonly status: ScanJobStatus;
  readonly created: boolean;
  readonly requestDecision: RequestScanDecisionView;
};
