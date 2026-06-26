import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

import {
  briefingCitationFields,
  briefingConfidenceLevels,
  briefingQualityFlags,
  briefingRiskReasons,
} from "./briefing-contract.constants";
import { BriefingReaderBriefDto } from "./briefing-reader.dto";

export class BriefingScopeDto {
  @ApiProperty({ enum: ["workspace", "topic"] })
  @IsIn(["workspace", "topic"])
  declare readonly type: "workspace" | "topic";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly topicId?: string;
}

export class BriefingSourceWindowDto {
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

export class BriefingObservedAtRangeDto {
  @ApiProperty({ format: "date-time" })
  declare readonly startedAt: string;

  @ApiProperty({ format: "date-time" })
  declare readonly endedAt: string;
}

export class BriefingStorySignalBreakdownDto {
  @ApiProperty()
  declare readonly baseScore: number;

  @ApiProperty()
  declare readonly crossProviderSupport: number;

  @ApiProperty()
  declare readonly sameProviderSupport: number;

  @ApiProperty()
  declare readonly providerDiversityBoost: number;

  @ApiProperty()
  declare readonly topicDiversityBoost: number;

  @ApiProperty()
  declare readonly freshnessBoost: number;

  @ApiProperty()
  declare readonly totalScore: number;
}

export class BriefingStoryClusterDto {
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
  declare readonly topicIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly providerKeys: readonly string[];

  @ApiProperty()
  declare readonly score: number;

  @ApiPropertyOptional({ type: () => BriefingStorySignalBreakdownDto })
  declare readonly signalBreakdown?: BriefingStorySignalBreakdownDto;

  @ApiProperty({ type: () => BriefingObservedAtRangeDto })
  declare readonly observedAtRange: BriefingObservedAtRangeDto;

  @ApiProperty({ type: [String] })
  declare readonly whyImportant: readonly string[];
}

export class BriefingCitationViewDto {
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

  @ApiProperty({ enum: briefingCitationFields })
  declare readonly field: (typeof briefingCitationFields)[number];

  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;
}

export class BriefingTopStoryDto {
  @ApiProperty()
  declare readonly storyClusterId: string;

  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly summary: string;

