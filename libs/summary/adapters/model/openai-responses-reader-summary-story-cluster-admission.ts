import type { ReaderSummaryCitation, ReaderSummaryTopStory } from "../../domain";
import { clusterIdsFromCitations } from "./openai-responses-reader-summary-cluster-citations";

/**
 * Admit one model-proposed story identity against trusted cited feed-item
 * membership. Untrusted declarations cannot override conflicting evidence.
 * Citation completion, provider diversity and fallback belong to the caller.
 */
export const admitCitedStoryClusterId = (
  story: Pick<ReaderSummaryTopStory, "storyClusterId">,
  citationIds: readonly string[],
  knownClusterIds: ReadonlySet<string>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  clusterByFeedItemId: ReadonlyMap<string, string>,
): string | undefined => {
  const citedClusterIds = clusterIdsFromCitations(
    citationIds,
    citationById,
    clusterByFeedItemId,
  );
  if (citedClusterIds.length > 1) {
    return undefined;
  }

  const declaredClusterId = knownClusterIds.has(story.storyClusterId)
    ? story.storyClusterId
    : undefined;
  const citedClusterId = citedClusterIds[0];
  if (
    declaredClusterId !== undefined &&
    citedClusterId !== undefined &&
    declaredClusterId !== citedClusterId
  ) {
    return undefined;
  }

  const storyClusterId = declaredClusterId ?? citedClusterId;
  if (storyClusterId === undefined) {
    return undefined;
  }
  return storyClusterId;
};
