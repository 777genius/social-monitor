import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  briefingNextActionKinds,
  briefingQualityFlags,
  briefingReaderQualityStatuses,
} from "./briefing-contract.constants";

export class BriefingProviderMetricDto {
  @ApiProperty()
  declare readonly label: string;

  @ApiProperty()
  declare readonly value: string;
}

export class BriefingReaderItemConfidenceDto {
  @ApiProperty({ enum: ["low", "medium", "high"] })
  declare readonly level: "low" | "medium" | "high";

  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly score: number;

  @ApiProperty()
  declare readonly rationale: string;
}

export class BriefingReaderItemDto {
  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly reason: string;

  @ApiProperty({ type: [String] })
  declare readonly matchedTopicIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly matchedRules: readonly string[];

  @ApiProperty()
  declare readonly signalScore: number;

  @ApiProperty({ type: () => BriefingReaderItemConfidenceDto })
  declare readonly confidence: BriefingReaderItemConfidenceDto;

  @ApiProperty({ type: [String] })
  declare readonly confirmedProviderKeys: readonly string[];

  @ApiProperty({ type: () => [BriefingProviderMetricDto] })
  declare readonly providerMetrics: readonly BriefingProviderMetricDto[];

  @ApiProperty({ type: [String] })
  declare readonly whyImportant: readonly string[];

  @ApiProperty()
  declare readonly whyNow: string;

  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class BriefingReaderTopicSectionDto {
  @ApiPropertyOptional()
  declare readonly topicId?: string;

  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly insight: string;

  @ApiProperty({ type: () => [BriefingReaderItemDto] })
  declare readonly items: readonly BriefingReaderItemDto[];

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class BriefingSourceMixEntryDto {
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
  declare readonly topicIds: readonly string[];
}

export class BriefingTrendDeltaDto {
  @ApiProperty({ type: [String] })
  declare readonly newSignals: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly growingSignals: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly repeatedSignals: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly fadingSignals: readonly string[];
}

export class BriefingNextActionDto {
  @ApiProperty({ enum: briefingNextActionKinds })
  declare readonly kind: (typeof briefingNextActionKinds)[number];

  @ApiProperty()
  declare readonly label: string;

  @ApiProperty()
  declare readonly reason: string;

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];

  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;
}

export class BriefingReaderQualityStateDto {
  @ApiProperty({ enum: briefingReaderQualityStatuses })
  declare readonly status: (typeof briefingReaderQualityStatuses)[number];

  @ApiProperty({ enum: briefingQualityFlags, isArray: true })
  declare readonly flags: readonly (typeof briefingQualityFlags)[number][];

  @ApiProperty({ type: [String] })
  declare readonly warnings: readonly string[];

  @ApiProperty()
  declare readonly isSingleSource: boolean;
}

export class BriefingReaderBriefDto {
  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty()
  declare readonly oneLineTakeaway: string;

  @ApiProperty({ type: [String] })
  declare readonly bullets: readonly string[];

  @ApiProperty({ type: () => BriefingReaderQualityStateDto })
  declare readonly qualityState: BriefingReaderQualityStateDto;

  @ApiProperty({ type: () => [BriefingReaderTopicSectionDto] })
  declare readonly topicSections: readonly BriefingReaderTopicSectionDto[];

  @ApiProperty({ type: () => [BriefingSourceMixEntryDto] })
  declare readonly sourceMix: readonly BriefingSourceMixEntryDto[];

  @ApiProperty({ type: () => [BriefingReaderItemDto] })
  declare readonly topReads: readonly BriefingReaderItemDto[];

  @ApiProperty({ type: () => BriefingTrendDeltaDto })
  declare readonly trendDelta: BriefingTrendDeltaDto;

  @ApiProperty({ type: [String] })
  declare readonly openQuestions: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly risks: readonly string[];

  @ApiProperty({ type: () => [BriefingNextActionDto] })
  declare readonly nextActions: readonly BriefingNextActionDto[];
}
