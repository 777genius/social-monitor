import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { SourceProfileEntry } from '../../features/list-source-profiles/list-source-profiles.result';
import type { SourceReadinessState, SourceRuntimeReadiness } from '../../ports';

export const sourceReadinessStateValues = [
  'research_only',
  'profiled',
  'certification_ready',
  'enabled_beta',
  'provider_only',
  'manual_only',
  'rejected',
] as const satisfies readonly SourceReadinessState[];

export const sourceRuntimeReadinessValues = [
  'fixture_ready',
  'live_beta_ready',
  'deferred',
] as const satisfies readonly SourceRuntimeReadiness[];

export class SourceProfileFreshnessGuardDto {
  @ApiProperty()
  declare readonly maxStalenessSeconds: number;

  @ApiProperty()
  declare readonly minimumScanIntervalSeconds: number;

  @ApiProperty()
  declare readonly skipRecentlyScanned: boolean;

  @ApiProperty()
  declare readonly scanHistoryRequired: boolean;

  @ApiProperty()
  declare readonly cursorResumeRequired: boolean;

  @ApiProperty()
  declare readonly rateLimitBackoffRequired: boolean;

  @ApiProperty({ enum: ['stale', 'degraded'] })
  declare readonly staleReadModelState: 'stale' | 'degraded';

  @ApiProperty({ enum: ['degraded', 'down'] })
  declare readonly providerFailureHealthState: 'degraded' | 'down';

  @ApiProperty({ type: [String] })
  declare readonly signals: readonly string[];
}

export class SourceProfileDto implements SourceProfileEntry {
  @ApiProperty()
  declare readonly providerKey: string;

  @ApiPropertyOptional()
  declare readonly displayName?: string;

  @ApiPropertyOptional()
  declare readonly capabilityVersion?: number;

  @ApiProperty()
  declare readonly productionSafe: boolean;

  @ApiProperty({ enum: sourceReadinessStateValues })
  declare readonly readinessState: SourceReadinessState;

  @ApiProperty({ enum: sourceRuntimeReadinessValues })
  declare readonly runtimeReadiness: SourceRuntimeReadiness;

  @ApiProperty({ type: [String] })
  declare readonly liveBetaBlockers: readonly string[];

  @ApiPropertyOptional({ type: () => SourceProfileFreshnessGuardDto })
  declare readonly freshnessGuard?: SourceProfileFreshnessGuardDto;

  @ApiProperty()
  declare readonly acquisitionMode: string;

  @ApiProperty({ type: [String] })
  declare readonly supportedContentUnits: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly supportedQueryModes: readonly string[];

  @ApiProperty()
  declare readonly cursorModel: string;

  @ApiProperty()
  declare readonly quotaModel: string;

  @ApiProperty({ type: [String] })
  declare readonly limitations: readonly string[];
}

export class ListSourceProfilesResponseDto {
  @ApiProperty({ type: () => [SourceProfileDto] })
  declare readonly sources: readonly SourceProfileDto[];
}
