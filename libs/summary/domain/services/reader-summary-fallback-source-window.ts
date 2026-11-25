import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummarySourceWindow,
} from "../value-objects/summary-evidence-item";

export const fallbackReaderSummarySourceWindow = (
  selectedEvidence: readonly SummaryEvidenceItem[],
  storyClusters: readonly StoryCluster[],
): SummarySourceWindow => ({
  windowId: "reader-summary-input",
  startedAt:
    selectedEvidence
      .map((item) => item.observedAt)
      .sort((left, right) => left.getTime() - right.getTime())
      .at(0) ?? new Date(0),
  endedAt:
    selectedEvidence
      .map((item) => item.observedAt)
      .sort((left, right) => right.getTime() - left.getTime())
      .at(0) ?? new Date(0),
  selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
  storyClusterIds: storyClusters.map((cluster) => cluster.id),
});
