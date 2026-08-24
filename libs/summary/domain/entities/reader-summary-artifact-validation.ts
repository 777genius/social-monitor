import { assertReaderSummaryScope } from "../value-objects/reader-summary-scope";
import { assertReaderSummaryPeriod } from "../value-objects/reader-summary-period";
import type { ReaderSummaryArtifactProps } from "./reader-summary-artifact";
import type { ReaderSummaryCitation } from "./citation";
import { assertReaderSummaryContent } from "./reader-summary-content-validation";
import { ReaderSummaryRelatedTopicRelation } from "../value-objects/reader-summary-related-topic-relation";
import type { RelatedTopicRelation, StoryCluster } from "../value-objects/summary-evidence-item";
import { sameProviderMetrics } from "./reader-summary-artifact-validation-values";
import { assertReaderSummaryPromotionAttestations } from
  "./reader-summary-promotion-attestation-validation";
export const assertReaderSummaryArtifactValid = (
  props: ReaderSummaryArtifactProps,
): void => {
  if (props.schemaVersion !== "reader_summary.artifact.v1") {
    throw new Error("Unsupported reader summary schema version");
  }
  if (props.readerSummaryId.trim().length === 0) {
    throw new Error("Reader summary id must be non-empty");
  }

  assertReaderSummaryScope(props.scope);
  assertReaderSummaryPeriod(props.period);
  if (
    props.generatedAt !== undefined &&
    Number.isNaN(props.generatedAt.getTime())
  ) {
    throw new Error("Reader summary generation date must be valid");
  }
  if (
    (props.userId ?? "").trim().length === 0 &&
    props.subscriptionId !== undefined
  ) {
    throw new Error("Subscription-scoped reader summary must include user id");
  }
  if (
    props.sourceWindow.endedAt.getTime() <=
    props.sourceWindow.startedAt.getTime()
  ) {
    throw new Error("Reader summary source window end must be after start");
  }

  if (
    props.sourceWindow.startedAt.getTime() < props.period.startedAt.getTime() ||
    props.sourceWindow.endedAt.getTime() > props.period.endedAt.getTime()
  ) {
    throw new Error("Reader summary source window must stay inside period");
  }

  const clusterIds = new Set(props.storyClusters.map((cluster) => cluster.id));
  const sourceWindowClusterIds = new Set(props.sourceWindow.storyClusterIds);
  if (
    clusterIds.size !== props.storyClusters.length ||
    sourceWindowClusterIds.size !== props.sourceWindow.storyClusterIds.length ||
    props.sourceWindow.storyClusterIds.length !== props.storyClusters.length ||
    [...clusterIds].some((clusterId) => !sourceWindowClusterIds.has(clusterId))
  ) {
    throw new Error(
      "Reader summary source window must reference every story cluster",
    );
  }

  const citationById = assertCitations(props.citationMap);
  const citationIds = new Set(citationById.keys());
  assertReaderSummaryPromotionAttestations(props, props.promotionAttestations ?? []);

  for (const cluster of props.storyClusters) {
    if (
      cluster.id.trim().length === 0 ||
      cluster.representativeFeedItemId.trim().length === 0
    ) {
      throw new Error("Reader summary story cluster ids must be non-empty");
    }

    if (cluster.interestIds.length === 0 || cluster.providerKeys.length === 0) {
      throw new Error(
        "Reader summary story clusters must include interest and provider coverage",
      );
    }
  }
  const relatedRelations = assertRelatedTopicRelations(
    props.relatedTopicRelations ?? [],
    props.storyClusters,
    new Set(props.sourceWindow.selectedFeedItemIds),
    citationById,
  );

  for (const story of props.topStories) {
    assertClusterReference(
      story.storyClusterId,
      clusterIds,
      "Reader summary top story",
    );
    assertCitedSection(
      story.title,
      story.summary,
      story.citationIds,
      citationIds,
      "Reader summary top story",
    );
  }

  for (const highlight of props.interestHighlights) {
    if (highlight.interestId.trim().length === 0) {
      throw new Error(
        "Reader summary interest highlight interest id must be non-empty",
      );
    }
    assertCitedSection(
      highlight.title,
      highlight.summary,
      highlight.citationIds,
      citationIds,
      "Reader summary interest highlight",
    );
  }

  for (const signal of props.repeatedSignals) {
    assertClusterReference(
      signal.storyClusterId,
      clusterIds,
      "Reader summary repeated signal",
    );
    assertCitedSection(
      signal.title,
      signal.title,
      signal.citationIds,
      citationIds,
      "Reader summary repeated signal",
    );
    if (signal.interestIds.length < 2) {
      throw new Error(
        "Reader summary repeated signal must cover at least two interests",
      );
    }
  }

  for (const risk of props.risksAndUnknowns) {
    for (const citationId of risk.citationIds ?? []) {
      if (!citationIds.has(citationId)) {
        throw new Error(
          "Reader summary risk cites evidence outside citation map",
        );
      }
    }
  }

  if (props.content !== undefined) {
    assertReaderSummaryContent(
      props.content,
      citationIds,
      citationById,
      providerKeysFromStoryClusters(props.storyClusters),
      clusterIds,
      props.storyClusters,
    );
    assertRelatedTopicCards(
      [
        ...props.content.topReads,
        ...(props.content.selectedPosts ?? []),
        ...props.content.interestSections.flatMap((section) => section.items),
      ],
      relatedRelations,
      citationById,
    );
  } else if (relatedRelations.size > 0) {
    throw new Error("Related topic relations require reader summary content");
  }

  for (const contextArtifact of props.contextArtifacts) {
    if (
      contextArtifact.artifactId.trim().length === 0 ||
      contextArtifact.summaryText.trim().length === 0
    ) {
      throw new Error(
        "Reader summary context artifact must include id and summary text",
      );
    }
    assertReaderSummaryScope(contextArtifact.scope);
    assertReaderSummaryPeriod(contextArtifact.period);
  }

  if (
    props.topStories.length === 0 &&
    !props.qualityFlags.includes("no_signal")
  ) {
    throw new Error(
      "No-signal reader summary must include no_signal quality flag",
    );
  }

  if (
    props.qualityFlags.includes("no_signal") &&
    (props.noSignalReason ?? "").trim().length === 0
  ) {
    throw new Error("No-signal reader summary must include a reason");
  }

  const hasCompleteTokenUsage =
    Number.isSafeInteger(props.usage.inputTokens) &&
    (props.usage.inputTokens as number) >= 0 &&
    Number.isSafeInteger(props.usage.outputTokens) &&
    (props.usage.outputTokens as number) >= 0;
  const hasHistoricalIncompleteTokenUsage =
    props.usage.inputTokens === null && props.usage.outputTokens === null;
  if (
    (!hasCompleteTokenUsage && !hasHistoricalIncompleteTokenUsage) ||
    !Number.isFinite(props.usage.estimatedCostUsd) ||
    props.usage.estimatedCostUsd < 0
  ) {
    throw new Error(
      "Reader summary token usage must be paired non-negative integers or null",
    );
  }

  if (props.confidence.score < 0 || props.confidence.score > 1) {
    throw new Error("Reader summary confidence score must be between 0 and 1");
  }

  if (
    props.confidence.level === "none" &&
    !props.qualityFlags.includes("no_signal")
  ) {
    throw new Error(
      "No-confidence reader summary must include no_signal quality flag",
    );
  }

  if (props.confidence.rationale.trim().length === 0) {
    throw new Error("Reader summary confidence rationale must be non-empty");
  }
};

