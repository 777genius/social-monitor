import {
  readerPostProviderFamily,
  READER_POST_PROMOTION_POLICY_V1,
  type ReaderPostPromotionInput,
} from "./reader-post-promotion-policy";

export type ReaderPostPromotionEvidenceConfidence = Readonly<{
  providerCount: number;
  confidence: number;
}>;

/**
 * Calibrates evidence confidence after ranking has selected a lead and its
 * support. This policy never evaluates, reorders, or changes promotion lanes.
 */
export const readerPostPromotionEvidenceConfidence = (params: {
  readonly lead: ReaderPostPromotionInput;
  readonly support: readonly ReaderPostPromotionInput[];
}): ReaderPostPromotionEvidenceConfidence => {
  const admitted = [params.lead, ...params.support];
  const providerCount = new Set(
    admitted.map((item) => readerPostProviderFamily(item.provider)),
  ).size;
  const rawConfidence = Math.min(
    1,
    params.lead.qualityScore + Math.min(
      READER_POST_PROMOTION_POLICY_V1.confidence.maxSupportBoost,
      params.support.length *
        READER_POST_PROMOTION_POLICY_V1.confidence.supportBoost,
    ),
  );
  const confidence = providerCount > 1
    ? rawConfidence
    : Math.min(
        rawConfidence,
        isAttestedOfficial(params.lead)
          ? 0.62
          : params.support.length > 0
            ? 0.55
            : 0.42,
      );

  return { providerCount, confidence };
};

const isAttestedOfficial = (input: ReaderPostPromotionInput): boolean =>
  input.authorityAttestation?.status === "attested" &&
  input.authorityAttestation.official && input.authorityAttestation.trusted &&
  (readerPostProviderFamily(input.provider) !== "x" ||
    input.authorityAttestation.attestedBy === "source_catalog");
