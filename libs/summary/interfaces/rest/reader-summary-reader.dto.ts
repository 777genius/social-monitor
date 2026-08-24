import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  readerSummaryNextActionKinds,
  readerSummaryQualityFlags,
  readerSummaryReaderPrimaryActionKinds,
  readerSummaryReaderQualityStatuses,
} from "./reader-summary-contract.constants";
import { ReaderSummaryPromotionAttestationDto } from
  "./reader-summary-promotion-attestation.dto";

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
  @ApiPropertyOptional({ type: () => ReaderSummaryPromotionAttestationDto })
  declare readonly promotionAttestation?: ReaderSummaryPromotionAttestationDto;

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

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly publishedAt?: string;

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

export class ReaderSummaryClaimEvidenceDto {
  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly citationId: string;

  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;
}

export class ReaderSummaryClaimRiskDto {
  @ApiProperty({
    enum: ["single_source", "low_confidence", "low_evidence", "unresolved"],
  })
  declare readonly kind:
    | "single_source"
    | "low_confidence"
    | "low_evidence"
    | "unresolved";

  @ApiProperty()
  declare readonly description: string;
}

export class ReaderSummaryClaimDto {
  @ApiPropertyOptional()
  declare readonly id?: string;

  @ApiProperty()
  declare readonly claim: string;

  @ApiProperty({ type: () => [ReaderSummaryClaimEvidenceDto] })
  declare readonly evidence: readonly ReaderSummaryClaimEvidenceDto[];

  @ApiProperty({ type: () => ReaderSummaryReaderItemConfidenceDto })
  declare readonly confidence: ReaderSummaryReaderItemConfidenceDto;

  @ApiProperty({ type: () => [ReaderSummaryClaimRiskDto] })
  declare readonly risks: readonly ReaderSummaryClaimRiskDto[];

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];
}

export class ReaderSummaryNarrativeSectionDto {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty({
    enum: [
      "lead",
      "main_signal",
      "why_it_matters",
      "secondary_signal",
      "watch",
    ],
  })
  declare readonly kind:
    | "lead"
    | "main_signal"
    | "why_it_matters"
    | "secondary_signal"
    | "watch";

  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly text: string;

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];

  @ApiPropertyOptional()
  declare readonly storyClusterId?: string;
}

export class ReaderSummaryReliabilityRiskDto {
  @ApiProperty({
    enum: [
      "duplicate_risk",
      "stale_evidence",
      "single_source",
      "weak_source",
      "low_evidence_diversity",
    ],
  })
  declare readonly kind:
    | "duplicate_risk"
    | "stale_evidence"
    | "single_source"
    | "weak_source"
    | "low_evidence_diversity";

  @ApiProperty({ enum: ["low", "medium", "high"] })
  declare readonly level: "low" | "medium" | "high";

  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly score: number;

  @ApiProperty()
  declare readonly description: string;
}

export class ReaderSummaryReliabilityReportDto {
  @ApiProperty({ enum: ["shadow"] })
  declare readonly mode: "shadow";

  @ApiProperty()
  declare readonly policyVersion: string;

  @ApiProperty({ enum: ["low", "medium", "high"] })
  declare readonly riskLevel: "low" | "medium" | "high";

  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly riskScore: number;

  @ApiProperty({ type: () => [ReaderSummaryReliabilityRiskDto] })
  declare readonly risks: readonly ReaderSummaryReliabilityRiskDto[];
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

export class ReaderSummaryTopicMapConfidenceDto {
  @ApiProperty({ enum: ["low", "medium", "high"] })
  declare readonly level: "low" | "medium" | "high";

  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly score: number;

  @ApiProperty()
  declare readonly rationale: string;
}

export class ReaderSummaryTopicMapNodeDto {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly label: string;

  @ApiProperty()
  declare readonly groupId: string;

  @ApiProperty({ type: [String] })
  declare readonly storyClusterIds: readonly string[];

  @ApiProperty({ minimum: 0, maximum: 100 })
  declare readonly popularityScore: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly sizeWeight: number;

  @ApiProperty()
  declare readonly evidenceCount: number;

  @ApiProperty({ type: [String] })
  declare readonly providerKeys: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly interestIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly citationIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly keywords: readonly string[];

