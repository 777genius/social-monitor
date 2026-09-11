import { acceptedFixtureReaderHeadline } from "../../test-fixtures/accepted-reader-headline";
import { canonicalPromotionPayload, promotionPayloadDigest } from "../../domain/services/reader-post-promotion-attestation";
import { buildReaderPostPromotionTitle } from "../../domain/services/reader-post-promotion-title";
import { buildReaderPostPromotionProjection } from "../../domain/services/reader-post-promotion-projection";
import { readerPostPromotionEvidenceInput } from "../../domain/services/reader-post-promotion-evidence-input";
import { selectReaderPostPromotions } from "../../domain/policies/reader-post-promotion-selection";
import { bindReaderPromotionV2TestSelection } from "../../domain/services/reader-post-promotion-attestation.spec-support";
import {
  dailyEvidenceSelection,
  dailySynthesisArtifact,
} from "../../domain/policies/reader-summary-publication-policy-test-fixtures";
import { withPublicationCards } from "../../domain/policies/reader-summary-promotion-publication-test-fixtures";
import { presentReaderSummaryArtifact } from "../../features/shared/reader-summary-artifact-presenter";
import { readerSummaryArtifactViewFromReaderSummaryView } from "./reader-summary-rest.mapper";

/** Deterministic V2 Top/Additional envelope; never invokes a model or provider. */
export const projectPublicTitles = (title: string, sourceText: string, assessed = false) => {
  const selection = dailyEvidenceSelection(25);
  const snapshot = dailySynthesisArtifact().toSnapshot();
  const evidence = selection.selectedEvidence.map((item) => ({
    ...item, title, sourceText, bodyPreview: sourceText.slice(0, 280),
  })).map((item) => assessed ? acceptedFixtureReaderHeadline(item, { tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId }) : item);
  const base = dailySynthesisArtifact();

  const binding = { artifactId: snapshot.readerSummaryId, sourceWindow: selection.sourceWindow };
  const { editorialSlate } = bindReaderPromotionV2TestSelection(
    selectReaderPostPromotions(evidence.map((item, index) =>
      readerPostPromotionEvidenceInput(item, selection.sourceWindow,
        snapshot.citationMap[index]!.citationId, true, selection.clusters[index]!.id))),
    binding,
  );
  const projection = buildReaderPostPromotionProjection({
    evidence,
    clusters: selection.clusters,
    citations: snapshot.citationMap,
    sourceWindow: selection.sourceWindow,
    editorialSlate,
    attestationBinding: binding,
  });
  // Explicit historical fixture: preserve old source presentations without
  // manufacturing accepted display authority for these legacy regressions.
  const historicalCard = (card: typeof projection.topReads[number]) => {
    const { displayHeadline, capturedSource, ...rest } = card;
    void displayHeadline; void capturedSource;
    const lead = evidence.find((item) => item.feedItemId === card.promotionCandidateId)!;
    return { ...rest, title: buildReaderPostPromotionTitle({ lead }) };
  };
  const historicalAttestations = projection.attestations.map((attestation) => {
    if (attestation.schemaVersion !== "reader_post_promotion_attestation.v2") return attestation;
    const { displayHeadline, canonicalPayload, digest, ...body } = attestation;
    void displayHeadline; void canonicalPayload; void digest;
    const payload = canonicalPromotionPayload(body);
    return { ...body, canonicalPayload: payload, digest: promotionPayloadDigest(payload) };
  });
  const artifact = withPublicationCards(base, {
    topReads: assessed ? projection.topReads : projection.topReads.map(historicalCard),
    selectedPosts: assessed ? projection.additionalPosts : projection.additionalPosts.map(historicalCard),
  }, assessed ? projection.attestations : historicalAttestations, projection.attestedEvidenceFacts);
  const view = presentReaderSummaryArtifact(artifact, {
    status: "fresh", checkedAt: new Date("2026-07-05T09:00:00Z"),
  });
  return {
    evidence, projection, view,
    response: readerSummaryArtifactViewFromReaderSummaryView(view),
  };
};
