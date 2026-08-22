import {
  failClosedMaterializedRelatedTopicRelations,
  type ReaderSummaryArtifactProps,
  type SummaryEvidenceSelection,
} from "../../domain";
import { buildReaderPostPromotionProjection } from
  "../../domain/services/reader-post-promotion-projection";
import type { ReaderSummaryDraft } from
  "./execute-reader-summary-job-support";

type PromotionArtifactFields = Pick<
  ReaderSummaryArtifactProps,
  | "promotionAttestations"
  | "promotionEvidenceFacts"
  | "relatedTopicRelations"
>;

export const buildReaderSummaryPromotionArtifactFields = (params: {
  readonly artifactId: string;
  readonly modelEvidence: SummaryEvidenceSelection;
  readonly draft: ReaderSummaryDraft;
}): PromotionArtifactFields => {
  const promotionProjection = params.draft.content === undefined
    ? undefined
    : buildReaderPostPromotionProjection({
        evidence: params.modelEvidence.selectedEvidence,
        clusters: params.modelEvidence.clusters,
        citations: params.draft.citationMap,
        sourceWindow: params.modelEvidence.sourceWindow,
        approvedSameStoryRelations:
          params.modelEvidence.approvedSameStoryRelations,
        relatedTopicRelations: params.modelEvidence.relatedTopicRelations,
        attestationBinding: {
          artifactId: params.artifactId,
          sourceWindow: params.modelEvidence.sourceWindow,
        },
      });
  return {
    promotionAttestations: promotionProjection?.attestations ?? [],
    promotionEvidenceFacts:
      promotionProjection?.attestedEvidenceFacts ?? [],
    relatedTopicRelations: failClosedMaterializedRelatedTopicRelations({
      relations: params.modelEvidence.relatedTopicRelations ?? [],
      materializedRelationIds:
        (params.draft.content?.selectedPosts ?? []).flatMap(
          (item) =>
            item.cardKind === "related_topic" &&
              item.relationId !== undefined
              ? [item.relationId]
              : [],
        ),
    }),
  };
};