  @ApiProperty()
  declare readonly rationale: string;
}

export class ReaderSummaryTopicMapGroupDto {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly label: string;

  @ApiProperty()
  declare readonly colorKey: string;

  @ApiPropertyOptional({ type: [String] })
  declare readonly semanticAnchors?: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly nodeIds: readonly string[];

  @ApiProperty({ type: () => ReaderSummaryTopicMapConfidenceDto })
  declare readonly confidence: ReaderSummaryTopicMapConfidenceDto;
}

export class ReaderSummaryTopicMapEdgeDto {
  @ApiProperty()
  declare readonly sourceNodeId: string;

  @ApiProperty()
  declare readonly targetNodeId: string;

  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly weight: number;

  @ApiProperty()
  declare readonly reason: string;
}

export class ReaderSummaryTopicMapDto {
  @ApiProperty({ enum: ["reader_summary.topic_map.v1"] })
  declare readonly schemaVersion: "reader_summary.topic_map.v1";

  @ApiProperty({ enum: ["deterministic", "agent-runtime"] })
  declare readonly generatedBy: "deterministic" | "agent-runtime";

  @ApiProperty({ type: () => ReaderSummaryTopicMapConfidenceDto })
  declare readonly confidence: ReaderSummaryTopicMapConfidenceDto;

  @ApiProperty({ type: () => [ReaderSummaryTopicMapNodeDto] })
  declare readonly nodes: readonly ReaderSummaryTopicMapNodeDto[];

  @ApiProperty({ type: () => [ReaderSummaryTopicMapGroupDto] })
  declare readonly groups: readonly ReaderSummaryTopicMapGroupDto[];

  @ApiProperty({ type: () => [ReaderSummaryTopicMapEdgeDto] })
  declare readonly edges: readonly ReaderSummaryTopicMapEdgeDto[];

  @ApiProperty({ type: [String] })
  declare readonly warnings: readonly string[];
}

export class ReaderSummaryReaderBriefDto {
  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty()
  declare readonly oneLineTakeaway: string;

  @ApiProperty({ type: [String] })
  declare readonly bullets: readonly string[];

  @ApiProperty({ type: () => [ReaderSummaryNarrativeSectionDto] })
  declare readonly narrativeSections: readonly ReaderSummaryNarrativeSectionDto[];

  @ApiProperty({ type: [String] })
  declare readonly mainTopics: readonly string[];

  @ApiProperty({ type: () => ReaderSummaryTopicMapDto })
  declare readonly topicMap: ReaderSummaryTopicMapDto;

  @ApiProperty({ type: () => ReaderSummaryReaderQualityStateDto })
  declare readonly qualityState: ReaderSummaryReaderQualityStateDto;

  @ApiProperty({ type: () => [ReaderSummaryReaderInterestSectionDto] })
  declare readonly interestSections: readonly ReaderSummaryReaderInterestSectionDto[];

  @ApiProperty({ type: () => [ReaderSummarySourceMixEntryDto] })
  declare readonly sourceMix: readonly ReaderSummarySourceMixEntryDto[];

  @ApiProperty({ type: () => [ReaderSummaryReaderItemDto] })
  declare readonly topReads: readonly ReaderSummaryReaderItemDto[];

  @ApiProperty({ type: () => [ReaderSummaryReaderItemDto] })
  declare readonly selectedPosts: readonly ReaderSummaryReaderItemDto[];

  @ApiProperty({ type: () => [ReaderSummaryClaimDto] })
  declare readonly claimBoard: readonly ReaderSummaryClaimDto[];

  @ApiProperty({ type: () => ReaderSummaryReliabilityReportDto })
  declare readonly reliabilityReport: ReaderSummaryReliabilityReportDto;

  @ApiProperty({ type: () => ReaderSummaryTrendDeltaDto })
  declare readonly trendDelta: ReaderSummaryTrendDeltaDto;

  @ApiProperty({ type: [String] })
  declare readonly openQuestions: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly risks: readonly string[];

  @ApiProperty({ type: () => [ReaderSummaryNextActionDto] })
  declare readonly nextActions: readonly ReaderSummaryNextActionDto[];
}
