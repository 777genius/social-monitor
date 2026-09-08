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
export const projectPublicTitles = (title: string, sourceText: string) => {
  const selection = dailyEvidenceSelection(25);
  const evidence = selection.selectedEvidence.map((item) => ({
    ...item, title, sourceText, bodyPreview: sourceText.slice(0, 280),
  }));
  const base = dailySynthesisArtifact();
  const snapshot = base.toSnapshot();
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
  const artifact = withPublicationCards(base, {
    topReads: projection.topReads,
    selectedPosts: projection.additionalPosts,
  }, projection.attestations, projection.attestedEvidenceFacts);
  const view = presentReaderSummaryArtifact(artifact, {
    status: "fresh", checkedAt: new Date("2026-07-05T09:00:00Z"),
  });
  return {
    evidence, projection, view,
    response: readerSummaryArtifactViewFromReaderSummaryView(view),
  };
};
