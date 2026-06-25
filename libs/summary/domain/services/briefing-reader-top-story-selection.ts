import type {
  BriefingCitation,
  BriefingTopStory,
} from '../entities/briefing-artifact';
import type {
  BriefingEvidenceItem,
  StoryCluster,
} from '../value-objects/briefing-evidence-item';
import { compactUnique } from './briefing-reader-brief-support';

export const uniqueReaderTopStories = (
  stories: readonly BriefingTopStory[],
  citationById: ReadonlyMap<string, BriefingCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, BriefingEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
): readonly BriefingTopStory[] => {
  const seen = new Set<string>();
  const result: BriefingTopStory[] = [];

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
  story: BriefingTopStory,
  citationById: ReadonlyMap<string, BriefingCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, BriefingEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
): readonly string[] => {
  const cluster = clusterById.get(story.storyClusterId);
  const citationFeedItemIds = story.citationIds
    .map((citationId) => citationById.get(citationId)?.feedItemId)
    .filter((feedItemId): feedItemId is string => feedItemId !== undefined);
  const citationCanonicalUrls = citationFeedItemIds
    .map((feedItemId) => evidenceByFeedItemId.get(feedItemId)?.canonicalUrl)
    .filter((canonicalUrl): canonicalUrl is string => canonicalUrl !== undefined);

  return compactUnique([
    `cluster:${story.storyClusterId}`,
    cluster === undefined ? undefined : `story:${cluster.storyKey}`,
    ...citationFeedItemIds.map((feedItemId) => `feed:${feedItemId}`),
    ...citationCanonicalUrls.map((canonicalUrl) => `url:${canonicalUrl}`),
  ]);
};