const assertRelatedTopicRelations = (
  relations: readonly RelatedTopicRelation[],
  clusters: readonly StoryCluster[],
  selectedFeedItemIds: ReadonlySet<string>,
  citations: ReadonlyMap<string, ReaderSummaryCitation>,
): ReadonlyMap<string, RelatedTopicRelation> => {
  const clusterByFeedItemId = new Map<string, string>();
  const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  for (const cluster of clusters) {
    for (const feedItemId of [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]) {
      if (clusterByFeedItemId.has(feedItemId)) {
        throw new Error("Related topic evidence must belong to exactly one cluster");
      }
      clusterByFeedItemId.set(feedItemId, cluster.id);
    }
  }
  const byId = new Map<string, RelatedTopicRelation>();
  for (const raw of relations) {
    const relation = ReaderSummaryRelatedTopicRelation.rehydrate(raw).toSnapshot();
    if (
      clusterByFeedItemId.get(relation.subjectFeedItemId) !==
        relation.subjectStoryClusterId ||
      clusterByFeedItemId.get(relation.officialAnchorFeedItemId) !==
        relation.targetStoryClusterId ||
      !selectedFeedItemIds.has(relation.subjectFeedItemId) ||
      !selectedFeedItemIds.has(relation.officialAnchorFeedItemId) ||
      !clusterHasProvider(
        clusterById.get(relation.subjectStoryClusterId),
        relation.subjectProviderKey,
      ) ||
      !clusterHasProvider(
        clusterById.get(relation.targetStoryClusterId),
        relation.officialAnchorProviderKey,
      ) ||
      ![...citations.values()].some((citation) =>
        citation.feedItemId === relation.officialAnchorFeedItemId &&
        citation.sourceItemId === relation.officialAnchorSourceItemId &&
        citation.providerKey.trim().toLocaleLowerCase("en-US") ===
          relation.officialAnchorProviderKey)
    ) {
      throw new Error("Related topic relation evidence is outside its cluster");
    }
    if (byId.has(relation.relationId)) {
      throw new Error("Related topic relation ids must be globally unique");
    }
    byId.set(relation.relationId, relation);
  }
  return byId;
};

