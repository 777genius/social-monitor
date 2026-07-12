import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { compactUnique } from "../value-objects/summary-text";
import { compareRepresentativeEvidenceItems } from "./representative-evidence-selection-policy";
import {
  citationMapByFeedItemId,
  clusterEvidenceCitationIds,
  storyDeduplicationKeys,
  storyWithTopReadEligibleCitations,
} from "./top-read-candidate-identity-policy";
import { prioritizeTopReadCandidates } from "./top-read-candidate-order-policy";
import {
  countTopReadStoriesForProvider,
  normalizeTopReadLimit,
  primarySocialTopReadProviders,
} from "./top-read-provider-balance-policy";
import { topReadPrimaryMinimumForLimit } from "./top-read-provider-diversity-policy";
import { isTopReadEligibleEvidence } from "./top-read-eligibility-policy";

export const selectUniqueTopReadCandidatePool = (
  stories: readonly TopReadCandidate[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
  limit = 10,
): readonly TopReadCandidate[] => {
  const seen = new Set<string>();
  const uniqueStories: TopReadCandidate[] = [];
  const normalizedLimit = normalizeTopReadLimit(limit);
  const citationByFeedItemId = citationMapByFeedItemId(citationById);

  for (const story of stories) {
    const eligibleStory = storyWithTopReadEligibleCitations(
      story,
      citationById,
      evidenceByFeedItemId,
      clusterById,
      citationByFeedItemId,
    );
    if (eligibleStory === undefined) {
      continue;
    }

    const keys = storyDeduplicationKeys(
      eligibleStory,
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
    uniqueStories.push(eligibleStory);
  }

  return prioritizeTopReadCandidates(
    supplementTopReadCandidates({
      stories: uniqueStories,
      citationById,
      evidenceByFeedItemId,
      clusterById,
      limit: normalizedLimit,
    }),
    citationById,
    evidenceByFeedItemId,
    clusterById,
  );
};

const supplementTopReadCandidates = (params: {
  readonly stories: readonly TopReadCandidate[];
  readonly citationById: ReadonlyMap<string, ReaderSummaryCitation>;
  readonly evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>;
  readonly clusterById: ReadonlyMap<string, StoryCluster>;
  readonly limit: number;
}): readonly TopReadCandidate[] => {
  const primaryMinimum = topReadPrimaryMinimumForLimit(params.limit);
  const targetMinimum = Math.min(params.limit, 8);
  const result: TopReadCandidate[] = [...params.stories];
  const usedStoryClusterIds = new Set(
    result.map((story) => story.storyClusterId),
  );
  const usedCitationIds = new Set(result.flatMap((story) => story.citationIds));
  const usedDeduplicationKeys = new Set(
    result.flatMap((story) =>
      storyDeduplicationKeys(
        story,
        params.citationById,
        params.evidenceByFeedItemId,
        params.clusterById,
      ),
    ),
  );
  const citationByFeedItemId = citationMapByFeedItemId(params.citationById);
  const clusters = [...params.clusterById.values()];
  const evidence = [...params.evidenceByFeedItemId.values()].sort(
    compareRepresentativeEvidenceItems,
  );

  for (const providerKey of primarySocialTopReadProviders) {
    while (
      countTopReadStoriesForProvider(result, providerKey) < primaryMinimum
    ) {
      const candidate = evidence.find((item) => {
        const citation = citationByFeedItemId.get(item.feedItemId);
        const cluster = clusterForEvidence(item.feedItemId, clusters);

        return (
          item.providerKey === providerKey &&
          citation !== undefined &&
          !usedCitationIds.has(citation.citationId) &&
          (cluster === undefined || !usedStoryClusterIds.has(cluster.id)) &&
          isTopReadEligibleEvidence(item)
        );
      });

      if (candidate === undefined) {
        break;
      }

      if (
        !appendEvidenceCandidate({
          result,
          evidence: candidate,
          clusters,
          citationByFeedItemId,
          usedStoryClusterIds,
          usedCitationIds,
          usedDeduplicationKeys,
          citationById: params.citationById,
          evidenceByFeedItemId: params.evidenceByFeedItemId,
          clusterById: params.clusterById,
        })
      ) {
        break;
      }
    }
  }

  for (const providerKey of [
    "x-twitter",
    "reddit",
    "hacker-news",
    "rss",
  ] as const) {
    for (const candidate of evidence) {
      if (countTopReadStoriesForProvider(result, providerKey) >= 4) {
        break;
      }
      if (candidate.providerKey !== providerKey) {
        continue;
      }
      const candidateCluster = clusterForEvidence(
        candidate.feedItemId,
        clusters,
      );
      if (
        candidateCluster !== undefined &&
        candidateCluster.representativeFeedItemId !== candidate.feedItemId
      ) {
        continue;
      }
      appendEvidenceCandidate({
        result,
        evidence: candidate,
        clusters,
        citationByFeedItemId,
        usedStoryClusterIds,
        usedCitationIds,
        usedDeduplicationKeys,
        citationById: params.citationById,
        evidenceByFeedItemId: params.evidenceByFeedItemId,
        clusterById: params.clusterById,
      });
    }
  }

  for (const candidate of evidence) {
    if (result.length >= Math.max(params.limit * 4, targetMinimum)) {
      break;
    }

    appendEvidenceCandidate({
      result,
      evidence: candidate,
      clusters,
      citationByFeedItemId,
      usedStoryClusterIds,
      usedCitationIds,
      usedDeduplicationKeys,
      citationById: params.citationById,
      evidenceByFeedItemId: params.evidenceByFeedItemId,
      clusterById: params.clusterById,
    });
  }

  return result;
};

const appendEvidenceCandidate = (params: {
  readonly result: TopReadCandidate[];
  readonly evidence: SummaryEvidenceItem;
  readonly clusters: readonly StoryCluster[];
  readonly citationByFeedItemId: ReadonlyMap<string, ReaderSummaryCitation>;
  readonly usedStoryClusterIds: Set<string>;
  readonly usedCitationIds: Set<string>;
  readonly usedDeduplicationKeys: Set<string>;
  readonly citationById: ReadonlyMap<string, ReaderSummaryCitation>;
  readonly evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>;
  readonly clusterById: ReadonlyMap<string, StoryCluster>;
}): boolean => {
  const citation = params.citationByFeedItemId.get(params.evidence.feedItemId);
  const cluster = clusterForEvidence(
    params.evidence.feedItemId,
    params.clusters,
  );
  const storyClusterId = cluster?.id ?? `feed:${params.evidence.feedItemId}`;
  const citationIds = compactUnique([
    citation?.citationId,
    ...clusterEvidenceCitationIds({
      cluster,
      citationByFeedItemId: params.citationByFeedItemId,
      evidenceByFeedItemId: params.evidenceByFeedItemId,
    }),
  ]);

  if (
    citation === undefined ||
    params.usedCitationIds.has(citation.citationId) ||
    params.usedStoryClusterIds.has(storyClusterId) ||
    !isTopReadEligibleEvidence(params.evidence)
  ) {
    return false;
  }

  const story = {
    storyClusterId,
    title: params.evidence.title,
    summary:
      params.evidence.whyImportant.find((reason) => reason.trim().length > 0) ??
      "Selected to preserve primary source coverage.",
    interestIds: cluster?.interestIds ?? [params.evidence.interestId],
    providerKeys: compactUnique([
      params.evidence.providerKey,
      ...(cluster?.providerKeys ?? []),
    ]),
    citationIds,
  } satisfies TopReadCandidate;
  const deduplicationKeys = storyDeduplicationKeys(
    story,
    params.citationById,
    params.evidenceByFeedItemId,
    params.clusterById,
  );

  if (deduplicationKeys.some((key) => params.usedDeduplicationKeys.has(key))) {
    return false;
  }

  params.result.push(story);
  params.usedStoryClusterIds.add(storyClusterId);
  for (const citationId of citationIds) {
    params.usedCitationIds.add(citationId);
  }
  for (const key of deduplicationKeys) {
    params.usedDeduplicationKeys.add(key);
  }

  return true;
};

const clusterForEvidence = (
  feedItemId: string,
  clusters: readonly StoryCluster[],
): StoryCluster | undefined =>
  clusters.find(
    (cluster) =>
      cluster.representativeFeedItemId === feedItemId ||
      cluster.duplicateFeedItemIds.includes(feedItemId),
  );
