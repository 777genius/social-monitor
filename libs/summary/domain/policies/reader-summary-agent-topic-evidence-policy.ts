import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import { compareRepresentativeEvidenceItems } from "./representative-evidence-selection-policy";
import { STORY_RANKING_POLICY_V1 } from "./story-ranking-policy";
import { isTopReadEligibleEvidence } from "./top-read-eligibility-policy";
import { storyClusterSignal } from "../services/story-cluster-signal";
import { storyKey } from "../services/story-key-normalizer";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";

export const READER_SUMMARY_AGENT_TOPIC_RELEVANCE_SCORE_MIN = 0.56;

export type ReaderSummaryAgentTopicEvidence = {
  readonly clusters: readonly StoryCluster[];
  readonly selectedEvidence: readonly SummaryEvidenceItem[];
  readonly topStories: readonly TopReadCandidate[];
  readonly citationMap: readonly ReaderSummaryCitation[];
};

export const isReaderSummaryAgentTopicEvidenceEligible = (
  evidence: SummaryEvidenceItem,
): boolean => {
  const relevanceScore = evidence.contentQuality?.interestRelevanceScore;

  return (
    isTopReadEligibleEvidence(evidence) &&
    relevanceScore !== undefined &&
    Number.isFinite(relevanceScore) &&
    relevanceScore >= READER_SUMMARY_AGENT_TOPIC_RELEVANCE_SCORE_MIN
  );
};

