import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ReaderSummaryProviderCoverageDto {
  @ApiProperty()
  declare readonly providerKey: string;

  @ApiPropertyOptional()
  declare readonly collectedFeedItemCount?: number;

  @ApiProperty()
  declare readonly lowRelevanceFeedItemCount: number;

  @ApiProperty()
  declare readonly mutedFeedItemCount: number;

  @ApiProperty()
  declare readonly userRatedFeedItemCount: number;

  @ApiProperty()
  declare readonly selectedFeedItemCount: number;

  @ApiProperty()
  declare readonly topReadCount: number;

  @ApiProperty()
  declare readonly citationCount: number;
}

export class ReaderSummaryTopicCoverageDto {
  @ApiProperty()
  declare readonly topicKey: string;

  @ApiPropertyOptional()
  declare readonly topicLabel?: string;

  @ApiProperty()
  declare readonly collectedFeedItemCount: number;

  @ApiProperty()
  declare readonly lowRelevanceFeedItemCount: number;

  @ApiProperty()
  declare readonly mutedFeedItemCount: number;

  @ApiProperty()
  declare readonly userRatedFeedItemCount: number;
}

export class ReaderSummaryQueryCoverageDto {
  @ApiProperty()
  declare readonly query: string;

  @ApiProperty()
  declare readonly collectedFeedItemCount: number;

  @ApiProperty()
  declare readonly lowRelevanceFeedItemCount: number;

  @ApiProperty()
  declare readonly mutedFeedItemCount: number;

  @ApiProperty()
  declare readonly userRatedFeedItemCount: number;
}

export class ReaderSummaryCoverageSummaryDto {
  @ApiPropertyOptional()
  declare readonly collectedFeedItemCount?: number;

  @ApiProperty()
  declare readonly lowRelevanceFeedItemCount: number;

  @ApiProperty()
  declare readonly mutedFeedItemCount: number;

  @ApiProperty()
  declare readonly userRatedFeedItemCount: number;

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

  @ApiPropertyOptional({ type: () => [ReaderSummaryProviderCoverageDto] })
  declare readonly providerBreakdown?: readonly ReaderSummaryProviderCoverageDto[];

  @ApiPropertyOptional({ type: () => [ReaderSummaryTopicCoverageDto] })
  declare readonly topicBreakdown?: readonly ReaderSummaryTopicCoverageDto[];

  @ApiPropertyOptional({ type: () => [ReaderSummaryQueryCoverageDto] })
  declare readonly queryBreakdown?: readonly ReaderSummaryQueryCoverageDto[];
}
