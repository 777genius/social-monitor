import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  SourceBindingOverviewDegradationReasonCode,
  SourceBindingOverviewDegradationReasonView,
  SourceBindingOverviewDegradationSeverity,
  SourceBindingOverviewProviderBreakdownView,
  SourceBindingOverviewSummaryView,
} from '../../features/list-source-binding-overview/list-source-binding-overview.result';
import { SourceBindingHealthResponseDto } from './source-binding-health.dto';

const sourceBindingOverviewDegradationReasonCodeValues = [
  'rate_limited',
  'auth_failed',
  'unsupported_scope',
  'provider_unavailable',
  'provider_down',
  'stale_data',
  'scan_policy_missing',
  'source_paused',
  'worker_conflict',
  'system_failure',
  'degraded',
] as const satisfies readonly SourceBindingOverviewDegradationReasonCode[];

const sourceBindingOverviewDegradationSeverityValues = [
  'info',
  'warning',
  'critical',
] as const satisfies readonly SourceBindingOverviewDegradationSeverity[];

export class SourceBindingOverviewDegradationReasonResponseDto implements SourceBindingOverviewDegradationReasonView {
  @ApiProperty({ enum: sourceBindingOverviewDegradationReasonCodeValues })
  declare readonly code: SourceBindingOverviewDegradationReasonCode;

  @ApiProperty({ enum: sourceBindingOverviewDegradationSeverityValues })
  declare readonly severity: SourceBindingOverviewDegradationSeverity;

  @ApiProperty()
  declare readonly affectedBindings: number;

  @ApiProperty()
  declare readonly operatorAction: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly nextEligibleAt?: string;

  @ApiProperty({ type: String, isArray: true })
  declare readonly sampleSourceBindingIds: readonly string[];

  @ApiProperty({ type: String, isArray: true })
  declare readonly signals: readonly string[];
}

export class SourceBindingOverviewProviderBreakdownResponseDto implements SourceBindingOverviewProviderBreakdownView {
  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly totalBindings: number;

  @ApiProperty()
  declare readonly healthyBindings: number;

  @ApiProperty()
  declare readonly staleBindings: number;

  @ApiProperty()
  declare readonly rateLimitedBindings: number;

  @ApiProperty()
  declare readonly authFailedBindings: number;

  @ApiProperty()
  declare readonly unsupportedScopeBindings: number;

  @ApiProperty()
  declare readonly degradedBindings: number;

  @ApiProperty()
  declare readonly downBindings: number;

  @ApiProperty()
  declare readonly scanningBindings: number;

  @ApiProperty()
  declare readonly pausedBindings: number;

  @ApiProperty()
  declare readonly notConfiguredBindings: number;

  @ApiProperty()
  declare readonly scheduledBindings: number;

  @ApiProperty()
  declare readonly canScanNowBindings: number;

  @ApiProperty()
  declare readonly freshSuccessSkips: number;

  @ApiProperty()
  declare readonly rateLimitBackoffSkips: number;

  @ApiProperty()
  declare readonly providerFailureBackoffSkips: number;

  @ApiProperty()
  declare readonly providerUnavailableScans: number;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly nextEligibleAt?: string;

  @ApiProperty({ type: () => SourceBindingOverviewDegradationReasonResponseDto, isArray: true })
  declare readonly degradationReasons: readonly SourceBindingOverviewDegradationReasonResponseDto[];

  @ApiProperty({ type: String, isArray: true })
  declare readonly signals: readonly string[];
}

export class SourceBindingOverviewSummaryResponseDto implements SourceBindingOverviewSummaryView {
  @ApiProperty()
  declare readonly totalBindings: number;

  @ApiProperty()
  declare readonly healthyBindings: number;

  @ApiProperty()
  declare readonly staleBindings: number;

  @ApiProperty()
  declare readonly authFailedBindings: number;

  @ApiProperty()
  declare readonly unsupportedScopeBindings: number;

  @ApiProperty()
  declare readonly degradedBindings: number;

  @ApiProperty()
  declare readonly downBindings: number;

  @ApiProperty()
  declare readonly scanningBindings: number;

  @ApiProperty()
  declare readonly pausedBindings: number;

  @ApiProperty()
  declare readonly notConfiguredBindings: number;

  @ApiProperty()
  declare readonly scheduledBindings: number;

  @ApiProperty()
  declare readonly canScanNowBindings: number;

  @ApiProperty()
  declare readonly freshSuccessSkips: number;

  @ApiProperty()
  declare readonly rateLimitedBindings: number;

  @ApiProperty()
  declare readonly providerFailureBackoffSkips: number;

  @ApiProperty()
  declare readonly providerUnavailableScans: number;

  @ApiProperty()
  declare readonly attentionRequiredBindings: number;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly nextEligibleAt?: string;

  @ApiProperty()
  declare readonly operatorAction: string;

  @ApiProperty({ type: () => SourceBindingOverviewDegradationReasonResponseDto, isArray: true })
  declare readonly degradationReasons: readonly SourceBindingOverviewDegradationReasonResponseDto[];

  @ApiProperty({ type: String, isArray: true })
  declare readonly signals: readonly string[];

  @ApiProperty({ type: () => SourceBindingOverviewProviderBreakdownResponseDto, isArray: true })
  declare readonly providerBreakdown: readonly SourceBindingOverviewProviderBreakdownResponseDto[];
}

export class ListSourceBindingOverviewResponseDto {
  @ApiProperty({ type: () => SourceBindingOverviewSummaryResponseDto })
  declare readonly summary: SourceBindingOverviewSummaryResponseDto;

  @ApiProperty({ type: () => [SourceBindingHealthResponseDto] })
  declare readonly items: readonly SourceBindingHealthResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
