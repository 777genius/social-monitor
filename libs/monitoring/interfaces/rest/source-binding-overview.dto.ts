import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  SourceBindingOverviewProviderBreakdownView,
  SourceBindingOverviewSummaryView,
} from '../../features/list-source-binding-overview/list-source-binding-overview.result';
import { SourceBindingHealthResponseDto } from './source-binding-health.dto';

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
  declare readonly degradedBindings: number;

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
  declare readonly degradedBindings: number;

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
