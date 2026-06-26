import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ScanJobStatus } from '../../domain';
import type {
  ListSourceBindingDailyHistoryResult,
  SourceBindingDailyHistoryDayView,
  SourceBindingDailyHistorySummaryView,
} from '../../features/list-source-binding-daily-history/list-source-binding-daily-history.result';
import type {
  RequestScanDecision,
  RequestScanDecisionView,
} from '../../features/request-scan/request-scan.result';
import type { ScanProviderHealthState } from '../../features/shared/scan-provider-health-summary';
import { scanJobStatusValues, ScanStatusResponseDto } from './scan-status.dto';

const scanProviderHealthStateValues = [
  'unknown',
  'operational',
  'degraded',
  'down',
] as const satisfies readonly ScanProviderHealthState[];
const requestScanDecisionValues = [
  'created',
  'idempotent_replay',
  'active_scan',
  'fresh_success',
  'rate_limit_backoff',
  'provider_failure_backoff',
] as const satisfies readonly RequestScanDecision[];

export class RequestScanDecisionResponseDto implements RequestScanDecisionView {
  @ApiProperty({ enum: requestScanDecisionValues })
  declare readonly decision: RequestScanDecision;

  @ApiProperty()
  declare readonly reason: string;

  @ApiProperty()
  declare readonly createdNewScan: boolean;

  @ApiPropertyOptional()
  declare readonly minimumIntervalSeconds?: number;

  @ApiPropertyOptional()
  declare readonly configuredIntervalSeconds?: number;

  @ApiPropertyOptional()
  declare readonly effectiveIntervalSeconds?: number;

  @ApiPropertyOptional()
  declare readonly freshnessSeconds?: number;

  @ApiPropertyOptional()
  declare readonly providerMinimumIntervalEnforced?: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly nextEligibleAt?: string;

  @ApiPropertyOptional()
  declare readonly waitSeconds?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly freshnessDeadlineAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly rateLimitBackoffUntil?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly providerFailureBackoffUntil?: string;

  @ApiProperty({ type: String, isArray: true })
  declare readonly signals: readonly string[];
}

export class RequestScanResponseDto {
  @ApiProperty()
  declare readonly scanJobId: string;

  @ApiProperty({ enum: scanJobStatusValues })
  declare readonly status: ScanJobStatus;

  @ApiProperty()
  declare readonly created: boolean;

  @ApiProperty({ type: () => RequestScanDecisionResponseDto })
  declare readonly requestDecision: RequestScanDecisionResponseDto;
}

export class ListScanRequestsResponseDto {
  @ApiProperty({ type: () => ScanStatusResponseDto, isArray: true })
  declare readonly scanRequests: readonly ScanStatusResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}

export class SourceBindingDailyScanHistoryDayResponseDto implements SourceBindingDailyHistoryDayView {
  @ApiProperty()
  declare readonly date: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly windowStartedAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly windowEndedAt: string;

  @ApiProperty({ enum: scanProviderHealthStateValues })
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

export class SourceBindingDailyScanHistorySummaryResponseDto implements SourceBindingDailyHistorySummaryView {
  @ApiProperty({ enum: scanProviderHealthStateValues })
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
}

export class ListSourceBindingDailyScanHistoryResponseDto implements ListSourceBindingDailyHistoryResult {
  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly topicId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty({ enum: ['enabled', 'paused'] })
  declare readonly sourceBindingStatus: 'enabled' | 'paused';

  @ApiProperty({ format: 'date-time' })
  declare readonly windowStartedAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly windowEndedAt: string;

  @ApiPropertyOptional({ type: () => SourceBindingDailyScanHistorySummaryResponseDto })
  declare readonly summary?: SourceBindingDailyScanHistorySummaryResponseDto;

  @ApiProperty({ type: () => SourceBindingDailyScanHistoryDayResponseDto, isArray: true })
  declare readonly days: readonly SourceBindingDailyScanHistoryDayResponseDto[];

  @ApiProperty()
  declare readonly truncated: boolean;

  @ApiProperty()
  declare readonly maxScanJobs: number;
}
