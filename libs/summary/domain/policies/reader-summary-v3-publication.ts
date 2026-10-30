import type { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import type { TopRead } from "../entities/top-read";
import type { SummaryEvidenceSelection } from
  "../value-objects/summary-evidence-item";
import type { ReaderSummaryPublicationRejectionFinding } from
  "./reader-summary-publication-decision";
import { READER_PROMOTION_POLICY_STAMP } from "./reader-promotion-ranking";

export const readerSummaryV3PromotionFindings = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
  evidence: SummaryEvidenceSelection,
): readonly ReaderSummaryPublicationRejectionFinding[] => {
  const selection = evidence.promotionV3!;
  const promoted = (cards: readonly TopRead[] | undefined): readonly TopRead[] =>
    (cards ?? []).filter((item) => item.promotionMarker === "reader_post_promotion");
  const matches = (
    actual: readonly TopRead[],
    expected: readonly { readonly candidateId: string }[],
    placement: "top" | "additional" | "news",
  ): boolean => actual.length === expected.length &&
    actual.every((card, index) => card.promotionCandidateId ===
      expected[index]?.candidateId &&
      card.promotionPolicyVersion === READER_PROMOTION_POLICY_STAMP &&
      card.promotionTier === placement);
  return matches(promoted(snapshot.content?.topReads), selection.top, "top") &&
    matches(promoted(snapshot.content?.selectedPosts), selection.additional,
      "additional") &&
    matches(promoted(snapshot.content?.newsWithoutRatingPosts), selection.news,
      "news") ? [] : [{
      code: "editorial_quality",
      reason: "Published promotion cards do not match the frozen backend order.",
    }];
};
