import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { compactUnique } from "../value-objects/summary-text";
import { isTopReadEligibleEvidence } from "./top-read-eligibility-policy";

export const selectUniqueTopReadCandidates = (
  stories: readonly TopReadCandidate[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
): readonly TopReadCandidate[] => {
  const seen = new Set<string>();
  const result: TopReadCandidate[] = [];

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
    result.push(eligibleStory);
  }

  return diversifyByProviderCoverage(
    prioritizeSocialNewsStories(result, citationById, evidenceByFeedItemId),
    citationById,
    evidenceByFeedItemId,
  );
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
  const owner = match?.[1];
  const repo = match?.[2];

  return owner === undefined || repo === undefined
    ? undefined
    : `${owner.toLowerCase()}/${repo.toLowerCase()}`;
};

const diversifyByProviderCoverage = (
  stories: readonly TopReadCandidate[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): readonly TopReadCandidate[] => {
  const coveredProviderKeys = new Set<string>();
  const selected = new Set<TopReadCandidate>();
  const diversified: TopReadCandidate[] = [];

  for (const story of stories) {
    const providerKeys = storyProviderKeys(
      story,
      citationById,
      evidenceByFeedItemId,
    );
    if (
      diversified.length > 0 &&
      providerKeys.every((providerKey) => coveredProviderKeys.has(providerKey))
    ) {
      continue;
    }
    diversified.push(story);
    selected.add(story);
    for (const providerKey of providerKeys) {
      coveredProviderKeys.add(providerKey);
    }
  }

  for (const story of stories) {
    if (!selected.has(story)) {
      diversified.push(story);
    }
  }

  return diversified;
};

const prioritizeSocialNewsStories = (
  stories: readonly TopReadCandidate[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): readonly TopReadCandidate[] =>
  stories
    .map((story, index) => ({ story, index }))
    .sort((left, right) => {
      const leftPriority = storyProviderPriority(
        left.story,
        citationById,
        evidenceByFeedItemId,
      );
      const rightPriority = storyProviderPriority(
        right.story,
        citationById,
        evidenceByFeedItemId,
      );
      if (leftPriority.hasProviderMetrics && rightPriority.hasProviderMetrics) {
        const metricCoverageDiff =
          rightPriority.providerFamilyCount - leftPriority.providerFamilyCount;

        if (metricCoverageDiff !== 0) {
          return metricCoverageDiff;
        }

        return left.index - right.index;
      }

      const priorityDiff = leftPriority.category - rightPriority.category;

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const providerCoverageDiff =
        rightPriority.providerFamilyCount - leftPriority.providerFamilyCount;

      if (providerCoverageDiff !== 0) {
        return providerCoverageDiff;
      }

      return left.index - right.index;
    })
    .map(({ story }) => story);

const storyProviderPriority = (
  story: TopReadCandidate,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): {
  readonly category: number;
  readonly providerFamilyCount: number;
  readonly hasProviderMetrics: boolean;
} => {
  const providerKeys = storyProviderKeys(
    story,
    citationById,
    evidenceByFeedItemId,
  );
  const providerFamilies = compactUnique(providerKeys.map(providerFamilyKey));
  const priorities = providerFamilies.map(providerFamilyPriority);
  const priority = Math.min(
    ...priorities,
    socialNewsProviderFamilyOrder.length,
  );
  const hasPrimarySocialFamily =
    providerFamilies.includes("x-twitter") ||
    providerFamilies.includes("reddit");
  const hasStrongCrossProviderSupport =
    providerFamilies.length > 1 &&
    (hasPrimarySocialFamily || providerFamilies.length >= 3);

  return {
    category: hasStrongCrossProviderSupport ? 0 : priority + 1,
    providerFamilyCount: providerFamilies.length,
    hasProviderMetrics: storyHasProviderMetrics(
      story,
      citationById,
      evidenceByFeedItemId,
    ),
  };
};

const socialNewsProviderFamilyOrder = [
  "x-twitter",
  "reddit",
  "hacker-news",
  "rss",
  "github",
] as const;

const providerFamilyPriority = (providerKey: string): number => {
  const family = providerFamilyKey(providerKey);
  const index = socialNewsProviderFamilyOrder.findIndex(
    (candidate) => candidate === family,
  );

  return index === -1 ? socialNewsProviderFamilyOrder.length : index;
};

const providerFamilyKey = (providerKey: string): string => {
  const normalized = providerKey.toLowerCase();

  if (normalized === "github" || normalized.startsWith("github-")) {
    return "github";
  }

  if (
    normalized === "x-twitter" ||
    normalized === "twitter" ||
    normalized === "x"
  ) {
    return "x-twitter";
  }

  if (normalized === "hacker-news" || normalized === "hn") {
    return "hacker-news";
  }

  return normalized;
};

const storyProviderKeys = (
  story: TopReadCandidate,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): readonly string[] => {
  const citations = story.citationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryCitation => citation !== undefined,
    );

  return compactUnique([
    ...story.providerKeys,
    ...citations.map((citation) => citation.providerKey),
    ...citations.map(
      (citation) => evidenceByFeedItemId.get(citation.feedItemId)?.providerKey,
    ),
    story.providerKeys[0] ?? "unknown",
  ]);
};

const storyHasProviderMetrics = (
  story: TopReadCandidate,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): boolean =>
  story.citationIds.some((citationId) => {
    const citation = citationById.get(citationId);
    if (citation === undefined) {
      return false;
    }
    return (
      (evidenceByFeedItemId.get(citation.feedItemId)?.providerMetricLabels
        ?.length ?? 0) > 0
    );
  });
