import { ReaderSummaryDisplayHeadlineSealDto } from "./reader-summary-display-headline.dto";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION,
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_V1,
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION,
  READER_POST_PROMOTION_DIGEST_V1,
  READER_POST_PROMOTION_DIGEST_VERSION,
  READER_POST_PROMOTION_POLICY_VERSION,
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_V3,
  READER_POST_PROMOTION_POLICY_V3,
  READER_POST_PROMOTION_DIGEST_V3,
} from "../../domain";

export {
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION,
  READER_POST_PROMOTION_DIGEST_VERSION,
};

export class ReaderSummaryPromotionScoreComponentsDto {
  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly engagementSalience: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly relevance: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly evidenceQuality: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly integrity: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  declare readonly freshness: number;

  @ApiProperty({ minimum: 0 })
  declare readonly weightedEngagement: number;

  @ApiProperty({ minimum: 0 })
  declare readonly weightedRelevance: number;

  @ApiProperty({ minimum: 0 })
  declare readonly weightedEvidenceQuality: number;

  @ApiProperty({ minimum: 0 })
  declare readonly weightedIntegrity: number;

  @ApiProperty({ minimum: 0 })
  declare readonly weightedFreshness: number;

  @ApiProperty({ minimum: 0 })
  declare readonly total: number;
}

export class ReaderSummaryPromotionEvidenceLineageDto {
  @ApiProperty()
  declare readonly leadCandidateId: string;

  @ApiProperty()
  declare readonly leadCitationId: string;

  @ApiProperty({ type: String, isArray: true })
  declare readonly supportCandidateIds: readonly string[];

  @ApiProperty({ type: String, isArray: true })
  declare readonly supportCitationIds: readonly string[];

  @ApiProperty({ type: String, isArray: true })
  declare readonly citationIds: readonly string[];
}

