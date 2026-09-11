import { readerDisplayIdentityMatches } from "../../domain/services/reader-post-display-identity";
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
    ? attestation.displayHeadline : undefined;
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
  if (seal?.headline.status !== "accepted" ||
      canonicalPromotionPayload(payload.displayHeadline) !== canonicalPromotionPayload(seal) ||
      !readerDisplayIdentityMatches(card, seal, view)) return false;
  const binding = seal.headline.binding;
  return view.citations.some((citation) =>
    citation.citationId === attestation.citationId &&
    card.citationIds.includes(citation.citationId) &&
    citation.feedItemId === binding.candidateId &&
    citation.sourceItemId === binding.sourceItemId &&
    citation.providerKey === binding.providerKey);
};
