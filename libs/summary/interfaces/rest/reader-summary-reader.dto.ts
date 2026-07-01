import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  readerSummaryNextActionKinds,
  readerSummaryQualityFlags,
  readerSummaryReaderPrimaryActionKinds,
  readerSummaryReaderQualityStatuses,
} from "./reader-summary-contract.constants";

export class ReaderSummaryProviderMetricDto {
  @ApiProperty()
  declare readonly label: string;

  @ApiProperty()
  declare readonly value: string;
}

export class ReaderSummaryReaderItemConfidenceDto {
  @ApiProperty({ enum: ["low", "medium", "high"] })
  declare readonly level: "low" | "medium" | "high";

  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly score: number;

  @ApiProperty()
  declare readonly rationale: string;
}

export class ReaderSummaryPreviewMediaDto {
  @ApiProperty({ enum: ["image", "video"] })
  declare readonly kind: "image" | "video";

  @ApiProperty()
  declare readonly url: string;

  @ApiPropertyOptional()
  declare readonly sourceUrl?: string;

  @ApiPropertyOptional()
  declare readonly altText?: string;
}

export class ReaderSummaryReaderItemDto {
  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly providerName: string;

  @ApiProperty({ enum: readerSummaryReaderPrimaryActionKinds })
  declare readonly primaryActionKind: (typeof readerSummaryReaderPrimaryActionKinds)[number];

  @ApiProperty()
  declare readonly reason: string;

  @ApiProperty({ type: [String] })
  declare readonly matchedInterestIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly matchedRules: readonly string[];

  @ApiProperty()
  declare readonly signalScore: number;

  @ApiProperty({ type: () => ReaderSummaryReaderItemConfidenceDto })
  declare readonly confidence: ReaderSummaryReaderItemConfidenceDto;

  @ApiProperty({ type: [String] })
  declare readonly confirmedProviderKeys: readonly string[];

  @ApiProperty({ type: () => [ReaderSummaryProviderMetricDto] })
  declare readonly providerMetrics: readonly ReaderSummaryProviderMetricDto[];

  @ApiProperty({ type: [String] })
  declare readonly whyImportant: readonly string[];

  @ApiProperty()
  declare readonly whyNow: string;

  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;

  @ApiPropertyOptional({ type: () => ReaderSummaryPreviewMediaDto })
  declare readonly previewMedia?: ReaderSummaryPreviewMediaDto;

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class ReaderSummaryReaderInterestSectionDto {
  @ApiPropertyOptional()
  declare readonly interestId?: string;

  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly insight: string;

  @ApiProperty({ type: () => [ReaderSummaryReaderItemDto] })
  declare readonly items: readonly ReaderSummaryReaderItemDto[];

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class ReaderSummarySourceMixEntryDto {
  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly itemCount: number;

  @ApiProperty()
  declare readonly citationCount: number;

  @ApiProperty()
  declare readonly storyClusterCount: number;

  @ApiProperty()
  declare readonly crossSourceClusterCount: number;

  @ApiProperty()
  declare readonly singleSourceOnly: boolean;

  @ApiProperty({ type: [String] })
  declare readonly interestIds: readonly string[];
}

export class ReaderSummaryTrendDeltaDto {
  @ApiProperty({ type: [String] })
  declare readonly newSignals: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly growingSignals: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly repeatedSignals: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly fadingSignals: readonly string[];
}

export class ReaderSummaryNextActionDto {
  @ApiProperty({ enum: readerSummaryNextActionKinds })
  declare readonly kind: (typeof readerSummaryNextActionKinds)[number];

  @ApiProperty()
  declare readonly label: string;

  @ApiProperty()
  declare readonly reason: string;

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];

  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;
}

export class ReaderSummaryReaderQualityStateDto {
  @ApiProperty({ enum: readerSummaryReaderQualityStatuses })
  declare readonly status: (typeof readerSummaryReaderQualityStatuses)[number];

  @ApiProperty({ enum: readerSummaryQualityFlags, isArray: true })
  declare readonly flags: readonly (typeof readerSummaryQualityFlags)[number][];

  @ApiProperty({ type: [String] })
  declare readonly warnings: readonly string[];

  @ApiProperty()
  declare readonly isSingleSource: boolean;
}

export class ReaderSummaryReaderBriefDto {
  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty()
  declare readonly oneLineTakeaway: string;

  @ApiProperty({ type: [String] })
  declare readonly bullets: readonly string[];

  @ApiProperty({ type: () => ReaderSummaryReaderQualityStateDto })
  declare readonly qualityState: ReaderSummaryReaderQualityStateDto;

  @ApiProperty({ type: () => [ReaderSummaryReaderInterestSectionDto] })
  declare readonly interestSections: readonly ReaderSummaryReaderInterestSectionDto[];

  @ApiProperty({ type: () => [ReaderSummarySourceMixEntryDto] })
  declare readonly sourceMix: readonly ReaderSummarySourceMixEntryDto[];

  @ApiProperty({ type: () => [ReaderSummaryReaderItemDto] })
  declare readonly topReads: readonly ReaderSummaryReaderItemDto[];

  @ApiProperty({ type: () => ReaderSummaryTrendDeltaDto })
  declare readonly trendDelta: ReaderSummaryTrendDeltaDto;

  @ApiProperty({ type: [String] })
  declare readonly openQuestions: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly risks: readonly string[];

  @ApiProperty({ type: () => [ReaderSummaryNextActionDto] })
  declare readonly nextActions: readonly ReaderSummaryNextActionDto[];
}
