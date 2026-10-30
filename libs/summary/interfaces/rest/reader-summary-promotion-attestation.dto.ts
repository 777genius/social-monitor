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
  READER_PROMOTION_POLICY_STAMP,
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

export class ReaderSummaryPromotionEngagementDto {
  @ApiProperty({ enum: ["likes_plus_two_reposts", "reddit_score",
    "hacker_news_points", "max_stars_or_half_forks"] })
  declare readonly method: string;
  @ApiProperty({ minimum: 0, description: "Provider signal; integer except GitHub " +
    "half forks (x.5)." })
  declare readonly value: number;
  @ApiProperty({ pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z$" })
  declare readonly observedAt: string;
}

export class ReaderSummaryPromotionPopularityDto {
  @ApiProperty({ minimum: 1 }) declare readonly cohortSize: number;
  @ApiProperty({ minimum: 0 }) declare readonly below: number;
  @ApiProperty({ minimum: 0 }) declare readonly equal: number;
}

export class ReaderSummaryPromotionV3ComparatorDto {
  @ApiProperty({ enum: ["ranked", "unranked"],
    description: "Source registry class; unranked posts are only in the news block." })
  declare readonly block: "ranked" | "unranked";
  @ApiProperty({ description: "Source registry family, e.g. x, reddit, hacker_news, " +
    "github_radar, rss." })
  declare readonly providerFamily: string;
  @ApiProperty({ enum: ["noise", "context", "useful", "important", "insufficient_context"] })
  declare readonly usefulness: string;
  @ApiProperty({ enum: ["unrelated", "adjacent", "relevant", "central", "insufficient_context"],
    description: "Admission gate only; not an order key." })
  declare readonly relevance: string;
  // Always serialized (null when unknown). Declared optional only because the
  // Flutter generator drops `nullable` on a single-ref allOf and would emit a
  // non-null field that fails to decode every unknown metric; the signed
  // canonical comparator still carries the key.
  @ApiPropertyOptional({ type: () => ReaderSummaryPromotionEngagementDto, nullable: true,
    description: "Frozen metric of a ranked source; null means unknown. Always " +
      "present in responses." })
  declare readonly engagement: ReaderSummaryPromotionEngagementDto | null;
  @ApiProperty({ description: "engagement.observedAt - publishedAt >= 6 hours." })
  declare readonly metricMature: boolean;
  @ApiPropertyOptional({ type: () => ReaderSummaryPromotionPopularityDto, nullable: true,
    description: "Mid-rank inside providerFamily: (below + equal / 2) / cohortSize. " +
      "Present only when metricMature and the family has at least 5 mature " +
      "gate-passed posts (cohortSize >= 5), otherwise null. Always present in responses." })
  declare readonly popularity: ReaderSummaryPromotionPopularityDto | null;
  @ApiProperty({ type: String, nullable: true,
    description: "Real publisher of a news.google.com item (title suffix), else null." })
  declare readonly newsPublisher: string | null;
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
      READER_PROMOTION_POLICY_STAMP,
    ],
    description: "For reader_post_promotion_attestation.v3 this is the promotion " +
      "policy stamp. Another stamp never reaches clients: such days are served " +
      "with empty boards and freshness.reason = ranking_policy_changed.",
  })
  declare readonly policyVersion:
    | typeof READER_POST_PROMOTION_POLICY_VERSION
    | typeof READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION
    | typeof READER_PROMOTION_POLICY_STAMP;

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

  @ApiProperty({ enum: ["top", "additional", "news"] })
  declare readonly placement: "top" | "additional" | "news";

  @ApiProperty({ enum: ["promote_top", "promote_additional", "promote_news"] })
  declare readonly decision: "promote_top" | "promote_additional" | "promote_news";

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
