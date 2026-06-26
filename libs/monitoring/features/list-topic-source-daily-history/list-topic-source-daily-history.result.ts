import type { ScanProviderHealthState } from '../shared/scan-provider-health-summary';

export type TopicSourceDailyHistoryCadenceSummaryView = {
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

export type TopicSourceDailyHistoryProviderView = {
  readonly providerKey: string;
  readonly sourceBindingCount: number;
  readonly enabledSourceBindingCount: number;
  readonly pausedSourceBindingCount: number;
  readonly configuredSourceBindingCount: number;
  readonly unconfiguredSourceBindingCount: number;
  readonly cadenceSummary?: TopicSourceDailyHistoryCadenceSummaryView;
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

export type TopicSourceDailyHistoryDayView = {
  readonly date: string;
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly providerHealthState: ScanProviderHealthState;
  readonly sourceBindingCount: number;
  readonly enabledSourceBindingCount: number;
  readonly pausedSourceBindingCount: number;
  readonly configuredSourceBindingCount: number;
  readonly unconfiguredSourceBindingCount: number;
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
  readonly providerBreakdown: readonly TopicSourceDailyHistoryProviderView[];
};

export type TopicSourceDailyHistorySummaryView = {
  readonly providerHealthState: ScanProviderHealthState;
  readonly sourceBindingCount: number;
  readonly enabledSourceBindingCount: number;
  readonly pausedSourceBindingCount: number;
  readonly configuredSourceBindingCount: number;
  readonly unconfiguredSourceBindingCount: number;
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
  readonly providerBreakdown: readonly TopicSourceDailyHistoryProviderView[];
};

export type ListTopicSourceDailyHistoryResult = {
  readonly topicId: string;
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly summary: TopicSourceDailyHistorySummaryView;
  readonly days: readonly TopicSourceDailyHistoryDayView[];
  readonly truncated: boolean;
  readonly maxScanJobs: number;
};