export class ReaderSummaryPromotionV3AssessmentDto {
  @ApiProperty({ enum: ["reader_value.v1"] })
  declare readonly schemaVersion: "reader_value.v1";
  @ApiProperty() declare readonly assessmentId: string;
  @ApiProperty({ pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z$" })
  declare readonly assessedAt: string;
  @ApiProperty({ pattern: "^[0-9a-f]{64}$" }) declare readonly sourceSnapshotSha256: string;
  @ApiProperty({ pattern: "^[0-9a-f]{64}$" }) declare readonly inputSha256: string;
  @ApiProperty() declare readonly rubricVersion: string;
  @ApiProperty({ pattern: "^[0-9a-f]{64}$" }) declare readonly rubricSha256: string;
  @ApiProperty() declare readonly modelConfigVersion: string;
  @ApiProperty({ type: Object }) declare readonly answers: Readonly<Record<string, unknown>>;
}

export class ReaderSummaryPromotionV3ComparatorDto {
  @ApiProperty({ enum: ["noise", "context", "useful", "important", "insufficient_context"] })
  declare readonly usefulness: string;
  @ApiProperty({ enum: ["unrelated", "adjacent", "relevant", "central", "insufficient_context"] })
  declare readonly relevance: string;
  @ApiProperty({ pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z$" })
  declare readonly publishedAt: string;
  @ApiProperty() declare readonly candidateId: string;
}

export class ReaderSummaryPromotionV3PresentationDto {
  @ApiProperty({ enum: ["reader_post_presentation.v3"] })
  declare readonly schemaVersion: "reader_post_presentation.v3";
  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  declare readonly presentationInputDigest: string;
  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  declare readonly presentationIdentity: string;
  @ApiProperty({ type: () => ReaderSummaryDisplayHeadlineSealDto })
  declare readonly displayHeadline: ReaderSummaryDisplayHeadlineSealDto;
}

export class ReaderSummaryPromotionAttestationDto {
  @ApiPropertyOptional({ type: () => ReaderSummaryDisplayHeadlineSealDto })
  declare readonly displayHeadline?: ReaderSummaryDisplayHeadlineSealDto;

  @ApiPropertyOptional({ minLength: 1, maxLength: 300 })
  declare readonly displaySummary?: string;

  @ApiProperty({
    enum: [
      READER_POST_PROMOTION_ATTESTATION_SCHEMA_V1,
      READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION,
      READER_POST_PROMOTION_ATTESTATION_SCHEMA_V3,
    ],
  })
  declare readonly schemaVersion:
    | typeof READER_POST_PROMOTION_ATTESTATION_SCHEMA_V1
    | typeof READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION
    | typeof READER_POST_PROMOTION_ATTESTATION_SCHEMA_V3;

  @ApiProperty({
    enum: [
      READER_POST_PROMOTION_POLICY_VERSION,
      READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION,
      READER_POST_PROMOTION_POLICY_V3,
    ],
  })
  declare readonly policyVersion:
    | typeof READER_POST_PROMOTION_POLICY_VERSION
    | typeof READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION
    | typeof READER_POST_PROMOTION_POLICY_V3;

  @ApiProperty({
    enum: [READER_POST_PROMOTION_DIGEST_V1, READER_POST_PROMOTION_DIGEST_VERSION,
      READER_POST_PROMOTION_DIGEST_V3],
  })
  declare readonly digestVersion:
    | typeof READER_POST_PROMOTION_DIGEST_V1
    | typeof READER_POST_PROMOTION_DIGEST_VERSION
    | typeof READER_POST_PROMOTION_DIGEST_V3;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  declare readonly digest: string;

  @ApiProperty()
  declare readonly canonicalPayload: string;

  @ApiProperty()
  declare readonly artifactId: string;

  @ApiProperty()
  declare readonly sourceWindowId: string;

  @ApiProperty({ minimum: 0 })
  declare readonly slot: number;

  @ApiProperty()
  declare readonly candidateId: string;

  @ApiProperty()
  declare readonly canonicalIdentity: string;

  @ApiProperty({ enum: ["top", "additional"] })
  declare readonly placement: "top" | "additional";

  @ApiProperty({ enum: ["promote_top", "promote_additional"] })
  declare readonly decision: "promote_top" | "promote_additional";

  @ApiProperty({ type: String, isArray: true })
  declare readonly citationIds: readonly string[];

  @ApiPropertyOptional()
  declare readonly storyClusterId?: string;

  @ApiPropertyOptional({ type: () => ReaderSummaryPromotionScoreComponentsDto })
  declare readonly scoreComponents?: ReaderSummaryPromotionScoreComponentsDto;

  @ApiPropertyOptional({ type: String, isArray: true })
  declare readonly reasonCodes?: readonly string[];

  @ApiPropertyOptional()
  declare readonly candidateDigestInput?: string;

  @ApiPropertyOptional()
  declare readonly slateEntryDigestInput?: string;

  @ApiPropertyOptional()
  declare readonly slateDigestInput?: string;

  @ApiPropertyOptional({ pattern: "^[0-9a-f]{64}$" })
  declare readonly slateDigest?: string;

  @ApiPropertyOptional({
    type: () => ReaderSummaryPromotionEvidenceLineageDto,
  })
  declare readonly evidenceLineage?: ReaderSummaryPromotionEvidenceLineageDto;

  @ApiPropertyOptional({ minLength: 1 })
  declare readonly provider?: string;

  @ApiPropertyOptional() declare readonly storyId?: string;
  @ApiPropertyOptional({ pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z$" })
  declare readonly publishedAt?: string;
  @ApiPropertyOptional({ format: "date-time" })
  declare readonly periodStartedAt?: string;
  @ApiPropertyOptional({ format: "date-time" })
  declare readonly periodEndedAt?: string;
  @ApiPropertyOptional({ format: "date-time" })
  declare readonly ingestionCutoff?: string;
  @ApiPropertyOptional({
    pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z$" })
  declare readonly exactIngestionCutoff?: string;
  @ApiPropertyOptional({ type: () => ReaderSummaryPromotionV3AssessmentDto })
  declare readonly assessment?: ReaderSummaryPromotionV3AssessmentDto;
  @ApiPropertyOptional({ type: () => ReaderSummaryPromotionV3ComparatorDto })
  declare readonly comparator?: ReaderSummaryPromotionV3ComparatorDto;
  @ApiPropertyOptional({ type: () => ReaderSummaryPromotionV3PresentationDto })
  declare readonly presentation?: ReaderSummaryPromotionV3PresentationDto;
}
