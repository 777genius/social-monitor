import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  readerSummaryCitationFields,
  readerSummaryRiskReasons,
} from "./reader-summary-contract.constants";
import { ReaderSummaryObservedAtRangeDto } from "./reader-summary-scope-period.dto";

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
