import {
  buildSummaryEvidencePack,
  buildSummaryEvidenceProfile,
  additionalReaderSummaryEvidence,
  primaryReaderSummaryEvidence,
  type ReaderSummaryCoveragePlanItem,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { buildAdaptiveReaderSummaryEvidence } from "./openai-responses-reader-summary-adaptive-evidence";
import { readerSummaryCitableEvidence } from "./reader-summary-evidence-citation-map";

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
    coveragePlan: {
      mode: coveragePlan.mode,
      lead:
        coveragePlan.lead === undefined
          ? null
          : promptCoverageItem(coveragePlan.lead, citationIdByFeedItemId),
      secondary: coveragePlan.secondary.map((item) =>
        promptCoverageItem(item, citationIdByFeedItemId),
      ),
    },
    sourceWindow: {
      windowId: input.evidence.sourceWindow.windowId,
      startedAt: input.evidence.sourceWindow.startedAt.toISOString(),
      endedAt: input.evidence.sourceWindow.endedAt.toISOString(),
    },
    editorialSlate: input.evidence.dailyGenerationInput === undefined ? input.evidence.editorialSlate : undefined,
    storyClusters: primaryEvidence.clusters.map((cluster) => ({
      id: cluster.id,
      storyKey: cluster.storyKey,
      representativeFeedItemId: cluster.representativeFeedItemId,
      duplicateFeedItemIds: cluster.duplicateFeedItemIds,
      interestIds: cluster.interestIds,
      providerKeys: cluster.providerKeys,
      score: cluster.score,
      observedAtRange: {
        startedAt: cluster.observedAtRange.startedAt.toISOString(),
        endedAt: cluster.observedAtRange.endedAt.toISOString(),
      },
      whyImportant: cluster.whyImportant,
    })),
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
    additionalStoryClusters: additionalEvidence.clusters.map((cluster) => ({
      id: cluster.id,
      storyKey: cluster.storyKey,
      representativeFeedItemId: cluster.representativeFeedItemId,
      duplicateFeedItemIds: cluster.duplicateFeedItemIds,
      interestIds: cluster.interestIds,
      providerKeys: cluster.providerKeys,
      score: cluster.score,
      whyImportant: cluster.whyImportant,
    })),
    additionalEvidence: buildAdaptiveReaderSummaryEvidence(
      additionalEvidence,
      coveragePlan,
      citationIdByFeedItemId,
    ),
  });
};

const promptCoverageItem = (
  item: ReaderSummaryCoveragePlanItem,
  citationIdByFeedItemId: ReadonlyMap<string, string>,
) => ({
  role: item.role,
  storyClusterId: item.clusterId,
  score: item.score,
  citationIds: item.feedItemIds
    .map((feedItemId) => citationIdByFeedItemId.get(feedItemId))
    .filter((id): id is string => id !== undefined),
  providerKeys: item.providerKeys,
  interestIds: item.interestIds,
  whyImportant: item.whyImportant,
});

