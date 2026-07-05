import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { normalizeSignalScore } from "../value-objects/signal-score";
import { compactUnique } from "../value-objects/summary-text";
import { readerItemConfidence } from "../services/reader-summary-support";
import { isTopReadEligibleEvidence } from "./top-read-eligibility-policy";

export const selectUniqueTopReadCandidates = (
  stories: readonly TopReadCandidate[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
  limit = 10,
): readonly TopReadCandidate[] => {
  const seen = new Set<string>();
  const uniqueStories: TopReadCandidate[] = [];
  const normalizedLimit = normalizeLimit(limit);

  for (const story of stories) {
    const eligibleStory = storyWithTopReadEligibleCitations(
      story,
      citationById,
      evidenceByFeedItemId,
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

  return selectProviderBalancedTopReads(
    prioritizeStrongSocialEvidence(
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
    ),
    normalizedLimit,
  );
};

const primarySocialProviders = ["x-twitter", "reddit"] as const;
const strongSocialProviderKeys = new Set(["reddit", "x-twitter", "rss"]);

interface TopReadCandidateProfile {
  readonly providerKey: string;
  readonly signalScore: number;
  readonly confidenceLevel: "low" | "medium" | "high";
  readonly citationCount: number;
  readonly confirmedProviderCount: number;
}

const prioritizeStrongSocialEvidence = (
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

    const rightShouldLead =
      isWeakSingleSourceCandidate(leftProfile) &&
      isStrongSocialCandidateAboveWeak(rightProfile, leftProfile);
    const leftShouldLead =
      isWeakSingleSourceCandidate(rightProfile) &&
      isStrongSocialCandidateAboveWeak(leftProfile, rightProfile);

    if (rightShouldLead === leftShouldLead) {
      return 0;
    }

    return rightShouldLead ? 1 : -1;
  });
};

const topReadCandidateProfile = (
  story: TopReadCandidate,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
): TopReadCandidateProfile => {
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
  const evidence = clusterEvidence.length > 0 ? clusterEvidence : citedEvidence;
  const providerKey =
    citations[0]?.providerKey ??
    evidence[0]?.providerKey ??
    primaryProviderKey(story);
  const confirmedProviderCount = compactUnique([
    ...story.providerKeys,
    ...(cluster?.providerKeys ?? []),
    ...evidence.map((item) => item.providerKey),
    providerKey,
  ]).length;
  const evidenceCount = Math.max(
    evidence.length,
    cluster === undefined
      ? citedEvidence.length
      : 1 + cluster.duplicateFeedItemIds.length,
  );
  const signalScore = normalizeSignalScore(
    cluster?.score ?? Math.max(0, ...evidence.map((item) => item.score)),
  );

  return {
    providerKey,
    signalScore,
    confidenceLevel: readerItemConfidence({
      cluster,
      evidenceCount,
      confirmedProviderCount,
      signalScore,
    }).level,
    citationCount: citations.length,
    confirmedProviderCount,
  };
};

const isWeakSingleSourceCandidate = (
  profile: TopReadCandidateProfile,
): boolean =>
  profile.confidenceLevel === "low" &&
  profile.citationCount <= 1 &&
  profile.confirmedProviderCount <= 1;

const isStrongSocialCandidateAboveWeak = (
  candidate: TopReadCandidateProfile,
  weak: TopReadCandidateProfile,
): boolean =>
  strongSocialProviderKeys.has(candidate.providerKey) &&
  candidate.signalScore >= Math.max(1, weak.signalScore + 0.25) &&
  candidate.confidenceLevel !== "low" &&
  (candidate.citationCount > 1 || candidate.confirmedProviderCount > 1);

const selectProviderBalancedTopReads = (
  stories: readonly TopReadCandidate[],
  limit: number,
): readonly TopReadCandidate[] => {
  const normalizedLimit = normalizeLimit(limit);
  const selected: TopReadCandidate[] = [];
  const selectedIds = new Set<string>();
  const providerCounts = new Map<string, number>();
  const activeProviders = activeProviderKeys(stories);
  const providerCap = providerCapForLimit(normalizedLimit, activeProviders);
  const primaryMinimum = primaryMinimumForLimit(normalizedLimit);
  const requiredPrimaryCounts = new Map(
    primarySocialProviders
      .filter((providerKey) =>
        stories.some((story) => primaryProviderKey(story) === providerKey),
      )
      .map((providerKey) => [
        providerKey,
        Math.min(primaryMinimum, countStoriesForProvider(stories, providerKey)),
      ]),
  );

  const select = (story: TopReadCandidate): void => {
    if (
      selected.length >= normalizedLimit ||
      selectedIds.has(story.storyClusterId)
    ) {
      return;
    }
    selected.push(story);
    selectedIds.add(story.storyClusterId);
    const providerKey = primaryProviderKey(story);
    providerCounts.set(providerKey, (providerCounts.get(providerKey) ?? 0) + 1);
  };

  for (const story of stories) {
    const providerKey = primaryProviderKey(story);
    if ((providerCounts.get(providerKey) ?? 0) >= providerCap) {
      continue;
    }
    if (
      shouldReserveRemainingSlot({
        providerKey,
        selectedCount: selected.length,
        limit: normalizedLimit,
        providerCounts,
        requiredPrimaryCounts,
      })
    ) {
      continue;
    }
    select(story);
  }

  for (const story of stories) {
    select(story);
  }

  return selected;
};

const supplementTopReadCandidates = (params: {
  readonly stories: readonly TopReadCandidate[];
  readonly citationById: ReadonlyMap<string, ReaderSummaryCitation>;
  readonly evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>;
  readonly clusterById: ReadonlyMap<string, StoryCluster>;
  readonly limit: number;
}): readonly TopReadCandidate[] => {
  const primaryMinimum = primaryMinimumForLimit(params.limit);
  const targetMinimum = targetMinimumForLimit(params.limit);
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
  const citationByFeedItemId = new Map(
    [...params.citationById.values()].map(
      (citation) => [citation.feedItemId, citation] as const,
    ),
  );
  const clusters = [...params.clusterById.values()];
  const evidence = [...params.evidenceByFeedItemId.values()].sort(
    (left, right) =>
      right.score - left.score ||
      right.observedAt.getTime() - left.observedAt.getTime(),
  );

  for (const providerKey of primarySocialProviders) {
    while (countStoriesForProvider(result, providerKey) < primaryMinimum) {
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
  const cluster = clusterForEvidence(params.evidence.feedItemId, params.clusters);
  const storyClusterId = cluster?.id ?? `feed:${params.evidence.feedItemId}`;

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
    citationIds: [citation.citationId],
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
  params.usedCitationIds.add(citation.citationId);
  for (const key of deduplicationKeys) {
    params.usedDeduplicationKeys.add(key);
  }

  return true;
};

const countStoriesForProvider = (
  stories: readonly TopReadCandidate[],
  providerKey: string,
): number =>
  stories.filter((story) => primaryProviderKey(story) === providerKey).length;

const clusterForEvidence = (
  feedItemId: string,
  clusters: readonly StoryCluster[],
): StoryCluster | undefined =>
  clusters.find(
    (cluster) =>
      cluster.representativeFeedItemId === feedItemId ||
      cluster.duplicateFeedItemIds.includes(feedItemId),
  );

const normalizeLimit = (value: number): number => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    return 10;
  }

  return Math.min(value, 10);
};

const providerCapForLimit = (
  limit: number,
  activeProviders: readonly string[],
): number =>
  activeProviders.length <= 1
    ? limit
    : Math.max(primaryMinimumForLimit(limit), Math.floor(limit * 0.6));

const primaryMinimumForLimit = (limit: number): number => (limit >= 8 ? 2 : 1);

const targetMinimumForLimit = (limit: number): number => Math.min(limit, 8);

const primaryProviderKey = (story: TopReadCandidate): string =>
  story.providerKeys[0] ?? "unknown";

const activeProviderKeys = (
  stories: readonly TopReadCandidate[],
): readonly string[] => compactUnique(stories.map(primaryProviderKey));

const shouldReserveRemainingSlot = (params: {
  readonly providerKey: string;
  readonly selectedCount: number;
  readonly limit: number;
  readonly providerCounts: ReadonlyMap<string, number>;
  readonly requiredPrimaryCounts: ReadonlyMap<string, number>;
}): boolean => {
  const currentProviderRequired =
    params.requiredPrimaryCounts.get(params.providerKey) ?? 0;
  const currentProviderCount =
    params.providerCounts.get(params.providerKey) ?? 0;
  const helpsRequiredPrimary = currentProviderCount < currentProviderRequired;
  const missingAfterSelection = missingRequiredPrimaryCount({
    providerCounts: params.providerCounts,
    requiredPrimaryCounts: params.requiredPrimaryCounts,
    selectedProviderKey: params.providerKey,
  });
  const remainingSlotsAfterSelection = params.limit - params.selectedCount - 1;

  return !helpsRequiredPrimary && missingAfterSelection > remainingSlotsAfterSelection;
};

const missingRequiredPrimaryCount = (params: {
  readonly providerCounts: ReadonlyMap<string, number>;
  readonly requiredPrimaryCounts: ReadonlyMap<string, number>;
  readonly selectedProviderKey: string;
}): number => {
  let missing = 0;

  for (const [providerKey, required] of params.requiredPrimaryCounts.entries()) {
    const selected =
      (params.providerCounts.get(providerKey) ?? 0) +
      (providerKey === params.selectedProviderKey ? 1 : 0);
    missing += Math.max(0, required - selected);
  }

  return missing;
};

const storyWithTopReadEligibleCitations = (
  story: TopReadCandidate,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): TopReadCandidate | undefined => {
  const citations = story.citationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryCitation => citation !== undefined,
    );

  if (citations.length === 0) {
    return story;
  }

  const eligibleCitations = citations.filter((citation) =>
    isTopReadEligibleEvidence(evidenceByFeedItemId.get(citation.feedItemId)),
  );
  const eligibleCitationIds = eligibleCitations.map(
    (citation) => citation.citationId,
  );
  const eligibleProviderKeys = compactUnique(
    eligibleCitations.flatMap((citation) => [
      citation.providerKey,
      evidenceByFeedItemId.get(citation.feedItemId)?.providerKey,
    ]),
  );

  return eligibleCitationIds.length === 0
    ? undefined
    : {
        ...story,
        providerKeys:
          eligibleProviderKeys.length > 0
            ? eligibleProviderKeys
            : story.providerKeys,
        citationIds: eligibleCitationIds,
      };
};

