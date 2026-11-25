import type { SummaryEvidenceSelection } from "../../domain";

type ReaderSummaryStoryCluster = SummaryEvidenceSelection["clusters"][number];

// Primary clusters carry the trusted observation window into the model input.
export const projectPrimaryReaderSummaryStoryCluster = (cluster: ReaderSummaryStoryCluster) => ({
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
});

// Additional clusters are context only; do not add an observation window to
// the historical additionalStoryClusters wire shape.
export const projectAdditionalReaderSummaryStoryCluster = (cluster: ReaderSummaryStoryCluster) => ({
  id: cluster.id,
  storyKey: cluster.storyKey,
  representativeFeedItemId: cluster.representativeFeedItemId,
  duplicateFeedItemIds: cluster.duplicateFeedItemIds,
  interestIds: cluster.interestIds,
  providerKeys: cluster.providerKeys,
  score: cluster.score,
  whyImportant: cluster.whyImportant,
});
