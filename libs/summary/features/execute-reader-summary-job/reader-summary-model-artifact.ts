import { ReaderSummaryArtifact, type ReaderSummaryJob, type ReaderSummaryContextArtifact,
  type ReaderSummaryDailyInputReceipt, type SummaryEvidenceSelection } from "../../domain";
import type { ReaderSummaryDraft } from "./execute-reader-summary-job-support";
import { buildReaderSummaryPromotionArtifactFields } from "./reader-summary-promotion-artifact-fields";

/** Keep sealed board clusters separate from the model's narrative input authority. */
export function buildReaderSummaryModelArtifact(params: {
  readonly snapshot: ReturnType<ReaderSummaryJob["toSnapshot"]>;
  readonly readerSummaryId: string;
  readonly generatedAt: Date;
  readonly modelEvidence: SummaryEvidenceSelection;
  readonly contextArtifacts: readonly ReaderSummaryContextArtifact[];
  readonly draft: ReaderSummaryDraft;
  readonly dailyGenerationReceipt?: ReaderSummaryDailyInputReceipt;
}): ReaderSummaryArtifact {
  const { snapshot, modelEvidence, draft } = params;
  const boardStoryIds = new Set([...(modelEvidence.promotionV3?.top ?? []),
    ...(modelEvidence.promotionV3?.additional ?? []), ...(modelEvidence.promotionV3?.news ?? [])]
    .map(candidate => candidate.storyId));
  return ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1", readerSummaryId: params.readerSummaryId,
    tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId, scope: snapshot.scope,
    period: snapshot.period, userId: snapshot.userId, subscriptionId: snapshot.subscriptionId,
    generatedAt: params.generatedAt, sourceWindow: modelEvidence.sourceWindow,
    storyClusters: modelEvidence.dailyGenerationInput === undefined ? modelEvidence.clusters :
      modelEvidence.clusters.filter(cluster => boardStoryIds.has(cluster.id)),
    ...(modelEvidence.dailyGenerationInput === undefined ? {} : { dailyGenerationInput: {
      ...modelEvidence.dailyGenerationInput, sent: params.dailyGenerationReceipt } }),
    contextArtifacts: params.contextArtifacts, personalization: modelEvidence.personalization, ...draft,
    ...buildReaderSummaryPromotionArtifactFields({ artifactId: params.readerSummaryId, modelEvidence, draft }),
  });
}
