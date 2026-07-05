import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

import type { DecideReaderSummaryTopicRecommendationResult } from "../../features/decide-reader-summary-topic-recommendation/decide-reader-summary-topic-recommendation.result";
import type { ListReaderSummaryTopicRecommendationsResult } from "../../features/list-reader-summary-topic-recommendations/list-reader-summary-topic-recommendations.result";

export class ReaderSummaryTopicRecommendationMetricsDto {
  @ApiProperty()
  declare readonly collectedPostCount: number;

  @ApiProperty()
  declare readonly summaryCount: number;

  @ApiProperty()
  declare readonly selectedEvidenceCount: number;

  @ApiProperty()
  declare readonly topReadCount: number;

  @ApiProperty()
  declare readonly citationCount: number;

  @ApiProperty()
  declare readonly crossSourceSummaryCount: number;

  @ApiProperty()
  declare readonly usefulSummaryCount: number;

  @ApiProperty()
  declare readonly duplicateEvidenceCount: number;

  @ApiProperty()
  declare readonly lowRelevanceSignalCount: number;

  @ApiProperty()
  declare readonly mutedSignalCount: number;

  @ApiProperty()
  declare readonly userRatedSignalCount: number;

  @ApiProperty()
  declare readonly selectionRate: number;

  @ApiProperty()
  declare readonly citationRate: number;

  @ApiProperty()
  declare readonly topReadRate: number;

  @ApiProperty()
  declare readonly duplicateRate: number;

  @ApiProperty()
  declare readonly noiseRate: number;

  @ApiProperty()
  declare readonly averageSignalScore: number;
}

export class ReaderSummaryTopicRecommendationDto {
  @ApiProperty()
  declare readonly recommendationId: string;

  @ApiProperty({ enum: ["promote_adjacent_topic", "observe_adjacent_topic"] })
  declare readonly kind: "promote_adjacent_topic" | "observe_adjacent_topic";

  @ApiProperty({ enum: ["pending", "accepted", "rejected"] })
  declare readonly decisionStatus: "pending" | "accepted" | "rejected";

  @ApiProperty({ format: "date-time", required: false })
  declare readonly decidedAt?: string;

  @ApiProperty({ required: false })
  declare readonly decidedBy?: string;

  @ApiProperty({ required: false })
  declare readonly decisionNote?: string;

  @ApiProperty()
  declare readonly topicLabel: string;

  @ApiProperty({ enum: ["core", "adjacent", "unknown"] })
  declare readonly currentTier: "core" | "adjacent" | "unknown";

  @ApiProperty({ enum: ["core", "adjacent", "unknown"] })
  declare readonly suggestedTier: "core" | "adjacent" | "unknown";

  @ApiProperty()
  declare readonly confidenceScore: number;

  @ApiProperty()
  declare readonly rationale: string;

  @ApiProperty()
  declare readonly windowDays: number;

  @ApiProperty({ type: () => ReaderSummaryTopicRecommendationMetricsDto })
  declare readonly metrics: ReaderSummaryTopicRecommendationMetricsDto;

  @ApiProperty({ type: [String] })
  declare readonly providerKeys: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly interestIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly evidenceReaderSummaryIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly reasons: readonly string[];
}

export class ListReaderSummaryTopicRecommendationsResponseDto {
  @ApiProperty({ format: "date-time" })
  declare readonly windowStartedAt: string;

  @ApiProperty({ format: "date-time" })
  declare readonly windowEndedAt: string;

  @ApiProperty({ type: () => [ReaderSummaryTopicRecommendationDto] })
  declare readonly items: readonly ReaderSummaryTopicRecommendationDto[];
}

export class DecideReaderSummaryTopicRecommendationRequestDto {
  @ApiProperty({ enum: ["accept", "reject", "undo"] })
  @IsIn(["accept", "reject", "undo"])
  declare readonly action: "accept" | "reject" | "undo";

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  declare readonly topicLabel: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare readonly interestIds?: readonly string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare readonly providerKeys?: readonly string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  declare readonly note?: string;
}

export class ReaderSummaryTopicRecommendationDecisionDto {
  @ApiProperty()
  declare readonly recommendationId: string;

  @ApiProperty()
  declare readonly topicLabel: string;

  @ApiProperty({ enum: ["accepted", "rejected"] })
  declare readonly status: "accepted" | "rejected";

  @ApiProperty()
  declare readonly decidedBy: string;

  @ApiProperty({ required: false })
  declare readonly note?: string;

  @ApiProperty({ format: "date-time" })
  declare readonly decidedAt: string;
}