const storyDeduplicationKeys = (
  story: TopReadCandidate,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
): readonly string[] => {
  const cluster = clusterById.get(story.storyClusterId);
  const citations = story.citationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryCitation => citation !== undefined,
    );
  const citationFeedItemIds = citations.map((citation) => citation.feedItemId);
  const citationCanonicalUrls = citationFeedItemIds
    .flatMap((feedItemId, index) => [
      citations[index]?.canonicalUrl,
      evidenceByFeedItemId.get(feedItemId)?.canonicalUrl,
    ])
    .filter((value): value is string => value !== undefined);
  const normalizedUrls = citationCanonicalUrls
    .map(normalizeCanonicalUrlKey)
    .filter((key): key is string => key !== undefined);
  const repositoryKeys = compactUnique([
    ...citationCanonicalUrls.map(githubRepositoryKeyFromUrl),
    githubRepositoryKeyFromTitle(story.title),
  ]);

  return compactUnique([
    `cluster:${story.storyClusterId}`,
    cluster === undefined ? undefined : `story:${cluster.storyKey}`,
    ...citationFeedItemIds.map((feedItemId) => `feed:${feedItemId}`),
    ...normalizedUrls.map((canonicalUrl) => `url:${canonicalUrl}`),
    ...repositoryKeys.map((repositoryKey) => `repo:${repositoryKey}`),
  ]);
};

