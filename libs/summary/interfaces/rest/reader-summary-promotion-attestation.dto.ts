import { ApiProperty } from "@nestjs/swagger";

export const READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION =
  "reader_post_promotion_attestation.v1" as const;
export const READER_POST_PROMOTION_DIGEST_VERSION =
  "reader_post_promotion_digest.sha256.v1" as const;

export class ReaderSummaryPromotionAttestationDto {
  @ApiProperty({ enum: [READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION] })
  declare readonly schemaVersion:
    typeof READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION;

  @ApiProperty({ enum: ["reader_post_promotion.v1"] })
  declare readonly policyVersion: "reader_post_promotion.v1";

  @ApiProperty({ enum: [READER_POST_PROMOTION_DIGEST_VERSION] })
  declare readonly digestVersion: typeof READER_POST_PROMOTION_DIGEST_VERSION;

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
}
