import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const briefingQualityFlags = [
  "no_signal",
  "low_confidence",
  "conflicting_evidence",
  "limited_sources",
  "partial_evidence",
  "context_unavailable",
] as const;

const briefingCitationFields = ["title", "bodyPreview", "canonicalUrl"] as const;
const briefingConfidenceLevels = ["none", "low", "medium", "high"] as const;
const briefingRiskReasons = [
  "insufficient_evidence",
  "conflicting_evidence",
  "source_limit",
  "provider_outage",
] as const;

export class BriefingScopeDto {
  @ApiProperty({ enum: ["workspace", "topic"] })
  declare readonly type: "workspace" | "topic";

  @ApiPropertyOptional()
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

export class BriefingStoryClusterDto {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly storyKey: string;

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

  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty()
  declare readonly executiveSummary: string;

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
}

export class BriefingResponseDto extends BriefingArtifactResponseDto {}

export class ListBriefingsResponseDto {
  @ApiProperty({ type: () => [BriefingArtifactResponseDto] })
  declare readonly items: readonly BriefingArtifactResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
