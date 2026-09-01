import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION,
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_V1,
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION,
  READER_POST_PROMOTION_DIGEST_V1,
  READER_POST_PROMOTION_DIGEST_VERSION,
  READER_POST_PROMOTION_POLICY_VERSION,
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

export class ReaderSummaryPromotionAttestationDto {
  @ApiProperty({
    enum: [
      READER_POST_PROMOTION_ATTESTATION_SCHEMA_V1,
      READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION,
    ],
  })
  declare readonly schemaVersion:
    | typeof READER_POST_PROMOTION_ATTESTATION_SCHEMA_V1
    | typeof READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION;

  @ApiProperty({
    enum: [
      READER_POST_PROMOTION_POLICY_VERSION,
      READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION,
    ],
  })
  declare readonly policyVersion:
    | typeof READER_POST_PROMOTION_POLICY_VERSION
    | typeof READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION;

  @ApiProperty({
    enum: [READER_POST_PROMOTION_DIGEST_V1, READER_POST_PROMOTION_DIGEST_VERSION],
  })
  declare readonly digestVersion:
    | typeof READER_POST_PROMOTION_DIGEST_V1
    | typeof READER_POST_PROMOTION_DIGEST_VERSION;

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
}
