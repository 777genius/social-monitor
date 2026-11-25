import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const summaryQualityFlags = [
  "no_signal",
  "low_confidence",
  "conflicting_evidence",
  "limited_sources",
] as const;

const summaryCitationFields = ["title", "bodyPreview", "canonicalUrl"] as const;
const summaryConfidenceLevels = ["none", "low", "medium", "high"] as const;
const summaryRiskReasons = [
  "insufficient_evidence",
  "conflicting_evidence",
  "source_limit",
] as const;

export class SummarySourceWindowDto {
  @ApiProperty()
  declare readonly windowId: string;

  @ApiProperty({ format: "date-time" })
  declare readonly startedAt: string;

  @ApiProperty({ format: "date-time" })
  declare readonly endedAt: string;

  @ApiProperty({ type: [String] })
  declare readonly selectedFeedItemIds: readonly string[];
}

export class SummaryKeyPointDto {
  @ApiProperty()
  declare readonly claim: string;

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class SummaryRiskDto {
  @ApiProperty()
  declare readonly description: string;

  @ApiPropertyOptional({ type: [String] })
  declare readonly citationIds?: readonly string[];

  @ApiPropertyOptional({ enum: summaryRiskReasons })
  declare readonly reason?: (typeof summaryRiskReasons)[number];
}

export class SummaryCitationViewDto {
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

  @ApiProperty({ enum: summaryCitationFields })
  declare readonly field: (typeof summaryCitationFields)[number];

  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;
}

export class SummaryConfidenceDto {
  @ApiProperty({ enum: summaryConfidenceLevels })
  declare readonly level: (typeof summaryConfidenceLevels)[number];

  @ApiProperty()
  declare readonly score: number;

  @ApiProperty()
  declare readonly rationale: string;
}

export class SummaryLineageDto {
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

export class SummaryUsageDto {
  @ApiProperty()
  declare readonly inputTokens: number;

  @ApiProperty()
  declare readonly outputTokens: number;

  @ApiProperty()
  declare readonly estimatedCostUsd: number;
}

export class SummaryFreshnessDto {
  @ApiProperty({ enum: ["fresh", "stale"] })
  declare readonly status: "fresh" | "stale";

  @ApiProperty({ format: "date-time" })
  declare readonly checkedAt: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly staleMarkedAt?: string;

  @ApiPropertyOptional({ enum: ["new_evidence_after_window"] })
  declare readonly reason?: "new_evidence_after_window";

  @ApiPropertyOptional()
  declare readonly newestFeedItemId?: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly newestObservedAt?: string;
}

export class SummaryArtifactResponseDto {
  @ApiProperty()
  declare readonly schemaVersion: string;

  @ApiProperty()
  declare readonly summaryId: string;

  @ApiProperty()
  declare readonly tenantId: string;

  @ApiProperty()
  declare readonly workspaceId: string;

  @ApiProperty()
  declare readonly interestId: string;

  @ApiPropertyOptional()
  declare readonly userId?: string;

  @ApiPropertyOptional()
  declare readonly subscriptionId?: string;

  @ApiProperty({ type: () => SummarySourceWindowDto })
  declare readonly sourceWindow: SummarySourceWindowDto;

  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty()
  declare readonly executiveSummary: string;

  @ApiProperty({ type: () => [SummaryKeyPointDto] })
  declare readonly keyPoints: readonly SummaryKeyPointDto[];

  @ApiProperty({ type: () => [SummaryRiskDto] })
  declare readonly risksAndUnknowns: readonly SummaryRiskDto[];

  @ApiProperty({ type: [String] })
  declare readonly sourceHighlights: readonly string[];

  @ApiProperty({ type: () => [SummaryCitationViewDto] })
  declare readonly citations: readonly SummaryCitationViewDto[];

  @ApiProperty({ enum: summaryQualityFlags, isArray: true })
  declare readonly qualityFlags: readonly (typeof summaryQualityFlags)[number][];

  @ApiProperty({ type: () => SummaryConfidenceDto })
  declare readonly confidence: SummaryConfidenceDto;

  @ApiProperty({ type: () => SummaryLineageDto })
  declare readonly lineage: SummaryLineageDto;

  @ApiProperty({ type: () => SummaryUsageDto })
  declare readonly usage: SummaryUsageDto;

  @ApiPropertyOptional()
  declare readonly noSignalReason?: string;

  @ApiProperty({ type: () => SummaryFreshnessDto })
  declare readonly freshness: SummaryFreshnessDto;
}

export class SummaryResponseDto extends SummaryArtifactResponseDto {}

export class ListSummariesResponseDto {
  @ApiProperty({ type: () => [SummaryArtifactResponseDto] })
  declare readonly items: readonly SummaryArtifactResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