const clusterHasProvider = (
  cluster: StoryCluster | undefined,
  providerKey: string,
): boolean => cluster?.providerKeys.some(
  (candidate) =>
    candidate.trim().toLocaleLowerCase("en-US") === providerKey,
) ?? false;

const assertRelatedTopicCards = (
  cards: readonly {
    readonly cardKind?: string;
    readonly relationId?: string;
    readonly storyClusterId?: string;
    readonly targetStoryClusterId?: string;
    readonly providerKey: string;
    readonly confirmedProviderKeys: readonly string[];
    readonly providerMetrics: readonly {
      readonly label: string;
      readonly value: string;
    }[];
    readonly canonicalUrl?: string;
    readonly citationIds: readonly string[];
  }[],
  relations: ReadonlyMap<string, RelatedTopicRelation>,
  citations: ReadonlyMap<string, ReaderSummaryCitation>,
): void => {
  const seen = new Set<string>();
  for (const card of cards) {
    if (card.cardKind !== "related_topic") continue;
    const relation = card.relationId === undefined
      ? undefined
      : relations.get(card.relationId);
    if (
      relation === undefined ||
      seen.has(relation.relationId) ||
      card.storyClusterId !== relation.subjectStoryClusterId ||
      card.targetStoryClusterId !== relation.targetStoryClusterId ||
      card.providerKey.trim().toLocaleLowerCase("en-US") !== relation.subjectProviderKey ||
      card.confirmedProviderKeys.length !== 1 ||
      card.confirmedProviderKeys[0]?.trim().toLocaleLowerCase("en-US") !==
        relation.subjectProviderKey ||
      card.canonicalUrl?.trim() !== relation.subjectCanonicalUrl ||
      !sameProviderMetrics(card.providerMetrics, relation.subjectProviderMetrics) ||
      card.citationIds.length !== 1
    ) {
      throw new Error("Reader summary related topic card has invalid relation authority");
    }
    const citation = citations.get(card.citationIds[0]!);
    if (
      citation === undefined ||
      citation.feedItemId !== relation.subjectFeedItemId ||
      citation.sourceItemId !== relation.subjectSourceItemId ||
      citation.providerKey.trim().toLocaleLowerCase("en-US") !==
        relation.subjectProviderKey ||
      (citation.canonicalUrl !== undefined &&
        card.canonicalUrl !== citation.canonicalUrl)
    ) {
      throw new Error("Reader summary related topic card must cite only its subject");
    }
    seen.add(relation.relationId);
  }
  if (seen.size !== relations.size) {
    throw new Error("Reader summary related topic relation was not materialized exactly once");
  }
};

const assertCitations = (
  citations: readonly ReaderSummaryCitation[],
): Map<string, ReaderSummaryCitation> => {
  const citationsById = new Map<string, ReaderSummaryCitation>();

  for (const citation of citations) {
    if (citation.citationId.trim().length === 0) {
      throw new Error("Reader summary citation id must be non-empty");
    }

    if (citation.feedItemId.trim().length === 0) {
      throw new Error("Reader summary citation feed item id must be non-empty");
    }

    if (citation.sourceItemId.trim().length === 0) {
      throw new Error(
        "Reader summary citation source item id must be non-empty",
      );
    }

    if (citation.providerKey.trim().length === 0) {
      throw new Error("Reader summary citation provider key must be non-empty");
    }

    if (citationsById.has(citation.citationId)) {
      throw new Error("Reader summary citation ids must be unique");
    }

    citationsById.set(citation.citationId, citation);
  }

  return citationsById;
};

const providerKeysFromStoryClusters = (
  storyClusters: readonly { readonly providerKeys: readonly string[] }[],
): ReadonlySet<string> =>
  new Set(storyClusters.flatMap((cluster) => cluster.providerKeys));

const assertCitedSection = (
  title: string,
  summary: string,
  citationIds: readonly string[],
  knownCitationIds: ReadonlySet<string>,
  label: string,
): void => {
  if (
    title.trim().length === 0 ||
    summary.trim().length === 0 ||
    citationIds.length === 0
  ) {
    throw new Error(`${label} must include title, summary and citations`);
  }

  for (const citationId of citationIds) {
    if (!knownCitationIds.has(citationId)) {
      throw new Error(`${label} cites evidence outside citation map`);
    }
  }
};

const assertClusterReference = (
  storyClusterId: string,
  knownClusterIds: ReadonlySet<string>,
  label: string,
): void => {
  if (!knownClusterIds.has(storyClusterId)) {
    throw new Error(`${label} references unknown story cluster`);
  }
};
