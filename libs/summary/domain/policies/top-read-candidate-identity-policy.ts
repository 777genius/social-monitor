import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { readerSummaryProviderIdentity } from "../value-objects/reader-summary-provider-identity";
import { compactUnique } from "../value-objects/summary-text";
import { firstPartyPublicationBurstKey } from "./reader-summary-source-authority-policy";
import { isTopReadEligibleEvidence } from "./top-read-eligibility-policy";

export const storyWithTopReadEligibleCitations = (
  story: TopReadCandidate,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
  citationByFeedItemId: ReadonlyMap<string, ReaderSummaryCitation>,
): TopReadCandidate | undefined => {
  const cluster = clusterById.get(story.storyClusterId);
  const eligibleClusterCitations = eligibleClusterCitationIds(
    cluster,
    citationByFeedItemId,
    evidenceByFeedItemId,
  );
  const citations = story.citationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryCitation => citation !== undefined,
    );

  if (citations.length === 0) {
    return eligibleClusterCitations.length === 0
      ? undefined
      : {
          ...story,
          providerKeys: eligibleProviderKeysForCitations(
            eligibleClusterCitations,
            evidenceByFeedItemId,
          ),
          citationIds: eligibleClusterCitations.map(
            (citation) => citation.citationId,
          ),
        };
  }

  const eligibleCitations = citations.filter((citation) =>
    isTopReadEligibleEvidence(evidenceByFeedItemId.get(citation.feedItemId)),
  );
  const eligibleCitationsWithClusterSupport = compactUniqueByCitationId([
    ...eligibleCitations,
    ...eligibleClusterCitations,
  ]);
  const eligibleCitationIds = eligibleCitationsWithClusterSupport.map(
    (citation) => citation.citationId,
  );
  const eligibleProviderKeys = eligibleProviderKeysForCitations(
    eligibleCitationsWithClusterSupport,
    evidenceByFeedItemId,
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

export const citationMapByFeedItemId = (
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReadonlyMap<string, ReaderSummaryCitation> =>
  new Map(
    [...citationById.values()].map(
      (citation) => [citation.feedItemId, citation] as const,
    ),
  );

export const clusterEvidenceCitationIds = (params: {
  readonly cluster: StoryCluster | undefined;
  readonly citationByFeedItemId: ReadonlyMap<string, ReaderSummaryCitation>;
  readonly evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>;
}): readonly string[] => {
  if (params.cluster === undefined) {
    return [];
  }

  return [
    params.cluster.representativeFeedItemId,
    ...params.cluster.duplicateFeedItemIds,
  ]
    .map((feedItemId) => ({
      citation: params.citationByFeedItemId.get(feedItemId),
      evidence: params.evidenceByFeedItemId.get(feedItemId),
    }))
    .filter(({ citation, evidence }) => {
      return citation !== undefined && isTopReadEligibleEvidence(evidence);
    })
    .map(({ citation }) => citation?.citationId)
    .filter((citationId): citationId is string => citationId !== undefined);
};

export const storyDeduplicationKeys = (
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
  const evidenceItems = compactUnique([
    ...citationFeedItemIds,
    ...(cluster === undefined
      ? []
      : [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds]),
  ])
    .map((feedItemId) => evidenceByFeedItemId.get(feedItemId))
    .filter((item): item is SummaryEvidenceItem => item !== undefined);
  const firstPartyBurstKeys = compactUnique(
    evidenceItems.map(firstPartyPublicationBurstKey),
  );
  const repositoryKeys = compactUnique([
    ...citationCanonicalUrls.map(githubRepositoryKeyFromUrl),
    githubRepositoryKeyFromTitle(story.title),
  ]);

  return compactUnique([
    `cluster:${story.storyClusterId}`,
    cluster === undefined ? undefined : `story:${cluster.storyKey}`,
    ...citationFeedItemIds.map((feedItemId) => `feed:${feedItemId}`),
    ...normalizedUrls.map((canonicalUrl) => `url:${canonicalUrl}`),
    ...firstPartyBurstKeys.map((key) => `first-party-burst:${key}`),
    ...repositoryKeys.map((repositoryKey) => `repo:${repositoryKey}`),
  ]);
};

const eligibleClusterCitationIds = (
  cluster: StoryCluster | undefined,
  citationByFeedItemId: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): readonly ReaderSummaryCitation[] => {
  if (cluster === undefined) {
    return [];
  }

  return [
    cluster.representativeFeedItemId,
    ...cluster.duplicateFeedItemIds,
  ].flatMap((feedItemId) => {
    const citation = citationByFeedItemId.get(feedItemId);
    const evidence = evidenceByFeedItemId.get(feedItemId);

    return citation !== undefined && isTopReadEligibleEvidence(evidence)
      ? [citation]
      : [];
  });
};

const compactUniqueByCitationId = (
  citations: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryCitation[] => {
  const seen = new Set<string>();
  const unique: ReaderSummaryCitation[] = [];

  for (const citation of citations) {
    if (seen.has(citation.citationId)) {
      continue;
    }
    seen.add(citation.citationId);
    unique.push(citation);
  }

  return unique;
};

const eligibleProviderKeysForCitations = (
  citations: readonly ReaderSummaryCitation[],
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): readonly string[] =>
  compactUnique(
    citations.flatMap((citation) => {
      const evidence = evidenceByFeedItemId.get(citation.feedItemId);

      return [
        readerProviderKeyForCitation(citation),
        evidence === undefined
          ? undefined
          : readerProviderKeyForEvidence(evidence),
      ];
    }),
  );

const readerProviderKeyForCitation = (
  citation: ReaderSummaryCitation,
): string =>
  readerSummaryProviderIdentity({
    providerKey: citation.providerKey,
    canonicalUrl: citation.canonicalUrl,
  }).providerKey;

const readerProviderKeyForEvidence = (evidence: SummaryEvidenceItem): string =>
  readerSummaryProviderIdentity({
    providerKey: evidence.providerKey,
    providerName: evidence.providerName,
    canonicalUrl: evidence.canonicalUrl,
  }).providerKey;

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
