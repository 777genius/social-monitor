import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  ListTopicSourceDailyHistoryResult,
  TopicSourceDailyHistoryCadenceSummaryView,
  TopicSourceDailyHistoryDayView,
  TopicSourceDailyHistoryProviderView,
  TopicSourceDailyHistorySummaryView,
} from '../../features/list-topic-source-daily-history/list-topic-source-daily-history.result';
import type { ScanProviderHealthState } from '../../features/shared/scan-provider-health-summary';

const sourceHistoryProviderHealthStateValues = [
  'unknown',
  'operational',
  'degraded',
  'down',
] as const satisfies readonly ScanProviderHealthState[];

export class TopicSourceDailyHistoryCadenceSummaryResponseDto implements TopicSourceDailyHistoryCadenceSummaryView {
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

export class TopicSourceDailyHistoryProviderResponseDto implements TopicSourceDailyHistoryProviderView {
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

  @ApiPropertyOptional({ type: () => TopicSourceDailyHistoryCadenceSummaryResponseDto })
  declare readonly cadenceSummary?: TopicSourceDailyHistoryCadenceSummaryResponseDto;

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

export class TopicSourceDailyHistoryDayResponseDto implements TopicSourceDailyHistoryDayView {
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

  @ApiProperty({ type: () => TopicSourceDailyHistoryProviderResponseDto, isArray: true })
  declare readonly providerBreakdown: readonly TopicSourceDailyHistoryProviderResponseDto[];
}

export class TopicSourceDailyHistorySummaryResponseDto implements TopicSourceDailyHistorySummaryView {
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

  @ApiProperty({ type: () => TopicSourceDailyHistoryProviderResponseDto, isArray: true })
  declare readonly providerBreakdown: readonly TopicSourceDailyHistoryProviderResponseDto[];
}

export class ListTopicSourceDailyHistoryResponseDto implements ListTopicSourceDailyHistoryResult {
  @ApiProperty()
  declare readonly topicId: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly windowStartedAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly windowEndedAt: string;

  @ApiProperty({ type: () => TopicSourceDailyHistorySummaryResponseDto })
  declare readonly summary: TopicSourceDailyHistorySummaryResponseDto;

  @ApiProperty({ type: () => TopicSourceDailyHistoryDayResponseDto, isArray: true })
  declare readonly days: readonly TopicSourceDailyHistoryDayResponseDto[];

  @ApiProperty()
  declare readonly truncated: boolean;

  @ApiProperty()
  declare readonly maxScanJobs: number;
}
