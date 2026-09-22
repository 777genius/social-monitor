import type { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import type { SummaryEvidenceSelection } from
  "../value-objects/summary-evidence-item";
import type { ReaderSummaryPublicationRejectionFinding } from
  "./reader-summary-publication-decision";

export const readerSummaryV3PromotionFindings = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
  evidence: SummaryEvidenceSelection,
): readonly ReaderSummaryPublicationRejectionFinding[] => {
  const selection = evidence.promotionV3!;
  const actualTop = snapshot.content?.topReads.filter((item) =>
    item.promotionMarker === "reader_post_promotion") ?? [];
  const actualAdditional = (snapshot.content?.selectedPosts ?? []).filter((item) =>
    item.promotionMarker === "reader_post_promotion");
  const matches = (actual: typeof actualTop, expected: typeof selection.top,
    placement: "top" | "additional") => actual.length === expected.length &&
    actual.every((card, index) => card.promotionCandidateId ===
      expected[index]?.candidateId && card.promotionPolicyVersion ===
      "reader_post_promotion.v3" && card.promotionTier === placement);
  return matches(actualTop, selection.top, "top") &&
    matches(actualAdditional, selection.additional, "additional") ? [] : [{
      code: "editorial_quality",
      reason: "Published Promotion V3 cards do not match the frozen backend order.",
    }];
};
