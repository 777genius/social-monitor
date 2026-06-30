import type { GetSourceBindingHealthResult } from '../get-source-binding-health/get-source-binding-health.result';

export type SourceBindingOverviewDegradationReasonCode =
  | 'rate_limited'
  | 'auth_failed'
  | 'unsupported_scope'
  | 'provider_unavailable'
  | 'provider_down'
  | 'stale_data'
  | 'scan_policy_missing'
  | 'source_paused'
  | 'worker_conflict'
  | 'system_failure'
  | 'degraded';

export type SourceBindingOverviewDegradationSeverity =
  | 'info'
  | 'warning'
  | 'critical';

export type SourceBindingOverviewDegradationReasonView = {
  readonly code: SourceBindingOverviewDegradationReasonCode;
  readonly severity: SourceBindingOverviewDegradationSeverity;
  readonly affectedBindings: number;
  readonly operatorAction: string;
  readonly nextEligibleAt?: string;
  readonly sampleSourceBindingIds: readonly string[];
  readonly signals: readonly string[];
};

export type SourceBindingOverviewProviderBreakdownView = {
  readonly providerKey: string;
  readonly totalBindings: number;
  readonly healthyBindings: number;
  readonly staleBindings: number;
  readonly rateLimitedBindings: number;
  readonly authFailedBindings: number;
  readonly unsupportedScopeBindings: number;
  readonly degradedBindings: number;
  readonly downBindings: number;
  readonly scanningBindings: number;
  readonly pausedBindings: number;
  readonly notConfiguredBindings: number;
  readonly scheduledBindings: number;
  readonly canScanNowBindings: number;
  readonly freshSuccessSkips: number;
  readonly rateLimitBackoffSkips: number;
  readonly providerFailureBackoffSkips: number;
  readonly providerUnavailableScans: number;
  readonly nextEligibleAt?: string;
  readonly degradationReasons: readonly SourceBindingOverviewDegradationReasonView[];
  readonly signals: readonly string[];
};

export type SourceBindingOverviewSummaryView = {
  readonly totalBindings: number;
  readonly healthyBindings: number;
  readonly staleBindings: number;
  readonly authFailedBindings: number;
  readonly unsupportedScopeBindings: number;
  readonly degradedBindings: number;
  readonly downBindings: number;
  readonly scanningBindings: number;
  readonly pausedBindings: number;
  readonly notConfiguredBindings: number;
  readonly scheduledBindings: number;
  readonly canScanNowBindings: number;
  readonly freshSuccessSkips: number;
  readonly rateLimitedBindings: number;
  readonly providerFailureBackoffSkips: number;
  readonly providerUnavailableScans: number;
  readonly attentionRequiredBindings: number;
  readonly nextEligibleAt?: string;
  readonly operatorAction: string;
  readonly degradationReasons: readonly SourceBindingOverviewDegradationReasonView[];
  readonly signals: readonly string[];
  readonly providerBreakdown: readonly SourceBindingOverviewProviderBreakdownView[];
};

export type ListSourceBindingOverviewResult = {
  readonly summary: SourceBindingOverviewSummaryView;
  readonly items: readonly GetSourceBindingHealthResult[];
  readonly nextCursor?: string;
};
