import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { socialSourceRuntimeReadinessStates } from '../../domain/value-objects/social-source-capability-profile';
import type {
  SerializedRankedSocialSearchItem,
  SerializedSocialSearchPlan,
  SerializedSocialSearchRun,
  SerializedSocialThread,
} from '../tools/social-research-tool-serializers';
import type {
  ListSocialSourcesToolResult,
} from '../tools/social-research-tool-handlers';
import type { SocialSourceReadinessExplanation } from '../../application/social-source-discovery';

export class SocialResearchExecutionRestDto {
  @ApiProperty()
  declare readonly scanJobId: string;

  @ApiPropertyOptional()
  declare readonly correlationId?: string;

  @ApiProperty({ type: Object })
  declare readonly sourceBindingIdBySource: Readonly<Record<string, string>>;

  @ApiPropertyOptional({ type: Object })
  declare readonly cursorByLaneId?: Readonly<Record<string, string>>;
}

export class SearchSocialRestRequestDto {
  @ApiProperty()
  declare readonly topic: string;

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  declare readonly sources?: string | readonly string[];

  @ApiPropertyOptional({
    enum: ['broad_research', 'trend_scan', 'support_watch', 'competitor_scan'],
  })
  declare readonly preset?: string;

  @ApiPropertyOptional({ type: Object })
  declare readonly window?: unknown;

  @ApiPropertyOptional({ enum: ['light', 'balanced', 'deep'] })
  declare readonly depth?: string;

  @ApiPropertyOptional({
    enum: ['research', 'trend', 'support', 'competitor', 'security'],
  })
  declare readonly goal?: string;

  @ApiPropertyOptional({ type: Object })
  declare readonly entities?: unknown;

  @ApiPropertyOptional({ type: [Object] })
  declare readonly accounts?: unknown;

  @ApiPropertyOptional({ type: [Object] })
  declare readonly handles?: unknown;

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  declare readonly products?: string | readonly string[];

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  declare readonly keywords?: string | readonly string[];

  @ApiPropertyOptional({ type: [Object] })
  declare readonly communities?: unknown;

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  declare readonly urls?: string | readonly string[];

  @ApiPropertyOptional({ type: [String] })
  declare readonly defaultSources?: readonly string[];

  @ApiPropertyOptional()
  declare readonly maxLanes?: number;

  @ApiPropertyOptional({ type: [Object] })
  declare readonly sourceLimits?: readonly unknown[];

  @ApiPropertyOptional({ type: Object })
  declare readonly queryStrategyRecipe?: unknown;

  @ApiPropertyOptional({
    enum: socialSourceRuntimeReadinessStates,
    isArray: true,
  })
  declare readonly executionAllowedRuntimeReadiness?: readonly string[];

  @ApiPropertyOptional()
  declare readonly warnWhenSourceReadinessMissing?: boolean;

  @ApiProperty({ type: () => SocialResearchExecutionRestDto })
  declare readonly execution: SocialResearchExecutionRestDto;
}

export class ExplainSearchPlanRestRequestDto {
  @ApiProperty()
  declare readonly topic: string;

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  declare readonly sources?: string | readonly string[];

  @ApiPropertyOptional({
    enum: ['broad_research', 'trend_scan', 'support_watch', 'competitor_scan'],
  })
  declare readonly preset?: string;

  @ApiPropertyOptional({ type: Object })
  declare readonly window?: unknown;

  @ApiPropertyOptional({ enum: ['light', 'balanced', 'deep'] })
  declare readonly depth?: string;

  @ApiPropertyOptional({
    enum: ['research', 'trend', 'support', 'competitor', 'security'],
  })
  declare readonly goal?: string;

  @ApiPropertyOptional({ type: Object })
  declare readonly entities?: unknown;

  @ApiPropertyOptional({ type: [Object] })
  declare readonly accounts?: unknown;

  @ApiPropertyOptional({ type: [Object] })
  declare readonly handles?: unknown;

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  declare readonly products?: string | readonly string[];

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  declare readonly keywords?: string | readonly string[];

