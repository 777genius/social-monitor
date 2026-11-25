import type { ScanSchedulerDecisionRecord } from '../../ports';
import type { ScanProviderHealthSummary } from './scan-provider-health-summary';

export type ScanSchedulerSkipBreakdownView = {
  readonly activeScan: number;
  readonly duplicateWindow: number;
  readonly freshSuccess: number;
  readonly providerFailureBackoff: number;
  readonly queueBackpressure: number;
  readonly rateLimitBackoff: number;
  readonly sourceUnavailable: number;
};

export type ScanSchedulerDecisionSummaryView = {
  readonly schedulerDecisionCount: number;
  readonly schedulerEnqueuedCount: number;
  readonly schedulerSkippedCount: number;
  readonly schedulerSkippedByReason: ScanSchedulerSkipBreakdownView;
  readonly lastSchedulerEvaluatedAt?: string;
};

export const summarizeScanSchedulerDecisions = (
  decisions: readonly ScanSchedulerDecisionRecord[],
): ScanSchedulerDecisionSummaryView => {
  const sortedDecisions = sortSchedulerDecisions(decisions);

  return {
    schedulerDecisionCount: sortedDecisions.length,
    schedulerEnqueuedCount: sortedDecisions.filter((decision) => decision.decision === 'enqueued').length,
    schedulerSkippedCount: sortedDecisions.filter((decision) => decision.decision === 'skipped').length,
    schedulerSkippedByReason: schedulerSkipBreakdown(sortedDecisions),
    lastSchedulerEvaluatedAt: sortedDecisions[0]?.evaluatedAt.toISOString(),
  };
};

export const sortSchedulerDecisions = (
  decisions: readonly ScanSchedulerDecisionRecord[],
): readonly ScanSchedulerDecisionRecord[] =>
  [...decisions].sort((left, right) => {
    const evaluatedDiff = right.evaluatedAt.getTime() - left.evaluatedAt.getTime();

    return evaluatedDiff === 0 ? right.id.localeCompare(left.id) : evaluatedDiff;
  });

export const providerHealthWithSchedulerBackoff = (
  health: ScanProviderHealthSummary,
  skippedByReason: ScanSchedulerSkipBreakdownView,
): ScanProviderHealthSummary => {
  if (skippedByReason.providerFailureBackoff > 0) {
    return {
      ...health,
      providerHealthState: 'down',
      operatorAction: 'pause_or_backoff_provider_until_recovery',
      signals: uniqueStable([
        ...health.signals,
        'provider_failure_backoff',
      ]),
    };
  }

  if (
    skippedByReason.rateLimitBackoff > 0 &&
    health.providerHealthState !== 'down'
  ) {
    return {
      ...health,
      providerHealthState: 'degraded',
      operatorAction: 'inspect_recent_scan_failures_and_rate_limits',
      signals: uniqueStable([
        ...health.signals,
        'rate_limit_backoff',
      ]),
    };
  }

  return health;
};

const schedulerSkipBreakdown = (
  decisions: readonly ScanSchedulerDecisionRecord[],
): ScanSchedulerSkipBreakdownView => {
  const skipped = decisions.filter((decision) => decision.decision === 'skipped');

  return {
    activeScan: skipped.filter((decision) => decision.reason === 'active_scan').length,
    duplicateWindow: skipped.filter((decision) => decision.reason === 'duplicate_window').length,
    freshSuccess: skipped.filter((decision) => decision.reason === 'fresh_success').length,
    providerFailureBackoff: skipped.filter((decision) => decision.reason === 'provider_failure_backoff').length,
    queueBackpressure: skipped.filter((decision) => decision.reason === 'queue_backpressure').length,
    rateLimitBackoff: skipped.filter((decision) => decision.reason === 'rate_limit_backoff').length,
    sourceUnavailable: skipped.filter((decision) => decision.reason === 'source_unavailable').length,
  };
};

const uniqueStable = <TValue>(values: readonly TValue[]): readonly TValue[] => {
  const seen = new Set<TValue>();
  const result: TValue[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
};