export const buildReaderSummaryAgentTopicEvidence = (
  params: ReaderSummaryAgentTopicEvidence & {
    readonly requestedAt: Date;
  },
): ReaderSummaryAgentTopicEvidence => {
  const acceptedEvidence = params.selectedEvidence.filter(
    isReaderSummaryAgentTopicEvidenceEligible,
  );
  const acceptedById = new Map(
    acceptedEvidence.map((item) => [item.feedItemId, item] as const),
  );

  if (hasOnlyCurrentAcceptedTopicEvidence(params, acceptedById)) {
    return {
      clusters: params.clusters,
      selectedEvidence: params.selectedEvidence,
      topStories: params.topStories,
      citationMap: params.citationMap,
    };
  }

  const clusters = params.clusters.flatMap((cluster) => {
    const rebuilt = rebuildCluster(cluster, acceptedById, params.requestedAt);

    return rebuilt === undefined ? [] : [rebuilt];
  });
  const retainedFeedItemIds = new Set(
    clusters.flatMap((cluster) => [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]),
  );
  const selectedEvidence = acceptedEvidence.filter((item) =>
    retainedFeedItemIds.has(item.feedItemId),
  );
  const retainedEvidenceById = new Map(
    selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const citationMap = rebuildCitations(
    params.citationMap,
    retainedEvidenceById,
  );

  return {
    clusters,
    selectedEvidence,
    topStories: rebuildTopStories(
      params.topStories,
      clusters,
      citationMap,
      retainedEvidenceById,
    ),
    citationMap,
  };
};

const hasOnlyCurrentAcceptedTopicEvidence = (
  params: ReaderSummaryAgentTopicEvidence,
  acceptedById: ReadonlyMap<string, SummaryEvidenceItem>,
): boolean => {
  if (acceptedById.size !== params.selectedEvidence.length) {
    return false;
  }

  const clusterIds = new Set(params.clusters.map((cluster) => cluster.id));
  const citationIds = new Set(
    params.citationMap
      .filter((citation) => acceptedById.has(citation.feedItemId))
      .map((citation) => citation.citationId),
  );

  return (
    params.clusters.every((cluster) =>
      [
        cluster.representativeFeedItemId,
        ...cluster.duplicateFeedItemIds,
      ].every((feedItemId) => acceptedById.has(feedItemId)),
    ) &&
    params.citationMap.every((citation) => {
      const evidence = acceptedById.get(citation.feedItemId);

      return (
        evidence !== undefined &&
        hasMatchingCitationLineage(citation, evidence)
      );
    }) &&
    params.topStories.every(
      (story) =>
        clusterIds.has(story.storyClusterId) &&
        story.citationIds.every((citationId) => citationIds.has(citationId)),
    )
  );
};

const rebuildCluster = (
  cluster: StoryCluster,
  acceptedById: ReadonlyMap<string, SummaryEvidenceItem>,
  requestedAt: Date,
): StoryCluster | undefined => {
  const evidence = [
    cluster.representativeFeedItemId,
    ...cluster.duplicateFeedItemIds,
  ]
    .map((feedItemId) => acceptedById.get(feedItemId))
    .filter((item): item is SummaryEvidenceItem => item !== undefined)
    .sort(compareRepresentativeEvidenceItems);
  const representative = evidence[0];
  if (representative === undefined) {
    return undefined;
  }

  const observedAt = evidence.map((item) => item.observedAt.getTime());
  const signal = storyClusterSignal(
    evidence,
    requestedAt,
    STORY_RANKING_POLICY_V1,
  );

  return {
    id: cluster.id,
    storyKey: storyKey(representative, STORY_RANKING_POLICY_V1),
    rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
    representativeFeedItemId: representative.feedItemId,
    duplicateFeedItemIds: evidence.slice(1).map((item) => item.feedItemId),
    interestIds: uniqueSorted(evidence.map((item) => item.interestId)),
    providerKeys: uniqueSorted(evidence.map((item) => item.providerKey)),
    score: signal.score,
    signalBreakdown: signal.breakdown,
    observedAtRange: {
      startedAt: new Date(Math.min(...observedAt)),
      endedAt: new Date(Math.max(...observedAt) + 1),
    },
    whyImportant: uniqueStable([
      ...signal.reasons,
      ...evidence.flatMap((item) => item.whyImportant),
    ]),
  };
};

const rebuildCitations = (
  citations: readonly ReaderSummaryCitation[],
  acceptedById: ReadonlyMap<string, SummaryEvidenceItem>,
): readonly ReaderSummaryCitation[] =>
  citations.flatMap((citation) => {
    const evidence = acceptedById.get(citation.feedItemId);
    if (
      evidence === undefined ||
      !hasMatchingCitationLineage(citation, evidence)
    ) {
      return [];
    }

    return [citation];
  });

const hasMatchingCitationLineage = (
  citation: ReaderSummaryCitation,
  evidence: SummaryEvidenceItem,
): boolean =>
  citation.sourceItemId === evidence.sourceItemId &&
  citation.providerKey === evidence.providerKey &&
  (citation.canonicalUrl === undefined ||
    citation.canonicalUrl === evidence.canonicalUrl);

const rebuildTopStories = (
  stories: readonly TopReadCandidate[],
  clusters: readonly StoryCluster[],
  citations: readonly ReaderSummaryCitation[],
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
): readonly TopReadCandidate[] => {
  const clusterById = new Map(
    clusters.map((cluster) => [cluster.id, cluster] as const),
  );
  const citationIdsByFeedItemId = new Map<string, string[]>();
  for (const citation of citations) {
    citationIdsByFeedItemId.set(citation.feedItemId, [
      ...(citationIdsByFeedItemId.get(citation.feedItemId) ?? []),
      citation.citationId,
    ]);
  }

  return stories.flatMap((story) => {
    const cluster = clusterById.get(story.storyClusterId);
    if (cluster === undefined) {
      return [];
    }
    const representative = evidenceById.get(
      cluster.representativeFeedItemId,
    );
    if (representative === undefined) {
      return [];
    }
    const feedItemIds = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ];
    const representativeCitationIds = uniqueStable(
      feedItemIds.flatMap(
        (feedItemId) => citationIdsByFeedItemId.get(feedItemId) ?? [],
      ),
    );

    return [
      {
        storyClusterId: cluster.id,
        title: representative.title,
        summary:
          compactText(representative.bodyPreview) ??
          representative.whyImportant.find(
            (reason) => reason.trim().length > 0,
          ) ??
          representative.title,
        interestIds: cluster.interestIds,
        providerKeys: cluster.providerKeys,
        citationIds: representativeCitationIds,
      },
    ];
  });
};

const compactText = (value: string | undefined): string | undefined => {
  const compacted = value?.replace(/\s+/gu, " ").trim();

  return compacted === undefined || compacted.length === 0
    ? undefined
    : compacted;
};

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort();

const uniqueStable = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];