export class ReaderSummaryAcceptedTopicApplicationBindingDto {
  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly interestId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly changed: boolean;

  @ApiProperty({ type: [String] })
  declare readonly changedConfigPaths: readonly string[];
}

export class ReaderSummaryAcceptedTopicApplicationDto {
  @ApiProperty({
    enum: [
      "not_requested",
      "applied",
      "already_applied",
      "no_supported_bindings",
    ],
  })
  declare readonly status:
    "not_requested" | "applied" | "already_applied" | "no_supported_bindings";

  @ApiProperty()
  declare readonly changedSourceBindingCount: number;

  @ApiProperty({
    type: () => [ReaderSummaryAcceptedTopicApplicationBindingDto],
  })
  declare readonly sourceBindingUpdates: readonly ReaderSummaryAcceptedTopicApplicationBindingDto[];
}

export class ReaderSummaryAcceptedTopicReversionBindingDto {
  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly interestId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly reverted: boolean;

  @ApiProperty({ required: false })
  declare readonly reason?: string;

  @ApiProperty({ type: [String] })
  declare readonly restoredConfigPaths: readonly string[];
}

export class ReaderSummaryAcceptedTopicReversionDto {
  @ApiProperty({
    enum: [
      "not_requested",
      "reverted",
      "partially_reverted",
      "nothing_to_revert",
      "blocked",
    ],
  })
  declare readonly status:
    | "not_requested"
    | "reverted"
    | "partially_reverted"
    | "nothing_to_revert"
    | "blocked";

  @ApiProperty()
  declare readonly revertedSourceBindingCount: number;

  @ApiProperty({
    type: () => [ReaderSummaryAcceptedTopicReversionBindingDto],
  })
  declare readonly sourceBindingReversions: readonly ReaderSummaryAcceptedTopicReversionBindingDto[];
}

export class DecideReaderSummaryTopicRecommendationResponseDto {
  @ApiProperty({ enum: ["pending", "accepted", "rejected"] })
  declare readonly decisionStatus: "pending" | "accepted" | "rejected";

  @ApiPropertyOptional({ type: () => ReaderSummaryTopicRecommendationDecisionDto })
  declare readonly decision?: ReaderSummaryTopicRecommendationDecisionDto;

  @ApiProperty({ type: () => ReaderSummaryAcceptedTopicApplicationDto })
  declare readonly application: ReaderSummaryAcceptedTopicApplicationDto;

  @ApiProperty({ type: () => ReaderSummaryAcceptedTopicReversionDto })
  declare readonly reversion: ReaderSummaryAcceptedTopicReversionDto;
}

export const readerSummaryTopicRecommendationsResponse = (
  result: ListReaderSummaryTopicRecommendationsResult,
): ListReaderSummaryTopicRecommendationsResponseDto => {
  return {
    windowStartedAt: result.windowStartedAt.toISOString(),
    windowEndedAt: result.windowEndedAt.toISOString(),
    items: result.items.map((item) => ({
      ...item,
      decidedAt: item.decidedAt?.toISOString(),
    })),
  };
};

export const readerSummaryTopicRecommendationDecisionResponse = (
  result: DecideReaderSummaryTopicRecommendationResult,
): DecideReaderSummaryTopicRecommendationResponseDto => {
  const snapshot = result.decision?.toSnapshot();

  return {
    decisionStatus: result.decisionStatus,
    decision:
      snapshot === undefined
        ? undefined
        : {
            recommendationId: snapshot.recommendationId,
            topicLabel: snapshot.topicLabel,
            status: snapshot.status,
            decidedBy: snapshot.decidedBy,
            note: snapshot.note,
            decidedAt: snapshot.decidedAt.toISOString(),
          },
    application: {
      status: result.application.status,
      changedSourceBindingCount: result.application.changedSourceBindingCount,
      sourceBindingUpdates: result.application.sourceBindingUpdates.map(
        (update) => ({
          sourceBindingId: update.sourceBindingId,
          interestId: update.interestId,
          providerKey: update.providerKey,
          changed: update.changed,
          changedConfigPaths: update.changedConfigPaths,
        }),
      ),
    },
    reversion: {
      status: result.reversion.status,
      revertedSourceBindingCount:
        result.reversion.revertedSourceBindingCount,
      sourceBindingReversions: result.reversion.sourceBindingReversions.map(
        (reversion) => ({
          sourceBindingId: reversion.sourceBindingId,
          interestId: reversion.interestId,
          providerKey: reversion.providerKey,
          reverted: reversion.reverted,
          reason: reversion.reason,
          restoredConfigPaths: reversion.restoredConfigPaths,
        }),
      ),
    },
  };
};