  @ApiProperty({ type: [String] })
  declare readonly topicIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly providerKeys: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class BriefingTopicHighlightDto {
  @ApiProperty()
  declare readonly topicId: string;

  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly summary: string;

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class BriefingRepeatedSignalDto {
  @ApiProperty()
  declare readonly storyClusterId: string;

  @ApiProperty()
  declare readonly title: string;

  @ApiProperty({ type: [String] })
  declare readonly topicIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class BriefingRiskDto {
  @ApiProperty()
  declare readonly description: string;

  @ApiPropertyOptional({ type: [String] })
  declare readonly citationIds?: readonly string[];

  @ApiPropertyOptional({ enum: briefingRiskReasons })
  declare readonly reason?: (typeof briefingRiskReasons)[number];
}

export class BriefingContextArtifactDto {
  @ApiProperty()
  declare readonly artifactId: string;

  @ApiProperty({ type: () => BriefingScopeDto })
  declare readonly scope: BriefingScopeDto;

  @ApiProperty()
  declare readonly summaryText: string;

  @ApiProperty({ format: "date-time" })
  declare readonly generatedAt: string;

  @ApiProperty({ enum: ["fresh", "stale", "unknown"] })
  declare readonly freshness: "fresh" | "stale" | "unknown";
}

export class BriefingPersonalizationDto {
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

export class BriefingConfidenceDto {
  @ApiProperty({ enum: briefingConfidenceLevels })
  declare readonly level: (typeof briefingConfidenceLevels)[number];

  @ApiProperty()
  declare readonly score: number;

  @ApiProperty()
  declare readonly rationale: string;
}

export class BriefingLineageDto {
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

export class BriefingUsageDto {
  @ApiProperty()
  declare readonly inputTokens: number;

  @ApiProperty()
  declare readonly outputTokens: number;

  @ApiProperty()
  declare readonly estimatedCostUsd: number;
}

export class BriefingFreshnessDto {
  @ApiProperty({ enum: ["fresh", "stale"] })
  declare readonly status: "fresh" | "stale";

  @ApiProperty({ format: "date-time" })
  declare readonly checkedAt: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly staleMarkedAt?: string;

  @ApiPropertyOptional({
    enum: [
      "new_evidence_after_window",
      "topic_bindings_changed",
      "briefing_policy_changed",
      "ranking_policy_changed",
    ],
  })
  declare readonly reason?:
    | "new_evidence_after_window"
    | "topic_bindings_changed"
    | "briefing_policy_changed"
    | "ranking_policy_changed";

  @ApiPropertyOptional()
  declare readonly newestFeedItemId?: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly newestObservedAt?: string;
}

export class BriefingCoverageSummaryDto {
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
  declare readonly topicCount: number;

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
  declare readonly topTopicIds: readonly string[];

  @ApiProperty({ format: "date-time" })
  declare readonly windowStartedAt: string;

  @ApiProperty({ format: "date-time" })
  declare readonly windowEndedAt: string;

  @ApiProperty({ enum: ["fresh", "stale"] })
  declare readonly freshnessStatus: "fresh" | "stale";
}

export class BriefingArtifactResponseDto {
  @ApiProperty()
  declare readonly schemaVersion: string;

  @ApiProperty()
  declare readonly briefingId: string;

  @ApiProperty()
  declare readonly tenantId: string;

  @ApiProperty()
  declare readonly workspaceId: string;

  @ApiProperty({ type: () => BriefingScopeDto })
  declare readonly scope: BriefingScopeDto;

  @ApiPropertyOptional()
  declare readonly userId?: string;

  @ApiPropertyOptional()
  declare readonly subscriptionId?: string;

  @ApiProperty({ type: () => BriefingSourceWindowDto })
  declare readonly sourceWindow: BriefingSourceWindowDto;

  @ApiProperty({ type: () => [BriefingStoryClusterDto] })
  declare readonly storyClusters: readonly BriefingStoryClusterDto[];

  @ApiProperty({ type: () => [BriefingContextArtifactDto] })
  declare readonly contextArtifacts: readonly BriefingContextArtifactDto[];

  @ApiPropertyOptional({ type: () => BriefingPersonalizationDto })
  declare readonly personalization?: BriefingPersonalizationDto;

  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty()
  declare readonly executiveSummary: string;

  @ApiProperty({ type: () => BriefingReaderBriefDto })
  declare readonly readerBrief: BriefingReaderBriefDto;

  @ApiProperty({ type: () => [BriefingTopStoryDto] })
  declare readonly topStories: readonly BriefingTopStoryDto[];

  @ApiProperty({ type: () => [BriefingTopicHighlightDto] })
  declare readonly topicHighlights: readonly BriefingTopicHighlightDto[];

  @ApiProperty({ type: () => [BriefingRepeatedSignalDto] })
  declare readonly repeatedSignals: readonly BriefingRepeatedSignalDto[];

  @ApiProperty({ type: () => [BriefingRiskDto] })
  declare readonly risksAndUnknowns: readonly BriefingRiskDto[];

  @ApiProperty({ type: () => [BriefingCitationViewDto] })
  declare readonly citations: readonly BriefingCitationViewDto[];

  @ApiProperty({ enum: briefingQualityFlags, isArray: true })
  declare readonly qualityFlags: readonly (typeof briefingQualityFlags)[number][];

  @ApiProperty({ type: () => BriefingConfidenceDto })
  declare readonly confidence: BriefingConfidenceDto;

  @ApiProperty({ type: () => BriefingLineageDto })
  declare readonly lineage: BriefingLineageDto;

  @ApiProperty({ type: () => BriefingUsageDto })
  declare readonly usage: BriefingUsageDto;

  @ApiPropertyOptional()
  declare readonly noSignalReason?: string;

  @ApiProperty({ type: () => BriefingFreshnessDto })
  declare readonly freshness: BriefingFreshnessDto;

  @ApiPropertyOptional({ type: () => BriefingCoverageSummaryDto })
  declare readonly coverage?: BriefingCoverageSummaryDto;
}

export class BriefingResponseDto extends BriefingArtifactResponseDto {}

export class ListBriefingsResponseDto {
  @ApiProperty({ type: () => [BriefingArtifactResponseDto] })
  declare readonly items: readonly BriefingArtifactResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