const trackingParameterPrefixes = ["utm_"];
const trackingParameterNames = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
]);

const normalizeCanonicalUrlKey = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.protocol = parsed.protocol.toLowerCase();
    for (const parameter of [...parsed.searchParams.keys()]) {
      const normalized = parameter.toLowerCase();
      if (
        trackingParameterNames.has(normalized) ||
        (parsed.hostname === "github.com" && normalized === "ref") ||
        trackingParameterPrefixes.some((prefix) =>
          normalized.startsWith(prefix),
        )
      ) {
        parsed.searchParams.delete(parameter);
      }
    }
    parsed.pathname = normalizePathname(parsed.hostname, parsed.pathname);

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.toLowerCase();
  }
};

const normalizePathname = (hostname: string, pathname: string): string => {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return hostname === "github.com" ? normalized.toLowerCase() : normalized;
};

const githubRepositoryKeyFromUrl = (value: string): string | undefined => {
  try {
    const parsed = new URL(value.trim());
    if (parsed.hostname.toLowerCase() !== "github.com") {
      return undefined;
    }
    const [owner, repo] = parsed.pathname
      .split("/")
      .filter((segment) => segment.length > 0);
    return owner === undefined || repo === undefined
      ? undefined
      : `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  } catch {
    return undefined;
  }
};

const githubRepositoryKeyFromTitle = (value: string): string | undefined => {
  const match = value.trim().match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  return match?.[1] === undefined || match[2] === undefined
    ? undefined
    : `${match[1].toLowerCase()}/${match[2].toLowerCase()}`;
};
