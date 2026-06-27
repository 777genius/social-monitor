import type { ScanJobStatus } from '../../domain';
import type { ScanProviderHealthState } from '../shared/scan-provider-health-summary';

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
  readonly minimumIntervalSeconds?: number;
  readonly configuredIntervalSeconds?: number;
  readonly effectiveIntervalSeconds?: number;
  readonly freshnessSeconds?: number;
  readonly providerMinimumIntervalEnforced?: boolean;
  readonly nextEligibleAt?: string;
  readonly waitSeconds?: number;
  readonly freshnessDeadlineAt?: string;
  readonly rateLimitBackoffUntil?: string;
  readonly providerFailureBackoffUntil?: string;
  readonly providerHealthState?: ScanProviderHealthState;
  readonly signals: readonly string[];
};

export type RequestScanResult = {
  readonly scanJobId: string;
  readonly status: ScanJobStatus;
  readonly created: boolean;
  readonly requestDecision: RequestScanDecisionView;
};
