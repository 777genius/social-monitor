import {
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_V3,
  READER_PROMOTION_POLICY_STAMP,
  readerPostPromotionCardFields,
  type ReaderSummaryContent,
  type TopRead,
} from "../../../domain";

/** Legacy_v2 policies keep their own versions; only Jev boards carry the stamp. */
const currentCardPolicyVersions: ReadonlySet<string> = new Set([
  "reader_post_promotion.v1",
  "reader_post_promotion.v2",
  READER_PROMOTION_POLICY_STAMP,
]);

/**
 * A Jev promotion board ranked under another READER_PROMOTION_POLICY_STAMP.
 *
 * Such a board is not corrupt, it is outdated: its attestations follow an
 * older comparator. It is read back with its promoted cards reduced to plain
 * cards and no attestations, flagged `rebuild_required`, so the day opens
 * as "needs rebuild" instead of failing rehydration. No old comparator is
 * interpreted here.
 */
export const supersededPromotionBoard = (input: {
  readonly promotionAttestations: unknown;
  readonly content: ReaderSummaryContent | undefined;
}): {
  readonly promotionAttestations: readonly [];
  readonly promotionEvidenceFacts: readonly [];
  readonly content: ReaderSummaryContent | undefined;
  readonly promotionBoardState: "rebuild_required";
} | undefined => {
  const attestations = Array.isArray(input.promotionAttestations)
    ? input.promotionAttestations : [];
  const staleAttestation = attestations.some((item: unknown) =>
    item !== null && typeof item === "object" &&
    (item as Record<string, unknown>).schemaVersion ===
      READER_POST_PROMOTION_ATTESTATION_SCHEMA_V3 &&
    (item as Record<string, unknown>).policyVersion !== READER_PROMOTION_POLICY_STAMP);
  const staleCard = contentCards(input.content).some((card) =>
    card.promotionMarker === "reader_post_promotion" &&
    card.promotionPolicyVersion !== undefined &&
    !currentCardPolicyVersions.has(card.promotionPolicyVersion));
  if (!staleAttestation && !staleCard) return undefined;
  return {
    promotionAttestations: [],
    promotionEvidenceFacts: [],
    content: withoutPromotionFields(input.content),
    promotionBoardState: "rebuild_required",
  };
};

const contentCards = (content: ReaderSummaryContent | undefined): readonly TopRead[] =>
  content === undefined ? [] : [
    ...content.topReads,
    ...(content.selectedPosts ?? []),
    ...(content.newsWithoutRatingPosts ?? []),
    ...content.interestSections.flatMap((section) => section.items),
  ];

const withoutPromotionFields = (
  content: ReaderSummaryContent | undefined,
): ReaderSummaryContent | undefined => {
  if (content === undefined) return undefined;
  const strip = (card: TopRead): TopRead => Object.fromEntries(Object.entries(card)
    .filter(([key]) => !(readerPostPromotionCardFields as readonly string[])
      .includes(key))) as TopRead;
  return {
    ...content,
    topReads: content.topReads.map(strip),
    ...(content.selectedPosts === undefined ? {} : {
      selectedPosts: content.selectedPosts.map(strip),
    }),
    ...(content.newsWithoutRatingPosts === undefined ? {} : {
      newsWithoutRatingPosts: content.newsWithoutRatingPosts.map(strip),
    }),
    interestSections: content.interestSections.map((section) => ({
      ...section, items: section.items.map(strip),
    })),
  };
};
