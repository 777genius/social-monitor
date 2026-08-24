import type { TopRead } from "../entities/top-read";
import type { PromotionOracleCard } from
  "./reader-summary-promotion-publication-oracle";
import { READER_POST_PROMOTION_POLICY_V1 } from "./reader-post-promotion-policy";
import type { ReaderSummaryPublicationRejectionFinding } from "./reader-summary-publication-decision";

export const promotionPublicationFindings = (params: {
  readonly expectedTop: readonly PromotionOracleCard[];
  readonly expectedAdditional: readonly PromotionOracleCard[];
  readonly actualTop: readonly TopRead[];
  readonly actualSelected: readonly TopRead[];
}): readonly ReaderSummaryPublicationRejectionFinding[] => {
  const actualAdditional = params.actualSelected;
  const findings: ReaderSummaryPublicationRejectionFinding[] = [];
  const addFinding = (reason: string, item?: TopRead): void => {
    findings.push({
      code: "top_read_ineligible_source",
      reason,
      ...(item === undefined ? {} : { topReadTitle: item.title }),
    });
  };
  for (const item of [...params.actualTop, ...params.actualSelected]) {
    if (item.promotionMarker !== "reader_post_promotion" ||
        item.promotionPolicyVersion !== READER_POST_PROMOTION_POLICY_V1.version ||
        (item.promotionTier !== "top" && item.promotionTier !== "additional")) {
      addFinding(
        `Promoted post "${item.title}" is missing the exact Promotion V1 marker, tier, or version.`,
        item,
      );
    }
  }
  const actualCanonicalIdentities = params.actualSelected.map((item) =>
    canonicalPublicationIdentity(item.canonicalUrl),
  );
  if (actualCanonicalIdentities.some((identity, index) =>
    identity.length === 0 || actualCanonicalIdentities.indexOf(identity) !== index
  )) {
    addFinding("Reader summary promoted posts contain a missing or duplicate canonical identity.");
  }
  if (params.actualTop.length > READER_POST_PROMOTION_POLICY_V1.maxTop ||
      actualAdditional.length > READER_POST_PROMOTION_POLICY_V1.maxAdditional) {
    addFinding("Reader summary promoted posts exceed the immutable Promotion V1 caps.");
  }
  if (!sameOrderedOraclePromotions(params.actualTop, params.expectedTop)) {
    addFinding("Reader summary Top array differs in order or membership from independent Promotion V1 verification.");
  }
  if (!sameOrderedOraclePromotions(actualAdditional, params.expectedAdditional)) {
    addFinding("Reader summary Additional array differs in order or membership from independent Promotion V1 verification.");
  }
  if (new Set([...params.actualTop, ...params.actualSelected].map((item) =>
    item.promotionCanonicalIdentity)).size !==
      params.actualTop.length + params.actualSelected.length) {
    addFinding("Reader summary selected-post array has duplicate, extra, missing, or reordered Promotion V1 cards.");
  }
  return findings;
};

const sameOrderedOraclePromotions = (
  actual: readonly TopRead[], expected: readonly PromotionOracleCard[],
): boolean => actual.length === expected.length && actual.every((item, index) => {
  const oracle = expected[index]!;
  return item.promotionCandidateId === oracle.candidateId &&
    item.promotionCanonicalIdentity === oracle.canonicalIdentity &&
    item.promotionTier === oracle.placement &&
    item.citationIds.length === oracle.citationIds.length &&
    item.citationIds.every((citationId, citationIndex) =>
      citationId === oracle.citationIds[citationIndex]);
});

const canonicalPublicationIdentity = (value: string | undefined): string => {
  if (value === undefined) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase("en-US");
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return `url:${url.toString()}`;
  } catch {
    return "";
  }
};
