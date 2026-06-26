import type { ScanProviderHealthState } from '../shared/scan-provider-health-summary';

export type SourceBindingDailyHistoryDayView = {
  readonly date: string;
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
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

export type SourceBindingDailyHistorySummaryView = {
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
  readonly daysWithScans: number;
  readonly daysWithFailures: number;
  readonly daysWithRateLimits: number;
  readonly lastScanRequestedAt?: string;
  readonly lastCompletedAt?: string;
  readonly operatorAction: string;
  readonly signals: readonly string[];
};

export type ListSourceBindingDailyHistoryResult = {
  readonly sourceBindingId: string;
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly summary?: SourceBindingDailyHistorySummaryView;
  readonly days: readonly SourceBindingDailyHistoryDayView[];
  readonly truncated: boolean;
  readonly maxScanJobs: number;
};
