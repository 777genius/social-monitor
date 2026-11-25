import type { GetSourceBindingHealthResult } from '../get-source-binding-health/get-source-binding-health.result';
import type {
  SourceBindingOverviewDegradationReasonCode,
  SourceBindingOverviewDegradationReasonView,
  SourceBindingOverviewDegradationSeverity,
} from './list-source-binding-overview.result';

export const buildDegradationReasons = (
  items: readonly GetSourceBindingHealthResult[],
): readonly SourceBindingOverviewDegradationReasonView[] => {
  const reasons = new Map<SourceBindingOverviewDegradationReasonCode, {
    readonly bindingIds: Set<string>;
    readonly nextEligibleAtValues: string[];
  }>();

  for (const item of items) {
    for (const code of degradationReasonCodesFor(item)) {
      const current = reasons.get(code);
      if (current === undefined) {
        reasons.set(code, {
          bindingIds: new Set([item.sourceBinding.id]),
          nextEligibleAtValues: item.schedulerDecision.nextEligibleAt === undefined
            ? []
            : [item.schedulerDecision.nextEligibleAt],
        });
      } else {
        current.bindingIds.add(item.sourceBinding.id);
        if (item.schedulerDecision.nextEligibleAt !== undefined) {
          current.nextEligibleAtValues.push(item.schedulerDecision.nextEligibleAt);
        }
      }
    }
  }

  return [...reasons.entries()]
    .map(([code, reason]) => ({
      code,
      severity: degradationSeverityFor(code),
      affectedBindings: reason.bindingIds.size,
      operatorAction: degradationOperatorActionFor(code),
      nextEligibleAt: earliestIsoDate(reason.nextEligibleAtValues),
      sampleSourceBindingIds: [...reason.bindingIds].sort().slice(0, 3),
      signals: degradationSignalsFor(code),
    }))
    .sort(compareDegradationReasons);
};

const degradationReasonCodesFor = (
  item: GetSourceBindingHealthResult,
): readonly SourceBindingOverviewDegradationReasonCode[] => {
  const codes = new Set<SourceBindingOverviewDegradationReasonCode>();
  const failureReason = item.latestScan?.failureReason?.toLowerCase() ?? '';
  const failureClass = item.latestScan?.failureClass;
  const hasAuthFailure = failureClass === 'provider_auth_failed' ||
    isAuthFailureReason(failureReason);
  const hasUnsupportedScope = item.healthState === 'unsupported_scope' ||
    isUnsupportedScopeReason(failureReason);

  if (
    item.healthState === 'rate_limited' ||
    item.schedulerDecision.decision === 'rate_limit_backoff' ||
    failureClass === 'provider_rate_limited' ||
    (item.recentWindow?.rateLimitedScans ?? 0) > 0
  ) {
    codes.add('rate_limited');
  }

  if (hasUnsupportedScope) {
    codes.add('unsupported_scope');
  } else if (item.healthState === 'auth_failed' || hasAuthFailure) {
    codes.add('auth_failed');
  }

  if (
    item.schedulerDecision.decision === 'provider_failure_backoff' ||
    failureClass === 'provider_unavailable' ||
    (item.recentWindow?.providerUnavailableScans ?? 0) > 0
  ) {
    if (!hasUnsupportedScope && !hasAuthFailure && !codes.has('rate_limited')) {
      codes.add('provider_unavailable');
    }
  }

  if (item.healthState === 'down') {
    codes.add('provider_down');
  }
  if (item.healthState === 'stale') {
    codes.add('stale_data');
  }
  if (item.healthState === 'not_configured') {
    codes.add('scan_policy_missing');
  }
  if (item.healthState === 'paused') {
    codes.add('source_paused');
  }
  if (failureClass === 'worker_conflict') {
    codes.add('worker_conflict');
  }
  if (failureClass === 'system_failure') {
    codes.add('system_failure');
  }
  if (item.healthState === 'degraded' && codes.size === 0) {
    codes.add('degraded');
  }

  return [...codes];
};

