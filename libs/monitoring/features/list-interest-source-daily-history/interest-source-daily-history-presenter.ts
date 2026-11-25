import type { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import type { ScanExecutionAttemptSnapshot, ScanSchedulerDecisionRecord } from '../../ports';
import type {
  InterestSourceDailyHistoryDayView,
  InterestSourceDailyHistorySummaryView,
} from './list-interest-source-daily-history.result';
import { buildProviderBreakdown, buildProviderView } from './interest-source-daily-history-provider-view';

type InterestSourceDailyHistoryWindow = {
  readonly date: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
};

export const buildInterestSourceDailyHistoryDayView = (params: {
  readonly window: InterestSourceDailyHistoryWindow;
  readonly jobs: readonly ScanJob[];
  readonly schedulerDecisions: readonly ScanSchedulerDecisionRecord[];
  readonly attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>;
  readonly bindingById: ReadonlyMap<string, SourceBinding>;
  readonly bindings: readonly SourceBinding[];
  readonly scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>;
}): InterestSourceDailyHistoryDayView => {
  const aggregate = buildProviderView(
    'all',
    params.bindings,
    params.jobs,
    params.schedulerDecisions,
    params.attempts,
    params.scanPoliciesByBindingId,
  );

  return {
    date: params.window.date,
    windowStartedAt: params.window.startedAt.toISOString(),
    windowEndedAt: params.window.endedAt.toISOString(),
    providerHealthState: aggregate.providerHealthState,
    sourceBindingCount: aggregate.sourceBindingCount,
    enabledSourceBindingCount: aggregate.enabledSourceBindingCount,
    pausedSourceBindingCount: aggregate.pausedSourceBindingCount,
    configuredSourceBindingCount: aggregate.configuredSourceBindingCount,
    unconfiguredSourceBindingCount: aggregate.unconfiguredSourceBindingCount,
    scannedSourceBindingCount: aggregate.scannedSourceBindingCount,
    unscannedSourceBindingCount: aggregate.unscannedSourceBindingCount,
    scanCoverageState: aggregate.scanCoverageState,
    schedulerDecisionCount: aggregate.schedulerDecisionCount,
    schedulerEnqueuedCount: aggregate.schedulerEnqueuedCount,
    schedulerSkippedCount: aggregate.schedulerSkippedCount,
    schedulerSkippedByReason: aggregate.schedulerSkippedByReason,
    lastSchedulerEvaluatedAt: aggregate.lastSchedulerEvaluatedAt,
    totalScans: aggregate.totalScans,
    succeededScans: aggregate.succeededScans,
    failedScans: aggregate.failedScans,
    activeScans: aggregate.activeScans,
    rateLimitedScans: aggregate.rateLimitedScans,
    providerUnavailableScans: aggregate.providerUnavailableScans,
    consecutiveFailures: aggregate.consecutiveFailures,
    fetched: aggregate.fetched,
    inserted: aggregate.inserted,
    skippedDuplicates: aggregate.skippedDuplicates,
    projected: aggregate.projected,
    lastScanRequestedAt: aggregate.lastScanRequestedAt,
    lastCompletedAt: aggregate.lastCompletedAt,
    operatorAction: aggregate.operatorAction,
    signals: aggregate.signals,
    providerBreakdown: buildProviderBreakdown(
      params.jobs,
      params.schedulerDecisions,
      params.attempts,
      params.bindingById,
      params.bindings,
      params.scanPoliciesByBindingId,
    ),
  };
};

export const buildInterestSourceDailyHistorySummaryView = (params: {
  readonly days: readonly InterestSourceDailyHistoryDayView[];
  readonly jobs: readonly ScanJob[];
  readonly schedulerDecisions: readonly ScanSchedulerDecisionRecord[];
  readonly attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>;
  readonly bindingById: ReadonlyMap<string, SourceBinding>;
  readonly bindings: readonly SourceBinding[];
  readonly scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>;
}): InterestSourceDailyHistorySummaryView => {
  const aggregate = buildProviderView(
    'all',
    params.bindings,
    params.jobs,
    params.schedulerDecisions,
    params.attempts,
    params.scanPoliciesByBindingId,
  );

  return {
    providerHealthState: aggregate.providerHealthState,
    sourceBindingCount: aggregate.sourceBindingCount,
    enabledSourceBindingCount: aggregate.enabledSourceBindingCount,
    pausedSourceBindingCount: aggregate.pausedSourceBindingCount,
    configuredSourceBindingCount: aggregate.configuredSourceBindingCount,
    unconfiguredSourceBindingCount: aggregate.unconfiguredSourceBindingCount,
    scannedSourceBindingCount: aggregate.scannedSourceBindingCount,
    unscannedSourceBindingCount: aggregate.unscannedSourceBindingCount,
    scanCoverageState: aggregate.scanCoverageState,
    schedulerDecisionCount: aggregate.schedulerDecisionCount,
    schedulerEnqueuedCount: aggregate.schedulerEnqueuedCount,
    schedulerSkippedCount: aggregate.schedulerSkippedCount,
    schedulerSkippedByReason: aggregate.schedulerSkippedByReason,
    lastSchedulerEvaluatedAt: aggregate.lastSchedulerEvaluatedAt,
    totalScans: aggregate.totalScans,
    succeededScans: aggregate.succeededScans,
    failedScans: aggregate.failedScans,
    activeScans: aggregate.activeScans,
    rateLimitedScans: aggregate.rateLimitedScans,
    providerUnavailableScans: aggregate.providerUnavailableScans,
    consecutiveFailures: aggregate.consecutiveFailures,
    fetched: aggregate.fetched,
    inserted: aggregate.inserted,
    skippedDuplicates: aggregate.skippedDuplicates,
    projected: aggregate.projected,
    daysWithScans: params.days.filter((day) => day.totalScans > 0).length,
    daysWithFailures: params.days.filter((day) => day.failedScans > 0).length,
    daysWithRateLimits: params.days.filter((day) => day.rateLimitedScans > 0).length,
    lastScanRequestedAt: aggregate.lastScanRequestedAt,
    lastCompletedAt: aggregate.lastCompletedAt,
    operatorAction: aggregate.operatorAction,
    signals: aggregate.signals,
    providerBreakdown: buildProviderBreakdown(
      params.jobs,
      params.schedulerDecisions,
      params.attempts,
      params.bindingById,
      params.bindings,
      params.scanPoliciesByBindingId,
    ),
  };
};

