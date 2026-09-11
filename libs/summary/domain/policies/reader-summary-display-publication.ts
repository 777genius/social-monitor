import type { ReaderSummaryArtifactProps } from "../entities/reader-summary-artifact";
import type { SummaryEvidenceSelection } from "../value-objects/summary-evidence-item";
import type { ReaderSummaryPublicationRejectionFinding } from "./reader-summary-publication-decision";
import { canonicalPromotionPayload } from "../services/reader-post-promotion-attestation";
import { capturedReaderSource, readerPostDisplayHeadline } from "../services/reader-post-display-headline";
import { readerDisplayIdentityMatches } from "../services/reader-post-display-identity";

export const readerDisplayPublicationFindings = (
  snapshot: ReaderSummaryArtifactProps, evidence: SummaryEvidenceSelection,
): readonly ReaderSummaryPublicationRejectionFinding[] => {
  const cards = [...(snapshot.content?.topReads ?? []), ...(snapshot.content?.selectedPosts ?? [])]
    .filter((card) => card.promotionMarker === "reader_post_promotion");
  return cards.flatMap((card) => {
    const lead = evidence.selectedEvidence.find((item) => item.feedItemId === card.promotionCandidateId);
    const accepted = lead === undefined ? undefined : readerPostDisplayHeadline(lead, snapshot);
    const attestation = snapshot.promotionAttestations?.find((item) => item.candidateId === card.promotionCandidateId);
    const seal = attestation?.schemaVersion === "reader_post_promotion_attestation.v2"
      ? attestation.displayHeadline : undefined;
    if (accepted?.status === "accepted" && lead !== undefined &&
        readerDisplayIdentityMatches(card, seal, snapshot) &&
        canonicalPromotionPayload(accepted) === canonicalPromotionPayload(card.displayHeadline) &&
        canonicalPromotionPayload(capturedReaderSource(lead)) === canonicalPromotionPayload(card.capturedSource)) return [];
    return [{ code: "editorial_quality" as const,
      reason: "Selected reader headline is unavailable or its source identity is invalid." }];
  });
};
