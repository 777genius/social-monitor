import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  ListInterestSourceDailyHistoryResult,
  InterestSourceDailyHistoryCadenceSummaryView,
  InterestSourceDailyHistoryDayView,
  InterestSourceDailyHistoryProviderView,
  InterestSourceDailyHistoryScanCoverageState,
  InterestSourceDailyHistorySchedulerSkipBreakdownView,
  InterestSourceDailyHistorySummaryView,
} from '../../features/list-interest-source-daily-history/list-interest-source-daily-history.result';
import type { ScanProviderHealthState } from '../../features/shared/scan-provider-health-summary';

const sourceHistoryProviderHealthStateValues = [
  'unknown',
  'operational',
  'degraded',
  'down',
] as const satisfies readonly ScanProviderHealthState[];

const sourceHistoryScanCoverageStateValues = [
  'no_sources',
  'none_scanned',
  'partial',
  'complete',
] as const satisfies readonly InterestSourceDailyHistoryScanCoverageState[];

export class InterestSourceDailyHistoryCadenceSummaryResponseDto implements InterestSourceDailyHistoryCadenceSummaryView {
  @ApiProperty()
  declare readonly sourceBindingCount: number;

  @ApiProperty()
  declare readonly minimumIntervalSeconds: number;

  @ApiProperty()
  declare readonly minConfiguredIntervalSeconds: number;

  @ApiProperty()
  declare readonly maxConfiguredIntervalSeconds: number;

  @ApiProperty()
  declare readonly minEffectiveIntervalSeconds: number;

  @ApiProperty()
  declare readonly maxEffectiveIntervalSeconds: number;

  @ApiProperty()
  declare readonly minEffectiveFreshnessSeconds: number;

  @ApiProperty()
  declare readonly maxEffectiveFreshnessSeconds: number;

  @ApiProperty()
  declare readonly providerMinimumIntervalEnforced: boolean;
}

export class InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto
  implements InterestSourceDailyHistorySchedulerSkipBreakdownView {
  @ApiProperty()
  declare readonly activeScan: number;

  @ApiProperty()
  declare readonly duplicateWindow: number;

  @ApiProperty()
  declare readonly freshSuccess: number;

  @ApiProperty()
  declare readonly providerFailureBackoff: number;

  @ApiProperty()
  declare readonly queueBackpressure: number;

  @ApiProperty()
  declare readonly rateLimitBackoff: number;

  @ApiProperty()
  declare readonly sourceUnavailable: number;
}

export class InterestSourceDailyHistoryProviderResponseDto implements InterestSourceDailyHistoryProviderView {
  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly sourceBindingCount: number;

  @ApiProperty()
  declare readonly enabledSourceBindingCount: number;

  @ApiProperty()
  declare readonly pausedSourceBindingCount: number;

  @ApiProperty()
  declare readonly configuredSourceBindingCount: number;

  @ApiProperty()
  declare readonly unconfiguredSourceBindingCount: number;

  @ApiProperty()
  declare readonly scannedSourceBindingCount: number;

  @ApiProperty()
  declare readonly unscannedSourceBindingCount: number;

  @ApiProperty({ enum: sourceHistoryScanCoverageStateValues })
  declare readonly scanCoverageState: InterestSourceDailyHistoryScanCoverageState;

  @ApiProperty()
  declare readonly schedulerDecisionCount: number;

  @ApiProperty()
  declare readonly schedulerEnqueuedCount: number;

  @ApiProperty()
  declare readonly schedulerSkippedCount: number;

  @ApiProperty({ type: () => InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto })
  declare readonly schedulerSkippedByReason: InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly lastSchedulerEvaluatedAt?: string;

  @ApiPropertyOptional({ type: () => InterestSourceDailyHistoryCadenceSummaryResponseDto })
  declare readonly cadenceSummary?: InterestSourceDailyHistoryCadenceSummaryResponseDto;

  @ApiProperty({ enum: sourceHistoryProviderHealthStateValues })
  declare readonly providerHealthState: ScanProviderHealthState;

  @ApiProperty()
  declare readonly totalScans: number;

  @ApiProperty()
  declare readonly succeededScans: number;

  @ApiProperty()
  declare readonly failedScans: number;

  @ApiProperty()
  declare readonly activeScans: number;

  @ApiProperty()
  declare readonly rateLimitedScans: number;

  @ApiProperty()
  declare readonly providerUnavailableScans: number;

  @ApiProperty()
  declare readonly consecutiveFailures: number;

  @ApiProperty()
  declare readonly fetched: number;

  @ApiProperty()
  declare readonly inserted: number;

  @ApiProperty()
  declare readonly skippedDuplicates: number;

  @ApiProperty()
  declare readonly projected: number;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly lastScanRequestedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly lastCompletedAt?: string;

  @ApiProperty()
  declare readonly operatorAction: string;

  @ApiProperty({ type: String, isArray: true })
  declare readonly signals: readonly string[];
}

export class InterestSourceDailyHistoryDayResponseDto implements InterestSourceDailyHistoryDayView {
  @ApiProperty()
  declare readonly date: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly windowStartedAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly windowEndedAt: string;

  @ApiProperty({ enum: sourceHistoryProviderHealthStateValues })
  declare readonly providerHealthState: ScanProviderHealthState;

  @ApiProperty()
  declare readonly sourceBindingCount: number;

  @ApiProperty()
  declare readonly enabledSourceBindingCount: number;

  @ApiProperty()
  declare readonly pausedSourceBindingCount: number;

