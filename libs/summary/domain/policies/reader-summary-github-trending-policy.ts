import type {
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import type { ReaderSummaryCitation } from "../entities/citation";
import type { ReaderSummaryNarrativeSection } from "../entities/reader-summary-narrative-section";

export const githubTrendingProviderKey = "github-trending-page";
export const githubTrendingNarrativeSectionId = "github-trending";
export const minimumGitHubTrendingStarsGained = 1_000;
export const maxGitHubTrendingHighlights = 3;

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
): boolean =>
  item.providerKey.trim().toLocaleLowerCase("en-US") ===
  githubTrendingProviderKey;

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
): readonly SummaryEvidenceItem[] =>
  items
    .map((item) => ({ item, starsGained: githubTrendingStarsGained(item) }))
    .filter(
      (
        candidate,
      ): candidate is {
        readonly item: SummaryEvidenceItem;
        readonly starsGained: number;
      } =>
        isGitHubTrendingEvidence(candidate.item) &&
        candidate.starsGained !== undefined &&
        candidate.starsGained > minimumGitHubTrendingStarsGained &&
        candidate.item.contentQuality?.eligibleForSummary !== false,
    )
    .sort(
      (left, right) =>
        right.starsGained - left.starsGained ||
        right.item.score - left.item.score ||
        left.item.feedItemId.localeCompare(right.item.feedItemId),
    )
    .slice(0, maxGitHubTrendingHighlights)
    .map((candidate) => candidate.item);

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
  return (repositoryName ?? normalized).slice(0, 120);
};
