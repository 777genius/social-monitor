import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

import {
  readerSummaryCitationFields,
  readerSummaryConfidenceLevels,
  readerSummaryQualityFlags,
  readerSummaryRiskReasons,
} from "./reader-summary-contract.constants";
import { ReaderSummaryReaderBriefDto } from "./reader-summary-reader.dto";

export class ReaderSummaryScopeDto {
  @ApiProperty({ enum: ["workspace", "interest"] })
  @IsIn(["workspace", "interest"])
  declare readonly type: "workspace" | "interest";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly interestId?: string;
}

export class ReaderSummarySourceWindowDto {
  @ApiProperty()
  declare readonly windowId: string;

  @ApiProperty({ format: "date-time" })
  declare readonly startedAt: string;

  @ApiProperty({ format: "date-time" })
  declare readonly endedAt: string;

  @ApiProperty({ type: [String] })
  declare readonly selectedFeedItemIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly storyClusterIds: readonly string[];
}

export class ReaderSummaryPeriodDto {
  @ApiProperty({ enum: ["daily", "weekly", "monthly", "custom"] })
  declare readonly cadence: "daily" | "weekly" | "monthly" | "custom";

  @ApiProperty({ format: "date-time" })
  declare readonly startedAt: string;

  @ApiProperty({ format: "date-time" })
  declare readonly endedAt: string;

  @ApiProperty()
  declare readonly timezone: string;

  @ApiProperty()
  declare readonly periodKey: string;
}

export class ReaderSummaryObservedAtRangeDto {
  @ApiProperty({ format: "date-time" })
  declare readonly startedAt: string;

  @ApiProperty({ format: "date-time" })
  declare readonly endedAt: string;
}

export class ReaderSummaryStorySignalBreakdownDto {
  @ApiProperty()
  declare readonly baseScore: number;

  @ApiProperty()
  declare readonly crossProviderSupport: number;

  @ApiProperty()
  declare readonly sameProviderSupport: number;

  @ApiProperty()
  declare readonly providerDiversityBoost: number;

  @ApiProperty()
  declare readonly interestDiversityBoost: number;

  @ApiProperty()
  declare readonly freshnessBoost: number;

  @ApiProperty()
  declare readonly totalScore: number;
}

export class ReaderSummaryStoryClusterDto {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly storyKey: string;

  @ApiPropertyOptional()
  declare readonly rankingPolicyVersion?: string;

  @ApiProperty()
  declare readonly representativeFeedItemId: string;

  @ApiProperty({ type: [String] })
  declare readonly duplicateFeedItemIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly interestIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly providerKeys: readonly string[];

  @ApiProperty()
  declare readonly score: number;

  @ApiPropertyOptional({ type: () => ReaderSummaryStorySignalBreakdownDto })
  declare readonly signalBreakdown?: ReaderSummaryStorySignalBreakdownDto;

  @ApiProperty({ type: () => ReaderSummaryObservedAtRangeDto })
  declare readonly observedAtRange: ReaderSummaryObservedAtRangeDto;

  @ApiProperty({ type: [String] })
  declare readonly whyImportant: readonly string[];
}

export class ReaderSummaryCitationViewDto {
  @ApiProperty()
  declare readonly citationId: string;

  @ApiProperty()
  declare readonly label: string;

  @ApiProperty()
  declare readonly feedItemId: string;

  @ApiProperty()
  declare readonly sourceItemId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty({ enum: readerSummaryCitationFields })
  declare readonly field: (typeof readerSummaryCitationFields)[number];

  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;
}

export class ReaderSummaryTopStoryDto {
  @ApiProperty()
  declare readonly storyClusterId: string;

  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly summary: string;

