import type { ScanProviderHealthState } from '../shared/scan-provider-health-summary';
import type { ScanSchedulerSkipBreakdownView } from '../shared/scan-scheduler-decision-summary';

export type InterestSourceDailyHistoryScanCoverageState =
  | 'no_sources'
  | 'none_scanned'
  | 'partial'
  | 'complete';

export type InterestSourceDailyHistorySchedulerSkipBreakdownView = ScanSchedulerSkipBreakdownView;

export type InterestSourceDailyHistoryCadenceSummaryView = {
  readonly sourceBindingCount: number;
  readonly minimumIntervalSeconds: number;
  readonly minConfiguredIntervalSeconds: number;
  readonly maxConfiguredIntervalSeconds: number;
  readonly minEffectiveIntervalSeconds: number;
  readonly maxEffectiveIntervalSeconds: number;
  readonly minEffectiveFreshnessSeconds: number;
  readonly maxEffectiveFreshnessSeconds: number;
  readonly providerMinimumIntervalEnforced: boolean;
};

export type InterestSourceDailyHistoryProviderView = {
  readonly providerKey: string;
  readonly sourceBindingCount: number;
  readonly enabledSourceBindingCount: number;
  readonly pausedSourceBindingCount: number;
  readonly configuredSourceBindingCount: number;
  readonly unconfiguredSourceBindingCount: number;
  readonly scannedSourceBindingCount: number;
  readonly unscannedSourceBindingCount: number;
  readonly scanCoverageState: InterestSourceDailyHistoryScanCoverageState;
  readonly schedulerDecisionCount: number;
  readonly schedulerEnqueuedCount: number;
  readonly schedulerSkippedCount: number;
  readonly schedulerSkippedByReason: InterestSourceDailyHistorySchedulerSkipBreakdownView;
  readonly lastSchedulerEvaluatedAt?: string;
  readonly cadenceSummary?: InterestSourceDailyHistoryCadenceSummaryView;
  readonly providerHealthState: ScanProviderHealthState;
  readonly totalScans: number;
  readonly succeededScans: number;
  readonly failedScans: number;
  readonly activeScans: number;
  readonly rateLimitedScans: number;
  readonly providerUnavailableScans: number;
  readonly consecutiveFailures: number;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
  readonly lastScanRequestedAt?: string;
  readonly lastCompletedAt?: string;
  readonly operatorAction: string;
  readonly signals: readonly string[];
};

export type InterestSourceDailyHistoryDayView = {
  readonly date: string;
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly providerHealthState: ScanProviderHealthState;
  readonly sourceBindingCount: number;
  readonly enabledSourceBindingCount: number;
  readonly pausedSourceBindingCount: number;
  readonly configuredSourceBindingCount: number;
  readonly unconfiguredSourceBindingCount: number;
  readonly scannedSourceBindingCount: number;
  readonly unscannedSourceBindingCount: number;
  readonly scanCoverageState: InterestSourceDailyHistoryScanCoverageState;
  readonly schedulerDecisionCount: number;
  readonly schedulerEnqueuedCount: number;
  readonly schedulerSkippedCount: number;
  readonly schedulerSkippedByReason: InterestSourceDailyHistorySchedulerSkipBreakdownView;
  readonly lastSchedulerEvaluatedAt?: string;
  readonly totalScans: number;
  readonly succeededScans: number;
  readonly failedScans: number;
  readonly activeScans: number;
  readonly rateLimitedScans: number;
  readonly providerUnavailableScans: number;
  readonly consecutiveFailures: number;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
  readonly lastScanRequestedAt?: string;
  readonly lastCompletedAt?: string;
  readonly operatorAction: string;
  readonly signals: readonly string[];
  readonly providerBreakdown: readonly InterestSourceDailyHistoryProviderView[];
};

export type InterestSourceDailyHistorySummaryView = {
  readonly providerHealthState: ScanProviderHealthState;
  readonly sourceBindingCount: number;
  readonly enabledSourceBindingCount: number;
  readonly pausedSourceBindingCount: number;
  readonly configuredSourceBindingCount: number;
  readonly unconfiguredSourceBindingCount: number;
  readonly scannedSourceBindingCount: number;
  readonly unscannedSourceBindingCount: number;
  readonly scanCoverageState: InterestSourceDailyHistoryScanCoverageState;
  readonly schedulerDecisionCount: number;
  readonly schedulerEnqueuedCount: number;
  readonly schedulerSkippedCount: number;
  readonly schedulerSkippedByReason: InterestSourceDailyHistorySchedulerSkipBreakdownView;
  readonly lastSchedulerEvaluatedAt?: string;
  readonly totalScans: number;
  readonly succeededScans: number;
  readonly failedScans: number;
  readonly activeScans: number;
  readonly rateLimitedScans: number;
  readonly providerUnavailableScans: number;
  readonly consecutiveFailures: number;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
  readonly daysWithScans: number;
  readonly daysWithFailures: number;
  readonly daysWithRateLimits: number;
  readonly lastScanRequestedAt?: string;
  readonly lastCompletedAt?: string;
  readonly operatorAction: string;
  readonly signals: readonly string[];
  readonly providerBreakdown: readonly InterestSourceDailyHistoryProviderView[];
};

export type ListInterestSourceDailyHistoryResult = {
  readonly interestId: string;
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly summary: InterestSourceDailyHistorySummaryView;
  readonly days: readonly InterestSourceDailyHistoryDayView[];
  readonly truncated: boolean;
  readonly maxScanJobs: number;
};
