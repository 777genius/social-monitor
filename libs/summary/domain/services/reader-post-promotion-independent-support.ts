import { evaluateReaderPostPromotion, readerPostPromotionTimestampMicros, readerPostProviderFamily, type ReaderPostPromotionInput } from "../policies/reader-post-promotion-policy";
import { isTrustedReaderPostPromotionSupport } from "../policies/reader-post-promotion-support-authority";

/**
 * The slate fixes lead order, but does not attest support. Both producer
 * qualification and writer validation run the complete V1 admission
 * policy for each support candidate with an explicit same-story relation, and
 * require the same exact selection window and source-catalog authority.
 */
export const isEligibleIndependentSupport = (
  support: ReaderPostPromotionInput,
  lead: ReaderPostPromotionInput,
): boolean => {
  if (!isTrustedReaderPostPromotionSupport(support) ||
      readerPostProviderFamily(support.provider) === undefined ||
      readerPostProviderFamily(lead.provider) === undefined ||
      readerPostProviderFamily(support.provider) ===
        readerPostProviderFamily(lead.provider) ||
      !sameSelectionWindow(support, lead)) {
    return false;
  }
  const evaluation = evaluateReaderPostPromotion({
    ...support,
    relation: {
      kind: "same_story",
      targetCanonicalIdentity: lead.canonicalIdentity,
      confidence: 1,
      approved: true,
    },
  });
  return evaluation.decision === "support_only" &&
    evaluation.authoritativeSameStory;
};

const sameSelectionWindow = (
  support: ReaderPostPromotionInput,
  lead: ReaderPostPromotionInput,
): boolean => promotionMicros(support, "start") ===
    promotionMicros(lead, "start") &&
  promotionMicros(support, "end") === promotionMicros(lead, "end") &&
  promotionMicros(support, "cutoff") === promotionMicros(lead, "cutoff");

const promotionMicros = (
  input: ReaderPostPromotionInput,
  field: "start" | "end" | "cutoff",
): bigint | undefined => readerPostPromotionTimestampMicros(
  field === "start"
    ? input.exactPeriodStart ?? input.periodStart
    : field === "end"
      ? input.exactPeriodEnd ?? input.periodEnd
      : input.exactIngestionCutoff ?? input.ingestionCutoff,
);
