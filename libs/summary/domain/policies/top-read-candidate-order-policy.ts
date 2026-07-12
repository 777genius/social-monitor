import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  buildReaderSummaryEditorialPriorityProfile,
  compareReaderSummaryEditorialPriority,
  type ReaderSummaryEditorialPriorityProfile,
} from "./reader-summary-editorial-priority-policy";
import { isTopReadEligibleEvidence } from "./top-read-eligibility-policy";

export const prioritizeTopReadCandidates = (
  stories: readonly TopReadCandidate[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
): readonly TopReadCandidate[] => {
  const profiles = new Map(
    stories.map(
      (story) =>
        [
          story.storyClusterId,
          topReadCandidateProfile(
            story,
            citationById,
            evidenceByFeedItemId,
            clusterById,
          ),
        ] as const,
    ),
  );

  return [...stories].sort((left, right) => {
    const leftProfile = profiles.get(left.storyClusterId);
    const rightProfile = profiles.get(right.storyClusterId);

    if (leftProfile === undefined || rightProfile === undefined) {
      return 0;
    }

    return compareReaderSummaryEditorialPriority(leftProfile, rightProfile);
  });
};

export const topReadProviderKeyByStoryId = (
  stories: readonly TopReadCandidate[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
): ReadonlyMap<string, string> =>
  new Map(
    stories.map(
      (story) =>
        [
          story.storyClusterId,
          topReadCandidateProfile(
            story,
            citationById,
            evidenceByFeedItemId,
            clusterById,
          ).providerKey,
        ] as const,
    ),
  );

const topReadCandidateProfile = (
  story: TopReadCandidate,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
): ReaderSummaryEditorialPriorityProfile => {
  const cluster = clusterById.get(story.storyClusterId);
  const citations = story.citationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryCitation => citation !== undefined,
    );
  const citedEvidence = citations
    .map((citation) => evidenceByFeedItemId.get(citation.feedItemId))
    .filter((item): item is SummaryEvidenceItem => item !== undefined);
  const clusterEvidence =
    cluster === undefined
      ? citedEvidence
      : [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds]
          .map((feedItemId) => evidenceByFeedItemId.get(feedItemId))
          .filter((item): item is SummaryEvidenceItem => item !== undefined);
  const eligibleClusterEvidence = clusterEvidence.filter(
    isTopReadEligibleEvidence,
  );
  const evidence =
    eligibleClusterEvidence.length > 0
      ? eligibleClusterEvidence
      : citedEvidence.filter(isTopReadEligibleEvidence);

  return buildReaderSummaryEditorialPriorityProfile({
    story,
    cluster,
    evidence,
    citationCount: citations.length,
  });
};