  @ApiProperty({ type: [String] })
  declare readonly interestIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly providerKeys: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class ReaderSummaryInterestHighlightDto {
  @ApiProperty()
  declare readonly interestId: string;

  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly summary: string;

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class ReaderSummaryRepeatedSignalDto {
  @ApiProperty()
  declare readonly storyClusterId: string;

  @ApiProperty()
  declare readonly title: string;

  @ApiProperty({ type: [String] })
  declare readonly interestIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class ReaderSummaryRiskDto {
  @ApiProperty()
  declare readonly description: string;

  @ApiPropertyOptional({ type: [String] })
  declare readonly citationIds?: readonly string[];

  @ApiPropertyOptional({ enum: readerSummaryRiskReasons })
  declare readonly reason?: (typeof readerSummaryRiskReasons)[number];
}

export class ReaderSummaryContextArtifactDto {
  @ApiProperty()
  declare readonly artifactId: string;

  @ApiProperty({ type: () => ReaderSummaryScopeDto })
  declare readonly scope: ReaderSummaryScopeDto;

  @ApiProperty({ type: () => ReaderSummaryPeriodDto })
  declare readonly period: ReaderSummaryPeriodDto;

  @ApiProperty()
  declare readonly summaryText: string;

  @ApiProperty({ format: "date-time" })
  declare readonly generatedAt: string;

  @ApiProperty({ enum: ["fresh", "stale", "unknown"] })
  declare readonly freshness: "fresh" | "stale" | "unknown";
}

export class ReaderSummaryPersonalizationDto {
  @ApiProperty({ enum: ["disabled", "available", "empty", "unavailable"] })
  declare readonly memoryGuidanceStatus:
    | "disabled"
    | "available"
    | "empty"
    | "unavailable";

  @ApiProperty()
  declare readonly memoryGuidanceApplied: boolean;

  @ApiProperty()
  declare readonly providerPreferenceCount: number;

  @ApiProperty()
  declare readonly keywordPreferenceCount: number;

  @ApiProperty()
  declare readonly mutedKeywordCount: number;

  @ApiProperty()
  declare readonly blockedProviderCount: number;

  @ApiProperty({ type: [String] })
  declare readonly signals: readonly string[];
}

export class ReaderSummaryConfidenceDto {
  @ApiProperty({ enum: readerSummaryConfidenceLevels })
  declare readonly level: (typeof readerSummaryConfidenceLevels)[number];

  @ApiProperty()
  declare readonly score: number;

  @ApiProperty()
  declare readonly rationale: string;
}

export class ReaderSummaryLineageDto {
  @ApiProperty()
  declare readonly promptVersion: string;

  @ApiProperty()
  declare readonly schemaVersion: string;

  @ApiProperty()
  declare readonly modelVersion: string;

  @ApiProperty()
  declare readonly providerVersion: string;

  @ApiProperty()
  declare readonly rulesVersion: string;

  @ApiProperty()
  declare readonly evalDatasetVersion: string;

  @ApiPropertyOptional()
  declare readonly rankingPolicyVersion?: string;
}

export class ReaderSummaryUsageDto {
  @ApiProperty()
  declare readonly inputTokens: number;

  @ApiProperty()
  declare readonly outputTokens: number;

  @ApiProperty()
  declare readonly estimatedCostUsd: number;
}

export class ReaderSummaryFreshnessDto {
  @ApiProperty({ enum: ["fresh", "stale"] })
  declare readonly status: "fresh" | "stale";

  @ApiProperty({ format: "date-time" })
  declare readonly checkedAt: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly staleMarkedAt?: string;

  @ApiPropertyOptional({
    enum: [
      "new_evidence_after_window",
      "interest_bindings_changed",
      "reader_summary_policy_changed",
      "ranking_policy_changed",
    ],
  })
  declare readonly reason?:
    | "new_evidence_after_window"
    | "interest_bindings_changed"
    | "reader_summary_policy_changed"
    | "ranking_policy_changed";

  @ApiPropertyOptional()
  declare readonly newestFeedItemId?: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly newestObservedAt?: string;
}

export class ReaderSummaryCoverageSummaryDto {
  @ApiProperty()
  declare readonly selectedFeedItemCount: number;

  @ApiProperty()
  declare readonly storyClusterCount: number;

  @ApiProperty()
  declare readonly topReadCount: number;

  @ApiProperty()
  declare readonly citationCount: number;

  @ApiProperty()
  declare readonly providerCount: number;

  @ApiProperty()
  declare readonly interestCount: number;

  @ApiProperty()
  declare readonly duplicateFeedItemCount: number;

  @ApiProperty()
  declare readonly crossSourceClusterCount: number;

  @ApiProperty()
  declare readonly hasCrossProviderEvidence: boolean;

  @ApiProperty()
  declare readonly isSingleSource: boolean;

  @ApiProperty({ type: [String] })
  declare readonly topProviderKeys: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly topInterestIds: readonly string[];

  @ApiProperty({ format: "date-time" })
  declare readonly windowStartedAt: string;

  @ApiProperty({ format: "date-time" })
  declare readonly windowEndedAt: string;

  @ApiProperty({ enum: ["fresh", "stale"] })
  declare readonly freshnessStatus: "fresh" | "stale";
}

export class ReaderSummaryArtifactResponseDto {
  @ApiProperty()
  declare readonly schemaVersion: string;

  @ApiProperty()
  declare readonly readerSummaryId: string;

  @ApiProperty()
  declare readonly tenantId: string;

  @ApiProperty()
  declare readonly workspaceId: string;

  @ApiProperty({ type: () => ReaderSummaryScopeDto })
  declare readonly scope: ReaderSummaryScopeDto;

  @ApiProperty({ type: () => ReaderSummaryPeriodDto })
  declare readonly period: ReaderSummaryPeriodDto;

  @ApiPropertyOptional()
  declare readonly userId?: string;

  @ApiPropertyOptional()
  declare readonly subscriptionId?: string;

  @ApiProperty({ type: () => ReaderSummarySourceWindowDto })
  declare readonly sourceWindow: ReaderSummarySourceWindowDto;

  @ApiProperty({ type: () => [ReaderSummaryStoryClusterDto] })
  declare readonly storyClusters: readonly ReaderSummaryStoryClusterDto[];

  @ApiProperty({ type: () => [ReaderSummaryContextArtifactDto] })
  declare readonly contextArtifacts: readonly ReaderSummaryContextArtifactDto[];

  @ApiPropertyOptional({ type: () => ReaderSummaryPersonalizationDto })
  declare readonly personalization?: ReaderSummaryPersonalizationDto;

  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty()
  declare readonly executiveSummary: string;

  @ApiProperty({ type: () => ReaderSummaryReaderBriefDto })
  declare readonly readerBrief: ReaderSummaryReaderBriefDto;

  @ApiProperty({ type: () => [ReaderSummaryTopStoryDto] })
  declare readonly topStories: readonly ReaderSummaryTopStoryDto[];

  @ApiProperty({ type: () => [ReaderSummaryInterestHighlightDto] })
  declare readonly interestHighlights: readonly ReaderSummaryInterestHighlightDto[];

  @ApiProperty({ type: () => [ReaderSummaryRepeatedSignalDto] })
  declare readonly repeatedSignals: readonly ReaderSummaryRepeatedSignalDto[];

  @ApiProperty({ type: () => [ReaderSummaryRiskDto] })
  declare readonly risksAndUnknowns: readonly ReaderSummaryRiskDto[];

  @ApiProperty({ type: () => [ReaderSummaryCitationViewDto] })
  declare readonly citations: readonly ReaderSummaryCitationViewDto[];

  @ApiProperty({ enum: readerSummaryQualityFlags, isArray: true })
  declare readonly qualityFlags: readonly (typeof readerSummaryQualityFlags)[number][];

  @ApiProperty({ type: () => ReaderSummaryConfidenceDto })
  declare readonly confidence: ReaderSummaryConfidenceDto;

  @ApiProperty({ type: () => ReaderSummaryLineageDto })
  declare readonly lineage: ReaderSummaryLineageDto;

  @ApiProperty({ type: () => ReaderSummaryUsageDto })
  declare readonly usage: ReaderSummaryUsageDto;

  @ApiPropertyOptional()
  declare readonly noSignalReason?: string;

  @ApiProperty({ type: () => ReaderSummaryFreshnessDto })
  declare readonly freshness: ReaderSummaryFreshnessDto;

  @ApiPropertyOptional({ type: () => ReaderSummaryCoverageSummaryDto })
  declare readonly coverage?: ReaderSummaryCoverageSummaryDto;
}

export class ReaderSummaryResponseDto extends ReaderSummaryArtifactResponseDto {}

export class ListReaderSummariesResponseDto {
  @ApiProperty({ type: () => [ReaderSummaryArtifactResponseDto] })
  declare readonly items: readonly ReaderSummaryArtifactResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
