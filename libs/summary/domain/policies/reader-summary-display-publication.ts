import type { ReaderSummaryArtifactProps } from "../entities/reader-summary-artifact";
import type { SummaryEvidenceSelection } from "../value-objects/summary-evidence-item";
import type { ReaderSummaryPublicationRejectionFinding } from "./reader-summary-publication-decision";
import { canonicalPromotionPayload } from "../services/reader-post-promotion-attestation";
import { readerPostPresentationV3MatchesCard } from
  "../services/reader-post-presentation-v3";
import { capturedReaderSource, readerPostDisplayHeadline,
  readerPostPublishedHeadline } from "../services/reader-post-display-headline";
import { readerDisplayIdentityMatches } from "../services/reader-post-display-identity";
import {
  buildReaderPostPromotionTitle,
  hasReaderFacingPromotionSource,
} from "../services/reader-post-promotion-title";

export const readerDisplayPublicationFindings = (
  snapshot: ReaderSummaryArtifactProps, evidence: SummaryEvidenceSelection,
): readonly ReaderSummaryPublicationRejectionFinding[] => {
  const cards = [...(snapshot.content?.topReads ?? []), ...(snapshot.content?.selectedPosts ?? [])]
    .filter((card) => card.promotionMarker === "reader_post_promotion");
  return cards.flatMap((card) => {
    const lead = evidence.selectedEvidence.find((item) => item.feedItemId === card.promotionCandidateId);
    const attestation = snapshot.promotionAttestations?.find((item) => item.candidateId === card.promotionCandidateId);
    const seal = attestation?.schemaVersion === "reader_post_promotion_attestation.v2"
      ? attestation.displayHeadline
      : attestation?.schemaVersion === "reader_post_promotion_attestation.v3"
        ? attestation.presentation.displayHeadline : undefined;
    const sealedSummary = attestation?.schemaVersion === "reader_post_promotion_attestation.v2"
      ? attestation.displaySummary : undefined;
    const v3 = attestation?.schemaVersion === "reader_post_promotion_attestation.v3";
    const assessed = lead === undefined || v3 ? undefined
      : readerPostDisplayHeadline(lead, snapshot);
    const headline = lead === undefined ? undefined : v3
      ? card.displayHeadline : readerPostPublishedHeadline(lead, snapshot);
    const identityMatches = v3
      ? seal !== undefined && readerPostPresentationV3MatchesCard({
          title: card.title,
          providerKey: card.providerKey,
          candidateId: card.promotionCandidateId,
          capturedSource: card.capturedSource,
          headline: card.displayHeadline,
          seal,
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
        }) && card.exactPublishedAt === attestation.publishedAt
      : readerDisplayIdentityMatches(card, seal, snapshot, sealedSummary);
    if (lead !== undefined && headline !== undefined && identityMatches &&
        canonicalPromotionPayload(headline) === canonicalPromotionPayload(card.displayHeadline) &&
        canonicalPromotionPayload(capturedReaderSource(lead)) === canonicalPromotionPayload(card.capturedSource) &&
        (v3 || assessed !== undefined && assessed.status === "accepted" ||
          (lead.readerHeadline?.status !== "accepted" &&
            hasReaderFacingPromotionSource(lead) &&
            card.title === buildReaderPostPromotionTitle({ lead })))) return [];
    return [{ code: "editorial_quality" as const,
      reason: "Selected reader headline is unavailable or its source identity is invalid." }];
  });
};