  @ApiProperty()
  declare readonly configuredSourceBindingCount: number;

  @ApiProperty()
  declare readonly unconfiguredSourceBindingCount: number;

  @ApiProperty()
  declare readonly scannedSourceBindingCount: number;

  @ApiProperty()
  declare readonly unscannedSourceBindingCount: number;

  @ApiProperty({ enum: sourceHistoryScanCoverageStateValues })
  declare readonly scanCoverageState: InterestSourceDailyHistoryScanCoverageState;

  @ApiProperty()
  declare readonly schedulerDecisionCount: number;

  @ApiProperty()
  declare readonly schedulerEnqueuedCount: number;

  @ApiProperty()
  declare readonly schedulerSkippedCount: number;

  @ApiProperty({ type: () => InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto })
  declare readonly schedulerSkippedByReason: InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly lastSchedulerEvaluatedAt?: string;

  @ApiProperty()
  declare readonly totalScans: number;

  @ApiProperty()
  declare readonly succeededScans: number;

  @ApiProperty()
  declare readonly failedScans: number;

  @ApiProperty()
  declare readonly activeScans: number;

  @ApiProperty()
  declare readonly rateLimitedScans: number;

  @ApiProperty()
  declare readonly providerUnavailableScans: number;

  @ApiProperty()
  declare readonly consecutiveFailures: number;

  @ApiProperty()
  declare readonly fetched: number;

  @ApiProperty()
  declare readonly inserted: number;

  @ApiProperty()
  declare readonly skippedDuplicates: number;

  @ApiProperty()
  declare readonly projected: number;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly lastScanRequestedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly lastCompletedAt?: string;

  @ApiProperty()
  declare readonly operatorAction: string;

  @ApiProperty({ type: String, isArray: true })
  declare readonly signals: readonly string[];

  @ApiProperty({ type: () => InterestSourceDailyHistoryProviderResponseDto, isArray: true })
  declare readonly providerBreakdown: readonly InterestSourceDailyHistoryProviderResponseDto[];
}

export class InterestSourceDailyHistorySummaryResponseDto implements InterestSourceDailyHistorySummaryView {
  @ApiProperty({ enum: sourceHistoryProviderHealthStateValues })
  declare readonly providerHealthState: ScanProviderHealthState;

  @ApiProperty()
  declare readonly sourceBindingCount: number;

  @ApiProperty()
  declare readonly enabledSourceBindingCount: number;

  @ApiProperty()
  declare readonly pausedSourceBindingCount: number;

  @ApiProperty()
  declare readonly configuredSourceBindingCount: number;

  @ApiProperty()
  declare readonly unconfiguredSourceBindingCount: number;

  @ApiProperty()
  declare readonly scannedSourceBindingCount: number;

  @ApiProperty()
  declare readonly unscannedSourceBindingCount: number;

  @ApiProperty({ enum: sourceHistoryScanCoverageStateValues })
  declare readonly scanCoverageState: InterestSourceDailyHistoryScanCoverageState;

  @ApiProperty()
  declare readonly schedulerDecisionCount: number;

  @ApiProperty()
  declare readonly schedulerEnqueuedCount: number;

  @ApiProperty()
  declare readonly schedulerSkippedCount: number;

  @ApiProperty({ type: () => InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto })
  declare readonly schedulerSkippedByReason: InterestSourceDailyHistorySchedulerSkipBreakdownResponseDto;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly lastSchedulerEvaluatedAt?: string;

  @ApiProperty()
  declare readonly totalScans: number;

  @ApiProperty()
  declare readonly succeededScans: number;

  @ApiProperty()
  declare readonly failedScans: number;

  @ApiProperty()
  declare readonly activeScans: number;

  @ApiProperty()
  declare readonly rateLimitedScans: number;

  @ApiProperty()
  declare readonly providerUnavailableScans: number;

  @ApiProperty()
  declare readonly consecutiveFailures: number;

  @ApiProperty()
  declare readonly fetched: number;

  @ApiProperty()
  declare readonly inserted: number;

  @ApiProperty()
  declare readonly skippedDuplicates: number;

  @ApiProperty()
  declare readonly projected: number;

  @ApiProperty()
  declare readonly daysWithScans: number;

  @ApiProperty()
  declare readonly daysWithFailures: number;

  @ApiProperty()
  declare readonly daysWithRateLimits: number;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly lastScanRequestedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly lastCompletedAt?: string;

  @ApiProperty()
  declare readonly operatorAction: string;

  @ApiProperty({ type: String, isArray: true })
  declare readonly signals: readonly string[];

  @ApiProperty({ type: () => InterestSourceDailyHistoryProviderResponseDto, isArray: true })
  declare readonly providerBreakdown: readonly InterestSourceDailyHistoryProviderResponseDto[];
}

export class ListInterestSourceDailyHistoryResponseDto implements ListInterestSourceDailyHistoryResult {
  @ApiProperty()
  declare readonly interestId: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly windowStartedAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly windowEndedAt: string;

  @ApiProperty({ type: () => InterestSourceDailyHistorySummaryResponseDto })
  declare readonly summary: InterestSourceDailyHistorySummaryResponseDto;

  @ApiProperty({ type: () => InterestSourceDailyHistoryDayResponseDto, isArray: true })
  declare readonly days: readonly InterestSourceDailyHistoryDayResponseDto[];

  @ApiProperty()
  declare readonly truncated: boolean;

  @ApiProperty()
  declare readonly maxScanJobs: number;
}
