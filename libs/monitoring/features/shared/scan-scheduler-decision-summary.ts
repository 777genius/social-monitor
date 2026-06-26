import type { ScanSchedulerDecisionRecord } from '../../ports';

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
