import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

import type {
  PlanInterestCoverageResult,
  InterestCoveragePlanApplyTarget,
  InterestCoveragePlanBindingDraft,
  InterestCoveragePlanCadenceSuggestion,
  InterestCoveragePlanDraft,
  InterestCoveragePlanDraftStatus,
  InterestCoverageSourcePackProviderStarter,
  InterestCoverageSourcePackView,
} from "../../features/plan-interest-coverage/plan-interest-coverage.result";
import type { SourceBindingConfig } from "../../ports";
import { normalizeSourceBindingConfig } from "./bind-source.dto";
import { InterestResponseDto } from "./list-interests.dto";

export class PlanInterestCoverageRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  declare readonly description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  declare readonly sourcePackKey?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare readonly keywords?: readonly string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare readonly subreddits?: readonly string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare readonly rssFeedUrls?: readonly string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare readonly includeProviders?: readonly string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare readonly excludeProviders?: readonly string[];
}

export class InterestCoveragePlanApplyTargetDto implements InterestCoveragePlanApplyTarget {
  @ApiProperty({ enum: ["POST"] })
  declare readonly method: "POST";

  @ApiProperty()
  declare readonly path: string;

  @ApiProperty({ enum: ["write:source_bindings"] })
  declare readonly requiredScope: "write:source_bindings";
}

export class InterestCoveragePlanBindingDraftDto implements InterestCoveragePlanBindingDraft {
  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  @IsObject()
  declare readonly config: SourceBindingConfig;
}

export class InterestCoveragePlanAlternativeDraftDto {
  @ApiProperty()
  declare readonly label: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  declare readonly config: SourceBindingConfig;

  @ApiProperty({ type: [String] })
  declare readonly rationale: readonly string[];
}

export class InterestCoveragePlanCadenceSuggestionDto implements InterestCoveragePlanCadenceSuggestion {
  @ApiProperty()
  declare readonly intervalSeconds: number;

  @ApiProperty()
  declare readonly freshnessSeconds: number;

  @ApiProperty()
  declare readonly retryBudget: number;
}

export class InterestCoveragePlanDraftDto implements InterestCoveragePlanDraft {
  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly displayName: string;

  @ApiProperty({
    enum: ["ready", "needs_input", "already_bound", "unsupported"],
  })
  declare readonly status: InterestCoveragePlanDraftStatus;

  @ApiProperty()
  declare readonly confidenceScore: number;

  @ApiProperty()
  declare readonly priority: number;

  @ApiProperty({ type: [String] })
  declare readonly targetContentUnits: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly queryModes: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly rationale: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly warnings: readonly string[];

  @ApiPropertyOptional({ type: () => InterestCoveragePlanBindingDraftDto })
  declare readonly sourceBindingDraft?: InterestCoveragePlanBindingDraftDto;

  @ApiProperty({ type: () => [InterestCoveragePlanAlternativeDraftDto] })
  declare readonly alternativeDrafts: readonly InterestCoveragePlanAlternativeDraftDto[];

  @ApiPropertyOptional({ type: () => InterestCoveragePlanApplyTargetDto })
  declare readonly applyTarget?: InterestCoveragePlanApplyTargetDto;

  @ApiPropertyOptional()
  declare readonly existingSourceBindingId?: string;

  @ApiPropertyOptional({ type: () => InterestCoveragePlanCadenceSuggestionDto })
  declare readonly cadenceSuggestion?: InterestCoveragePlanCadenceSuggestionDto;
}

export class InterestCoveragePlanSkippedProviderDto {
  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly reason: string;
}

export class InterestCoverageSourcePackProviderStarterDto implements InterestCoverageSourcePackProviderStarter {
  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly label: string;

  @ApiProperty({ type: [String] })
  declare readonly keywords: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly queries: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly subreddits: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly topics: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly languages: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly rssFeedUrls: readonly string[];
}

export class InterestCoverageSourcePackDto implements InterestCoverageSourcePackView {
  @ApiProperty()
  declare readonly key: string;

  @ApiProperty()
  declare readonly displayName: string;

  @ApiProperty()
  declare readonly description: string;

  @ApiProperty({ type: () => [InterestCoverageSourcePackProviderStarterDto] })
  declare readonly providerStarters: readonly InterestCoverageSourcePackProviderStarterDto[];
}

export class PlanInterestCoverageResponseDto implements PlanInterestCoverageResult {
  @ApiProperty({ type: () => InterestResponseDto })
  declare readonly interest: InterestResponseDto;

  @ApiProperty()
  declare readonly planningQuery: string;

  @ApiProperty({ type: [String] })
  declare readonly normalizedKeywords: readonly string[];

  @ApiPropertyOptional({ type: () => InterestCoverageSourcePackDto })
  declare readonly sourcePack?: InterestCoverageSourcePackDto;

  @ApiProperty({ type: () => [InterestCoveragePlanDraftDto] })
  declare readonly drafts: readonly InterestCoveragePlanDraftDto[];

  @ApiProperty({ type: [String] })
  declare readonly coverageGaps: readonly string[];

  @ApiProperty({ type: () => [InterestCoveragePlanSkippedProviderDto] })
  declare readonly skippedProviders: readonly InterestCoveragePlanSkippedProviderDto[];
}

export const normalizePlanInterestCoverageRequest = (
  body: PlanInterestCoverageRequestDto,
): Omit<
  PlanInterestCoverageRequestDto,
  | "keywords"
  | "subreddits"
  | "rssFeedUrls"
  | "includeProviders"
  | "excludeProviders"
> & {
  readonly keywords?: readonly string[];
  readonly subreddits?: readonly string[];
  readonly rssFeedUrls?: readonly string[];
  readonly includeProviders?: readonly string[];
  readonly excludeProviders?: readonly string[];
} => ({
  ...(normalizeOptionalString(body.description) === undefined
    ? {}
    : { description: normalizeOptionalString(body.description) }),
  ...(normalizeOptionalString(body.sourcePackKey) === undefined
    ? {}
    : { sourcePackKey: normalizeOptionalString(body.sourcePackKey) }),
  ...normalizeOptionalStringArray("keywords", body.keywords),
  ...normalizeOptionalStringArray("subreddits", body.subreddits),
  ...normalizeOptionalStringArray("rssFeedUrls", body.rssFeedUrls),
  ...normalizeOptionalStringArray("includeProviders", body.includeProviders),
  ...normalizeOptionalStringArray("excludeProviders", body.excludeProviders),
});

export const normalizePlanDraftConfig = (
  config: Readonly<Record<string, unknown>>,
): SourceBindingConfig => normalizeSourceBindingConfig(config);

const normalizeOptionalString = (
  value: string | undefined,
): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

const normalizeOptionalStringArray = (
  field:
    | "keywords"
    | "subreddits"
    | "rssFeedUrls"
    | "includeProviders"
    | "excludeProviders",
  values: readonly string[] | undefined,
): Partial<Record<typeof field, readonly string[]>> => {
  if (values === undefined) {
    return {};
  }

  const normalized = values.map((value) => value.trim()).filter(Boolean);

  return normalized.length === 0 ? {} : { [field]: normalized };
};
