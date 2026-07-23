import type {
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import type { ReaderSummaryCitation } from "../entities/citation";
import type { ReaderSummaryNarrativeSection } from "../entities/reader-summary-narrative-section";
import {
  githubTrendingProviderKey,
  isGitHubTrendingProvider,
} from "../value-objects/reader-summary-provider-identity";
import { normalizedGitHubRepositoryIdentity } from "../value-objects/github-repository-identity";

export { githubTrendingProviderKey };
export const githubTrendingNarrativeSectionId = "github-trending";
export const minimumGitHubTrendingStarsGained = 1_000;
export const maxGitHubTrendingHighlights = 3;
export const maxGitHubTrendingDisplayRepositories = 10;

export const withGitHubTrendingNarrativeAppendix = (params: {
  readonly narrativeSections: readonly ReaderSummaryNarrativeSection[];
  readonly appendix: ReaderSummaryNarrativeSection | undefined;
}): readonly ReaderSummaryNarrativeSection[] => [
  ...params.narrativeSections.filter(
    (section) => section.id !== githubTrendingNarrativeSectionId,
  ),
  ...(params.appendix === undefined ? [] : [params.appendix]),
];

export const isGitHubTrendingEvidence = (
  item: Pick<SummaryEvidenceItem, "providerKey">,
): boolean => isGitHubTrendingProvider(item);

export const primaryReaderSummaryEvidence = (
  selection: SummaryEvidenceSelection,
): SummaryEvidenceSelection => {
  const selectedEvidence = selection.selectedEvidence.filter(
    (item) => !isGitHubTrendingEvidence(item),
  );
  const selectedFeedItemIds = new Set(
    selectedEvidence.map((item) => item.feedItemId),
  );
  const evidenceById = new Map(
    selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const clusters = selection.clusters.flatMap((cluster) => {
    const feedItemIds = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ].filter((feedItemId) => selectedFeedItemIds.has(feedItemId));
    const representativeFeedItemId = feedItemIds[0];
    if (representativeFeedItemId === undefined) {
      return [];
    }
    const evidence = feedItemIds.flatMap((feedItemId) => {
      const item = evidenceById.get(feedItemId);
      return item === undefined ? [] : [item];
    });

    return [
      {
        ...cluster,
        representativeFeedItemId,
        duplicateFeedItemIds: feedItemIds.slice(1),
        interestIds: [...new Set(evidence.map((item) => item.interestId))],
        providerKeys: [...new Set(evidence.map((item) => item.providerKey))],
        whyImportant: [
          ...new Set(evidence.flatMap((item) => item.whyImportant)),
        ],
      },
    ];
  });
  const storyClusterIds = new Set(clusters.map((cluster) => cluster.id));

  return {
    ...selection,
    clusters,
    selectedEvidence,
    sourceWindow: {
      ...selection.sourceWindow,
      selectedFeedItemIds: selection.sourceWindow.selectedFeedItemIds.filter(
        (feedItemId) => selectedFeedItemIds.has(feedItemId),
      ),
      storyClusterIds: selection.sourceWindow.storyClusterIds.filter(
        (storyClusterId) => storyClusterIds.has(storyClusterId),
      ),
    },
  };
};

export const selectGitHubTrendingHighlights = (
  items: readonly SummaryEvidenceItem[],
): readonly SummaryEvidenceItem[] => {
  const candidates = items
    .map((item) => ({
      item,
      repositoryIdentity: normalizedGitHubRepositoryIdentity(
        item.canonicalUrl,
      ),
      rank: githubTrendingRank(item),
      starsGained: githubTrendingStarsGained(item),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        readonly item: SummaryEvidenceItem;
        readonly repositoryIdentity: string;
        readonly rank: number;
        readonly starsGained: number;
      } =>
        isGitHubTrendingEvidence(candidate.item) &&
        candidate.repositoryIdentity !== undefined &&
        candidate.rank !== undefined &&
        candidate.rank > maxGitHubTrendingDisplayRepositories &&
        candidate.starsGained !== undefined &&
        candidate.starsGained > minimumGitHubTrendingStarsGained &&
        candidate.item.contentQuality?.eligibleForSummary !== false,
    );
  const strongestByRepository = new Map<
    string,
    (typeof candidates)[number]
  >();
  for (const candidate of candidates) {
    const current = strongestByRepository.get(candidate.repositoryIdentity);
    if (
      current === undefined ||
      compareGitHubTrendingHighlightCandidates(candidate, current) < 0
    ) {
      strongestByRepository.set(candidate.repositoryIdentity, candidate);
    }
  }

  return [...strongestByRepository.values()]
    .sort(compareGitHubTrendingHighlightCandidates)
    .slice(0, maxGitHubTrendingHighlights)
    .map((candidate) => candidate.item);
};

export const selectGitHubTrendingDisplayRepositories = (
  items: readonly SummaryEvidenceItem[],
): readonly SummaryEvidenceItem[] => {
  const candidates = items
    .map((item) => ({ item, rank: githubTrendingRank(item) }))
    .filter(
      (
        candidate,
      ): candidate is {
        readonly item: SummaryEvidenceItem;
        readonly rank: number;
      } =>
        isGitHubTrendingEvidence(candidate.item) &&
        candidate.rank !== undefined &&
        candidate.rank <= maxGitHubTrendingDisplayRepositories,
    )
    .sort(
      (left, right) =>
        right.item.observedAt.getTime() - left.item.observedAt.getTime() ||
        left.rank - right.rank ||
        left.item.feedItemId.localeCompare(right.item.feedItemId),
    );
  const byRepository = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const key =
      normalizedGitHubRepositoryIdentity(candidate.item.canonicalUrl) ??
      candidate.item.canonicalUrl.trim().toLocaleLowerCase("en-US");
    if (!byRepository.has(key)) {
      byRepository.set(key, candidate);
    }
  }
  const byRank = new Map<number, (typeof candidates)[number][]>();
  for (const candidate of byRepository.values()) {
    const sameRank = byRank.get(candidate.rank) ?? [];
    sameRank.push(candidate);
    byRank.set(candidate.rank, sameRank);
  }

  return [...byRank.values()]
    .map(
      (sameRank) =>
        [...sameRank].sort(
          (left, right) =>
            (githubTrendingStarsGained(right.item) ?? -1) -
              (githubTrendingStarsGained(left.item) ?? -1) ||
            right.item.score - left.item.score ||
            right.item.observedAt.getTime() - left.item.observedAt.getTime() ||
            left.item.feedItemId.localeCompare(right.item.feedItemId),
        )[0],
    )
    .filter(
      (candidate): candidate is (typeof candidates)[number] =>
        candidate !== undefined,
    )
    .sort((left, right) => left.rank - right.rank)
    .slice(0, maxGitHubTrendingDisplayRepositories)
    .map((candidate) => candidate.item);
};

const compareGitHubTrendingHighlightCandidates = (
  left: {
    readonly item: SummaryEvidenceItem;
    readonly repositoryIdentity: string;
    readonly starsGained: number;
  },
  right: {
    readonly item: SummaryEvidenceItem;
    readonly repositoryIdentity: string;
    readonly starsGained: number;
  },
): number =>
  right.starsGained - left.starsGained ||
  right.item.observedAt.getTime() - left.item.observedAt.getTime() ||
  right.item.score - left.item.score ||
  left.repositoryIdentity.localeCompare(right.repositoryIdentity) ||
  left.item.feedItemId.localeCompare(right.item.feedItemId);

export const selectGitHubTrendingSupplementalEvidence = (
  items: readonly SummaryEvidenceItem[],
): readonly SummaryEvidenceItem[] => {
  const displayRepositories = selectGitHubTrendingDisplayRepositories(items);
  const displayIds = new Set(
    displayRepositories.map((item) => item.feedItemId),
  );

  return [
    ...displayRepositories,
    ...selectGitHubTrendingHighlights(items).filter(
      (item) => !displayIds.has(item.feedItemId),
    ),
  ];
};

export const githubTrendingStarsGained = (
  item: Pick<SummaryEvidenceItem, "providerMetricLabels">,
): number | undefined => {
  const metric = item.providerMetricLabels?.find(
    (candidate) =>
      candidate.label.toLocaleLowerCase("en-US") === "github trending today",
  );
  const match = metric?.value.match(/\+([\d,]+)\s+stars\b/iu);
  if (match === null || match === undefined) {
    return undefined;
  }

  const value = Number(match[1]?.replaceAll(",", ""));
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

export const githubTrendingRank = (
  item: Pick<SummaryEvidenceItem, "providerMetricLabels">,
): number | undefined => {
  const metric = item.providerMetricLabels?.find(
    (candidate) =>
      candidate.label.toLocaleLowerCase("en-US") === "github trending today",
  );
  const match = metric?.value.match(/#([\d,]+)\b/u);
  if (match === null || match === undefined) {
    return undefined;
  }

  const value = Number(match[1]?.replaceAll(",", ""));
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
};

export const buildGitHubTrendingNarrativeAppendix = (params: {
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly citations: readonly ReaderSummaryCitation[];
}): ReaderSummaryNarrativeSection | undefined => {
  const highlights = selectGitHubTrendingHighlights(params.evidence);
  const citationByFeedItemId = new Map(
    params.citations.map(
      (citation) => [citation.feedItemId, citation] as const,
    ),
  );
  const citedHighlights = highlights.flatMap((item) => {
    const citation = citationByFeedItemId.get(item.feedItemId);
    const starsGained = githubTrendingStarsGained(item);
    return citation === undefined || starsGained === undefined
      ? []
      : [{ item, citation, starsGained }];
  });
  if (citedHighlights.length === 0) {
    return undefined;
  }

  return {
    id: githubTrendingNarrativeSectionId,
    kind: "watch",
    title: "GitHub Trending",
    text: citedHighlights
      .map(
        ({ item, starsGained }) =>
          `- **${compactRepositoryTitle(item.title)}**: +${starsGained.toLocaleString("en-US")} stars today.`,
      )
      .join("\n"),
    citationIds: citedHighlights.map(({ citation }) => citation.citationId),
  };
};

export const isSupplementalTrendEvidence = isGitHubTrendingEvidence;
export const withoutSupplementalTrendNarrativeSections = (
  sections: readonly ReaderSummaryNarrativeSection[],
  citations: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryNarrativeSection[] => {
  const supplementalCitationIds = new Set(
    citations
      .filter((citation) =>
        isSupplementalTrendEvidence({ providerKey: citation.providerKey }),
      )
      .map((citation) => citation.citationId),
  );
  return sections.filter(
    (section) =>
      !section.citationIds.some((citationId) =>
        supplementalCitationIds.has(citationId),
      ),
  );
};
export const selectSupplementalTrendHighlights = selectGitHubTrendingHighlights;
export const buildSupplementalTrendNarrativeAppendix =
  buildGitHubTrendingNarrativeAppendix;
export const withSupplementalTrendNarrativeAppendix =
  withGitHubTrendingNarrativeAppendix;

const compactRepositoryTitle = (title: string): string => {
  const normalized = title
    .replace(/[*_`[\]<>]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const repositoryName = normalized.split(/\s+[—-]\s+/u)[0]?.trim();
  return (repositoryName ?? normalized)
    .replace(/\s+is\s+#\d+\s+on\s+GitHub\s+Trending\s*$/iu, "")
    .slice(0, 120);
};