  @ApiPropertyOptional({ type: [Object] })
  declare readonly communities?: unknown;

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  declare readonly urls?: string | readonly string[];

  @ApiPropertyOptional({ type: [String] })
  declare readonly defaultSources?: readonly string[];

  @ApiPropertyOptional()
  declare readonly maxLanes?: number;

  @ApiPropertyOptional({ type: [Object] })
  declare readonly sourceLimits?: readonly unknown[];

  @ApiPropertyOptional({ type: Object })
  declare readonly queryStrategyRecipe?: unknown;

  @ApiPropertyOptional({
    enum: socialSourceRuntimeReadinessStates,
    isArray: true,
  })
  declare readonly executionAllowedRuntimeReadiness?: readonly string[];

  @ApiPropertyOptional()
  declare readonly warnWhenSourceReadinessMissing?: boolean;
}

export class FetchSocialThreadRestRequestDto {
  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;

  @ApiPropertyOptional()
  declare readonly sourceKey?: string;

  @ApiPropertyOptional()
  declare readonly externalId?: string;

  @ApiPropertyOptional()
  declare readonly maxDepth?: number;

  @ApiProperty({ type: () => SocialResearchExecutionRestDto })
  declare readonly execution: SocialResearchExecutionRestDto;
}

export class RankSocialResultsRestRequestDto {
  @ApiProperty()
  declare readonly topic: string;

  @ApiPropertyOptional({
    enum: ['research', 'trend', 'support', 'competitor', 'security'],
  })
  declare readonly goal?: string;

  @ApiPropertyOptional({ type: Object })
  declare readonly entities?: unknown;

  @ApiPropertyOptional({ type: Object })
  declare readonly rankingRecipe?: unknown;

  @ApiProperty({ type: [Object] })
  declare readonly items: readonly unknown[];

  @ApiPropertyOptional()
  declare readonly limit?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly now?: string;
}

export class ListSocialSourcesRestRequestDto {
  @ApiPropertyOptional({ type: [String] })
  declare readonly sourceKeys?: readonly string[];

  @ApiPropertyOptional()
  declare readonly includeProfileOnly?: boolean;

  @ApiPropertyOptional()
  declare readonly includeProviderRuntimeGated?: boolean;

  @ApiPropertyOptional()
  declare readonly includeRejected?: boolean;
}

export class ExplainSourceReadinessRestRequestDto {
  @ApiProperty()
  declare readonly sourceKey: string;
}

export class SearchSocialRestResponseDto {
  @ApiProperty({ type: Object })
  declare readonly run: SerializedSocialSearchRun;
}

export class ExplainSearchPlanRestResponseDto {
  @ApiProperty({ type: Object })
  declare readonly plan: SerializedSocialSearchPlan;

  @ApiProperty()
  declare readonly explanation: string;
}

export class FetchSocialThreadRestResponseDto {
  @ApiProperty({ type: Object })
  declare readonly thread: SerializedSocialThread;
}

export class RankSocialResultsRestResponseDto {
  @ApiProperty({ type: [Object] })
  declare readonly rankedItems: readonly SerializedRankedSocialSearchItem[];
}

export class ListSocialSourcesRestResponseDto
  implements ListSocialSourcesToolResult
{
  @ApiProperty({ type: [Object] })
  declare readonly sources: ListSocialSourcesToolResult['sources'];
}

export class ExplainSourceReadinessRestResponseDto
  implements SocialSourceReadinessExplanation
{
  @ApiProperty({ type: Object })
  declare readonly source: SocialSourceReadinessExplanation['source'];

  @ApiProperty()
  declare readonly canPlan: boolean;

  @ApiProperty()
  declare readonly canExecuteWithDefaultPolicy: boolean;

  @ApiProperty()
  declare readonly summary: string;

  @ApiProperty({ type: [String] })
  declare readonly reasons: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly warnings: readonly string[];
}
