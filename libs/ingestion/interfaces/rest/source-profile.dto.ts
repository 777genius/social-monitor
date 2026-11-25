import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  SourceProfileEntry,
  SourceProfileHealthExplanation,
  SourceProfileHealthState,
} from '../../features/list-source-profiles/list-source-profiles.result';
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

export const sourceProfileHealthStateValues = [
  'healthy',
  'stale',
  'rate_limited',
  'auth_failed',
  'degraded',
  'unsupported_scope',
] as const satisfies readonly SourceProfileHealthState[];

export class SourceProfileHealthDto implements SourceProfileHealthExplanation {
  @ApiProperty({ enum: sourceProfileHealthStateValues })
  declare readonly state: SourceProfileHealthState;

  @ApiProperty()
  declare readonly reasonCode: string;

  @ApiProperty()
  declare readonly message: string;

  @ApiProperty({ type: [String] })
  declare readonly signals: readonly string[];
}

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

export class SourceProfileLiveEvidenceRequirementDto {
  @ApiProperty()
  declare readonly signalId: string;

  @ApiProperty()
  declare readonly description: string;

  @ApiProperty()
  declare readonly verificationCommand: string;

  @ApiPropertyOptional()
  declare readonly artifactEnv?: string;

  @ApiProperty({ enum: ['external_beta'] })
  declare readonly requiredFor: 'external_beta';
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

  @ApiProperty({ type: () => SourceProfileHealthDto })
  declare readonly health: SourceProfileHealthDto;

  @ApiProperty({ enum: sourceReadinessStateValues })
  declare readonly readinessState: SourceReadinessState;

  @ApiProperty({ enum: sourceRuntimeReadinessValues })
  declare readonly runtimeReadiness: SourceRuntimeReadiness;

  @ApiProperty({ type: [String] })
  declare readonly liveBetaBlockers: readonly string[];

  @ApiProperty({ type: () => [SourceProfileLiveEvidenceRequirementDto] })
  declare readonly liveEvidenceRequirements: readonly SourceProfileLiveEvidenceRequirementDto[];

  @ApiPropertyOptional({ type: () => SourceProfileFreshnessGuardDto })
  declare readonly freshnessGuard?: SourceProfileFreshnessGuardDto;

  @ApiProperty()
  declare readonly acquisitionMode: string;

  @ApiProperty({ type: [String] })
  declare readonly supportedContentUnits: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly unsupportedContentUnits: SourceProfileEntry['unsupportedContentUnits'];

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
