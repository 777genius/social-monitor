import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { readerSummaryConfidenceLevels } from "./reader-summary-contract.constants";
import {
  ReaderSummaryPeriodDto,
  ReaderSummaryScopeDto,
} from "./reader-summary-scope-period.dto";

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
  @ApiProperty({ nullable: true, type: Number })
  declare readonly inputTokens: number | null;

  @ApiProperty({ nullable: true, type: Number })
  declare readonly outputTokens: number | null;

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
