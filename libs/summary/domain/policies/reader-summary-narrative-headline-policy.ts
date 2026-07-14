import type { ReaderSummaryCitation } from "../entities/citation";
import type { ReaderSummaryNarrativeSection } from "../entities/reader-summary-narrative-section";
import type { TopRead } from "../entities/top-read";
import { independentEvidenceProviderKeys } from "../value-objects/reader-summary-provider-identity";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";

export const readerHeadlineForNarrativeLead = (
  storyTitle: string,
  topRead: TopRead,
): string => {
  if (
    topRead.confirmedProviderKeys.length > 1 ||
    topRead.confidence.level !== "low"
  ) {
    return storyTitle;
  }
  const providerName = `${topRead.providerName.charAt(0).toLocaleUpperCase("en-US")}${topRead.providerName.slice(1)}`;
  const normalizedStoryTitle = storyTitle.toLocaleLowerCase("en-US");
  const normalizedProviderName = providerName.toLocaleLowerCase("en-US");
  if (
    normalizedStoryTitle === normalizedProviderName ||
    normalizedStoryTitle.startsWith(`${normalizedProviderName} `) ||
    normalizedStoryTitle.startsWith(`${normalizedProviderName}:`)
  ) {
    return storyTitle;
  }

  return `${providerName} discussion: ${storyTitle}`;
};

export const buildThematicSynthesisSupport = (params: {
  readonly section: ReaderSummaryNarrativeSection;
  readonly citations: ReadonlyMap<string, ReaderSummaryCitation>;
  readonly evidence: ReadonlyMap<string, SummaryEvidenceItem>;
  readonly clusters: readonly StoryCluster[];
}): { readonly clusterCount: number; readonly providerCount: number } => {
  const clusterIdByFeedItemId = new Map(
    params.clusters.flatMap((cluster) =>
      [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds].map(
        (feedItemId) => [feedItemId, cluster.id] as const,
      ),
    ),
  );
  const citedEvidence = params.section.citationIds.flatMap((citationId) => {
    const feedItemId = params.citations.get(citationId)?.feedItemId;
    const evidence =
      feedItemId === undefined ? undefined : params.evidence.get(feedItemId);

    return evidence === undefined ? [] : [evidence];
  });
  const clusterCount = new Set(
    citedEvidence.flatMap((evidence) => {
      const clusterId = clusterIdByFeedItemId.get(evidence.feedItemId);

      return clusterId === undefined ? [] : [clusterId];
    }),
  ).size;

  return {
    clusterCount,
    providerCount: independentEvidenceProviderKeys(citedEvidence).length,
  };
};
