import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { compactUnique } from "../value-objects/summary-text";

export const selectUniqueTopReadCandidates = (
  stories: readonly TopReadCandidate[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
): readonly TopReadCandidate[] => {
  const seen = new Set<string>();
  const result: TopReadCandidate[] = [];

  for (const story of stories) {
    const keys = storyDeduplicationKeys(
      story,
      citationById,
      evidenceByFeedItemId,
      clusterById,
    );
    if (keys.some((key) => seen.has(key))) {
      continue;
    }
    for (const key of keys) {
      seen.add(key);
    }
    result.push(story);
  }

  return result;
};

const storyDeduplicationKeys = (
  story: TopReadCandidate,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
): readonly string[] => {
  const cluster = clusterById.get(story.storyClusterId);
  const citationFeedItemIds = story.citationIds
    .map((citationId) => citationById.get(citationId)?.feedItemId)
    .filter((feedItemId): feedItemId is string => feedItemId !== undefined);
  const citationCanonicalUrls = citationFeedItemIds
    .map((feedItemId) => evidenceByFeedItemId.get(feedItemId)?.canonicalUrl)
    .filter(
      (canonicalUrl): canonicalUrl is string => canonicalUrl !== undefined,
    );

  return compactUnique([
    `cluster:${story.storyClusterId}`,
    cluster === undefined ? undefined : `story:${cluster.storyKey}`,
    ...citationFeedItemIds.map((feedItemId) => `feed:${feedItemId}`),
    ...citationCanonicalUrls.map((canonicalUrl) => `url:${canonicalUrl}`),
  ]);
};
