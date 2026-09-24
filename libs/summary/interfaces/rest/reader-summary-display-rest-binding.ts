import { readerDisplayIdentityMatches } from "../../domain/services/reader-post-display-identity";
import { readerPostPresentationV3MatchesCard } from
  "../../domain/services/reader-post-presentation-v3";
import { canonicalPromotionPayload } from "../../domain/services/reader-post-promotion-attestation";
import type { ReaderSummaryArtifactView } from "../../features/shared/reader-summary-artifact-presenter";

type Card = ReaderSummaryArtifactView["content"]["topReads"][number];
type Attestation = ReaderSummaryArtifactView["promotionAttestations"][number];

/** Integrity at the read boundary; trusted artifact publication remains upstream. */
export const validReaderDisplayRestBinding = (
  card: Card,
  attestation: Attestation,
  view: Pick<ReaderSummaryArtifactView, "tenantId" | "workspaceId" | "citations">,
): boolean => {
  const seal = attestation.schemaVersion === "reader_post_promotion_attestation.v2"
    ? attestation.displayHeadline
    : attestation.schemaVersion === "reader_post_promotion_attestation.v3"
      ? attestation.presentation.displayHeadline
      : undefined;
  const sealedSummary = attestation.schemaVersion === "reader_post_promotion_attestation.v2"
    ? attestation.displaySummary : undefined;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(attestation.canonicalPayload) as Record<string, unknown>;
  } catch {
    return false;
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (seal === undefined && card.displayHeadline === undefined && card.capturedSource === undefined) {
    // Preserve historical source presentations without granting new authority.
    return !Object.hasOwn(payload, "displayHeadline");
  }
  const v3 = attestation.schemaVersion === "reader_post_promotion_attestation.v3";
  const payloadSeal = v3 && payload.presentation !== null &&
      typeof payload.presentation === "object"
    ? (payload.presentation as Record<string, unknown>).displayHeadline
    : payload.displayHeadline;
  if (canonicalPromotionPayload(payloadSeal) !== canonicalPromotionPayload(seal) ||
      payload.displaySummary !== sealedSummary ||
      (v3
        ? !readerPostPresentationV3MatchesCard({
            title: card.title,
            providerKey: card.providerKey,
            candidateId: card.promotionCandidateId,
            capturedSource: card.capturedSource,
            headline: card.displayHeadline,
            seal: seal!,
            tenantId: view.tenantId,
            workspaceId: view.workspaceId,
          })
        : !readerDisplayIdentityMatches(card, seal, view, sealedSummary))) return false;
  if (seal?.headline.status === "accepted") {
    const binding = seal.headline.binding;
    return view.citations.some((citation) =>
      attestation.citationIds.includes(citation.citationId) &&
      card.citationIds.includes(citation.citationId) &&
      citation.feedItemId === binding.candidateId &&
      citation.sourceItemId === binding.sourceItemId &&
      citation.providerKey === binding.providerKey);
  }
  return view.citations.some((citation) =>
    attestation.citationIds.includes(citation.citationId) &&
    card.citationIds.includes(citation.citationId) &&
    citation.feedItemId === attestation.candidateId);
};
