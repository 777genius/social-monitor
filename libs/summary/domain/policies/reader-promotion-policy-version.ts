/** Immutable meanings of the signed reader promotion comparator. */
export const READER_PROMOTION_POLICY_V1 = "reader_promotion.2026-11-01" as const;
export const READER_PROMOTION_POLICY_STAMP = "reader_promotion.2026-11-02" as const;
export type ReaderPromotionPolicyVersion = typeof READER_PROMOTION_POLICY_V1 |
  typeof READER_PROMOTION_POLICY_STAMP;
export const supportedReaderPromotionPolicy = (
  value: unknown,
): value is ReaderPromotionPolicyVersion => value === READER_PROMOTION_POLICY_V1 ||
  value === READER_PROMOTION_POLICY_STAMP;

/** A forward writer must bind metric eligibility to its frozen cutoff. */
export type ReaderPromotionRankingContext =
  | { readonly policyVersion: typeof READER_PROMOTION_POLICY_V1 }
  | { readonly policyVersion: typeof READER_PROMOTION_POLICY_STAMP;
      readonly ingestionCutoff: string };

/** Compatibility for historical callers; current writers pass a V2 context. */
export const READER_PROMOTION_V1_CONTEXT = Object.freeze({
  policyVersion: READER_PROMOTION_POLICY_V1,
});