const isAuthFailureReason = (failureReason: string): boolean =>
  failureReason.includes('auth_failed') ||
  failureReason.includes('unauthorized') ||
  failureReason.includes('forbidden') ||
  failureReason.includes('credential') ||
  failureReason.includes('invalid_token') ||
  failureReason.includes('token expired') ||
  failureReason.includes('401') ||
  failureReason.includes('403');

const isUnsupportedScopeReason = (failureReason: string): boolean =>
  failureReason.includes('unsupported_scope') ||
  failureReason.includes('unsupported scope') ||
  failureReason.includes('insufficient_scope') ||
  failureReason.includes('insufficient scope') ||
  failureReason.includes('invalid_query') ||
  failureReason.includes('scope missing');

const degradationSeverityFor = (
  code: SourceBindingOverviewDegradationReasonCode,
): SourceBindingOverviewDegradationSeverity => {
  switch (code) {
    case 'auth_failed':
    case 'provider_down':
    case 'system_failure':
    case 'unsupported_scope':
      return 'critical';
    case 'degraded':
    case 'provider_unavailable':
    case 'rate_limited':
    case 'scan_policy_missing':
    case 'stale_data':
    case 'worker_conflict':
      return 'warning';
    case 'source_paused':
      return 'info';
  }
};

const degradationOperatorActionFor = (
  code: SourceBindingOverviewDegradationReasonCode,
): string => {
  switch (code) {
    case 'auth_failed':
      return 'refresh_or_reconnect_source_credentials';
    case 'degraded':
      return 'inspect_latest_scan_failure_and_retry_budget';
    case 'provider_down':
      return 'pause_or_backoff_provider_until_recovery';
    case 'provider_unavailable':
      return 'check_provider_health_and_retry_budget';
    case 'rate_limited':
      return 'wait_for_provider_rate_limit_backoff';
    case 'scan_policy_missing':
      return 'create_scan_policy_for_source_binding';
    case 'source_paused':
      return 'resume_source_binding_before_scanning';
    case 'stale_data':
      return 'trigger_manual_scan_or_reduce_scan_interval';
    case 'system_failure':
      return 'inspect_scan_attempt_logs_and_dlq';
    case 'unsupported_scope':
      return 'adjust_source_query_or_requested_scopes';
    case 'worker_conflict':
      return 'inspect_scan_lease_and_worker_lag';
  }
};

const degradationSignalsFor = (
  code: SourceBindingOverviewDegradationReasonCode,
): readonly string[] => {
  switch (code) {
    case 'auth_failed':
      return ['auth_failed', 'credential_reconnect_required'];
    case 'degraded':
      return ['degraded'];
    case 'provider_down':
      return ['source_down'];
    case 'provider_unavailable':
      return ['provider_unavailable'];
    case 'rate_limited':
      return ['rate_limited'];
    case 'scan_policy_missing':
      return ['scan_policy_missing'];
    case 'source_paused':
      return ['source_paused'];
    case 'stale_data':
      return ['stale_source_data'];
    case 'system_failure':
      return ['system_failure'];
    case 'unsupported_scope':
      return ['unsupported_scope'];
    case 'worker_conflict':
      return ['worker_conflict'];
  }
};

const compareDegradationReasons = (
  left: SourceBindingOverviewDegradationReasonView,
  right: SourceBindingOverviewDegradationReasonView,
): number => {
  const severityDiff = degradationSeverityRank(left.severity) -
    degradationSeverityRank(right.severity);
  if (severityDiff !== 0) {
    return severityDiff;
  }

  const affectedDiff = right.affectedBindings - left.affectedBindings;
  if (affectedDiff !== 0) {
    return affectedDiff;
  }

  return left.code.localeCompare(right.code);
};

const degradationSeverityRank = (
  severity: SourceBindingOverviewDegradationSeverity,
): number => {
  switch (severity) {
    case 'critical':
      return 0;
    case 'warning':
      return 1;
    case 'info':
      return 2;
  }
};

const earliestIsoDate = (values: readonly string[]): string | undefined =>
  values
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)
    .map((value) => new Date(value).toISOString())[0];
