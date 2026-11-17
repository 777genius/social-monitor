import {
  buildSummaryEvidencePack,
  buildSummaryEvidenceProfile,
  additionalReaderSummaryEvidence,
  primaryReaderSummaryEvidence,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { buildAdaptiveReaderSummaryEvidence } from "./openai-responses-reader-summary-adaptive-evidence";
import { readerSummaryCitableEvidence } from "./reader-summary-evidence-citation-map";
import { buildReaderSummaryCoveragePlanPromptPayload } from "./openai-responses-reader-summary-coverage-plan-payload";
import { projectAdditionalReaderSummaryStoryCluster, projectPrimaryReaderSummaryStoryCluster } from "./openai-responses-reader-summary-cluster-payload";

export const buildOpenAiReaderSummaryPromptPayload = (
  input: ReaderSummaryModelInput,
): string => {
  const primaryEvidence = primaryReaderSummaryEvidence(input.evidence);
  const additionalEvidence = additionalReaderSummaryEvidence(input.evidence);
  const citedEvidence = readerSummaryCitableEvidence(input.evidence);
  const citationIdByFeedItemId = new Map(
    citedEvidence.map((item, index) => [item.feedItemId, `c${index + 1}`] as const),
  );
  const coveragePlan = input.coveragePlan;

  return JSON.stringify({
    scope: input.scope,
    requestedAt: input.requestedAt.toISOString(),
    policy: input.policy,
    personalization: input.evidence.personalization,
    evidenceProfile: buildSummaryEvidenceProfile(primaryEvidence),
    evidencePack: input.evidence.dailyGenerationInput === undefined ? buildSummaryEvidencePack(primaryEvidence) : undefined,
    dailyEditorialPlan: input.dailyEditorialPlan,
    coveragePlan: buildReaderSummaryCoveragePlanPromptPayload(coveragePlan, citationIdByFeedItemId),
    sourceWindow: {
      windowId: input.evidence.sourceWindow.windowId,
      startedAt: input.evidence.sourceWindow.startedAt.toISOString(),
      endedAt: input.evidence.sourceWindow.endedAt.toISOString(),
    },
    editorialSlate: input.evidence.dailyGenerationInput === undefined ? input.evidence.editorialSlate : undefined,
    storyClusters: primaryEvidence.clusters.map(projectPrimaryReaderSummaryStoryCluster),
    contextArtifacts: input.contextArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      scope: artifact.scope,
      summaryText: artifact.summaryText,
      generatedAt: artifact.generatedAt.toISOString(),
      freshness: artifact.freshness,
    })),
    evidence: buildAdaptiveReaderSummaryEvidence(
      primaryEvidence,
      coveragePlan,
      citationIdByFeedItemId,
    ),
    additionalStoryClusters: additionalEvidence.clusters.map(projectAdditionalReaderSummaryStoryCluster),
    additionalEvidence: buildAdaptiveReaderSummaryEvidence(
      additionalEvidence,
      coveragePlan,
      citationIdByFeedItemId,
    ),
  });
};

