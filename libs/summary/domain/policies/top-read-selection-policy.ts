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
