import {
  emptyReaderSummaryTopicMap,
  type ReaderSummaryTopicMap,
  type ReaderSummaryTopicMapNode,
} from "../entities/reader-summary-topic-map";
import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import {
  applyReaderSummaryTopicMapGroupingPolicy,
  READER_SUMMARY_TOPIC_MAP_MAX_NODES,
} from "../policies/reader-summary-topic-map-grouping-policy";
import { STORY_RANKING_POLICY_V1 } from "../policies/story-ranking-policy";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { compactUnique, uniqueNonEmpty } from "../value-objects/summary-text";
import {
  storyTopicAnchorTokens,
  storyTopicTokens,
} from "./story-topic-tokenizer";
import {
  aggregateReaderSummaryTopicMapNodes,
  mergeReaderSummaryTopicMapNodesByLabel,
  readerSummaryTopicMapAggregateKey,
  type ReaderSummaryTopicMapNodeDraft,
} from "./reader-summary-topic-map-aggregation";
import type {
  BuildReaderSummaryTopicMapParams,
  ReaderSummaryTopicGroupLabel,
  ReaderSummaryTopicLabelPlan,
  ReaderSummaryTopicNodeLabel,
} from "./reader-summary-topic-label-plan";
import {
  evaluateTopicLabelQuality,
  hasUsableTopicNodeLabel,
  isUsableTopicGroupLabel,
  isWeakTopicLabel,
  sanitizeTopicNodeLabel,
} from "./reader-summary-topic-map-label-quality";
import {
  buildReaderSummaryTopicMapGroups,
  readerSummaryTopicMapConfidence,
} from "./reader-summary-topic-map-structure";
import { buildReaderSummaryTopicMapEdges } from "../policies/reader-summary-topic-map-edge-policy";
import {
  extractReaderSummaryTopicLabelCandidates,
  groundReaderSummaryTopicNodeLabel,
  readerSummaryTopicLabelEvidenceTexts,
  selectReaderSummaryTopicLabel,
} from "./reader-summary-topic-label-candidates";
import {
  compactId,
  compactOptional,
  fallbackTopicFamilyGroupId,
  fallbackTopicLabel,
  humanizeSlug,
  slug,
} from "./reader-summary-topic-map-text";

export const buildReaderSummaryTopicMap = (
  params: BuildReaderSummaryTopicMapParams,
): ReaderSummaryTopicMap => {
  if (params.clusters.length === 0 || params.selectedEvidence.length === 0) {
    return emptyReaderSummaryTopicMap(params.warnings ?? []);
  }

  const evidenceById = new Map(
    params.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const storyByClusterId = new Map(
    params.topStories.map((story) => [story.storyClusterId, story] as const),
  );
  const citationsByFeedItemId = citationsByFeedItemIdMap(params.citationMap);
  const providerLabels = compactUnique(
    params.selectedEvidence.flatMap((item) => [
      item.providerName,
      item.providerKey,
      humanizeSlug(item.providerKey),
    ]),
  );
  const nodeLabels = new Map(
    (params.labelPlan?.nodeLabels ?? [])
      .map(sanitizeTopicNodeLabel)
      .filter(hasUsableTopicNodeLabel)
      .map((label) => [label.nodeId, label] as const),
  );
  const reviewedNodeIds = new Set(
    (params.labelPlan?.nodeLabels ?? [])
      .map((label) => compactId(label.nodeId))
      .filter((nodeId): nodeId is string => nodeId !== undefined),
  );
  const labelGroups = validLabelGroups(
    params.labelPlan,
    nodeLabels,
    providerLabels,
  );
  const aggregateByFallbackGroup =
    params.generatedBy === "agent-runtime" && nodeLabels.size === 0;
  const reviewedClusters = reviewedTopicClusters(params, reviewedNodeIds);
  const nodeDrafts = reviewedClusters
    .map((cluster) =>
      topicNodeForCluster({
        cluster,
        evidenceById,
        story: storyByClusterId.get(cluster.id),
        citationsByFeedItemId,
        nodeLabel: nodeLabels.get(topicNodeId(cluster.id)),
        aggregateByFallbackGroup,
      }),
    )
    .filter((node): node is ReaderSummaryTopicMapNodeDraft => node !== null);

  if (nodeDrafts.length === 0) {
    return emptyReaderSummaryTopicMap(params.warnings ?? []);
  }

  const rawNodes = mergeReaderSummaryTopicMapNodesByLabel(
    aggregateReaderSummaryTopicMapNodes(nodeDrafts),
  );
  const semanticAnchorsByGroup = new Map(
    [...labelGroups].map(([groupId, group]) => [
      groupId,
      uniqueNonEmpty([group.label, ...(group.semanticAnchors ?? [])]),
    ]),
  );
  const nodes = applyReaderSummaryTopicMapGroupingPolicy(
    normalizeNodePopularity(rawNodes).slice(
      0,
      READER_SUMMARY_TOPIC_MAP_MAX_NODES,
    ),
    { semanticAnchorsByGroup },
  );
  const groups = buildReaderSummaryTopicMapGroups(nodes, labelGroups);
  const edges = buildReaderSummaryTopicMapEdges(nodes, groups);
  const omittedClusterCount = params.clusters.length - reviewedClusters.length;
  const warnings = uniqueNonEmpty([
    ...(params.warnings ?? []),
    ...(params.labelPlan?.warnings ?? []),
    ...(omittedClusterCount > 0
      ? [
          `Omitted ${omittedClusterCount} lower-ranked topic candidates that were not reviewed by the configured labeler`,
        ]
      : []),
  ]);

  return {
    schemaVersion: "reader_summary.topic_map.v1",
    generatedBy: params.generatedBy ?? "deterministic",
    confidence: readerSummaryTopicMapConfidence(
      nodes,
      groups,
      params.generatedBy,
    ),
    nodes,
    groups,
    edges,
    warnings,
  };
};

const topicNodeForCluster = (params: {
  readonly cluster: StoryCluster;
  readonly evidenceById: ReadonlyMap<string, SummaryEvidenceItem>;
  readonly story?: TopReadCandidate;
  readonly citationsByFeedItemId: ReadonlyMap<string, readonly string[]>;
  readonly nodeLabel?: ReaderSummaryTopicNodeLabel;
  readonly aggregateByFallbackGroup: boolean;
}): ReaderSummaryTopicMapNodeDraft | null => {
  const evidence = [
    params.cluster.representativeFeedItemId,
    ...params.cluster.duplicateFeedItemIds,
  ]
    .map((id) => params.evidenceById.get(id))
    .filter((item): item is SummaryEvidenceItem => item !== undefined);

  if (evidence.length === 0) {
    return null;
  }

  const nodeId = topicNodeId(params.cluster.id);
  const fallbackKeywords = uniqueNonEmpty(
    evidence.flatMap((item) => storyTopicTokens(item, STORY_RANKING_POLICY_V1)),
  ).slice(0, 8);
  const labelContext = {
    story: params.story,
    evidence,
    fallbackKeywords,
    cluster: params.cluster,
  };
  const labelCandidates = extractReaderSummaryTopicLabelCandidates({
    ...labelContext,
    fallbackLabel: params.nodeLabel?.label,
  });
  const evidenceTexts = readerSummaryTopicLabelEvidenceTexts(labelContext);
  const providerLabels = params.cluster.providerKeys.map(humanizeSlug);
  const label = selectReaderSummaryTopicLabel({
    proposedLabel: params.nodeLabel?.label,
    labelCandidates,
    evidenceTexts,
    providerLabels,
  });
  if (
    !evaluateTopicLabelQuality(label, {
      evidenceTexts,
      providerLabels,
      candidateLabels: labelCandidates.map((candidate) => candidate.label),
    }).accepted
  ) {
    return null;
  }
  const nodeLabel = groundReaderSummaryTopicNodeLabel({
    nodeLabel: params.nodeLabel,
    selectedLabel: label,
    evidenceTexts,
    providerLabels,
    candidateLabels: labelCandidates.map((candidate) => candidate.label),
  });
  const fallbackTopicId = deterministicGroupId(
    params.cluster,
    fallbackKeywords,
  );
  const aggregateLabel = params.aggregateByFallbackGroup
    ? acceptedAggregateLabel({
        label: fallbackTopicLabel(fallbackTopicId),
        evidenceTexts,
        providerLabels,
        candidateLabels: labelCandidates.map((candidate) => candidate.label),
      })
    : undefined;
  const groupId =
    compactId(nodeLabel?.groupId) ??
    (params.aggregateByFallbackGroup
      ? fallbackTopicFamilyGroupId(fallbackTopicId)
      : fallbackTopicId);
  const rawScore = Math.max(0, params.cluster.score);

  return {
    id: nodeId,
    label,
    groupId,
    storyClusterIds: [params.cluster.id],
    popularityScore: rawScore,
    sizeWeight: 0.2,
    evidenceCount: evidence.length,
    providerKeys: uniqueNonEmpty(params.cluster.providerKeys),
    interestIds: uniqueNonEmpty(params.cluster.interestIds),
    citationIds: uniqueNonEmpty(
      evidence.flatMap(
        (item) => params.citationsByFeedItemId.get(item.feedItemId) ?? [],
      ),
    ),
    keywords: uniqueNonEmpty([
      ...(nodeLabel?.keywords ?? []),
      ...labelCandidates.map((candidate) => candidate.label),
      ...fallbackKeywords,
    ]).slice(0, 8),
    rationale:
      compactOptional(nodeLabel?.rationale) ??
      params.cluster.whyImportant[0] ??
      `Clustered ${evidence.length} related source items`,
    aggregateKey: readerSummaryTopicMapAggregateKey({
      nodeId,
      nodeLabel,
      fallbackGroupId: fallbackTopicId,
      aggregateFallbackGroup: params.aggregateByFallbackGroup,
    }),
    aggregateLabel,
    aggregateRankScore: rawScore,
  };
};

const acceptedAggregateLabel = (params: {
  readonly label: string;
  readonly evidenceTexts: readonly string[];
  readonly providerLabels: readonly string[];
  readonly candidateLabels: readonly string[];
}): string | undefined =>
  evaluateTopicLabelQuality(params.label, {
    evidenceTexts: params.evidenceTexts,
    providerLabels: params.providerLabels,
    candidateLabels: params.candidateLabels,
  }).accepted
    ? params.label
    : undefined;

const normalizeNodePopularity = (
  nodes: readonly ReaderSummaryTopicMapNode[],
): readonly ReaderSummaryTopicMapNode[] => {
  const scored = nodes.map((node) => {
    const rawScore =
      node.popularityScore +
      Math.log1p(node.evidenceCount) * 0.18 +
      Math.max(0, node.providerKeys.length - 1) * 0.15 +
      Math.max(0, node.interestIds.length - 1) * 0.08;

    return { node, rawScore };
  });
  const maxScore = Math.max(...scored.map((item) => item.rawScore), 0.001);
  const minScore = Math.min(...scored.map((item) => item.rawScore));
  const scoreRange = maxScore - minScore;
  const hasScoreSpread = scoreRange >= Math.max(0.08, maxScore * 0.04);
  const tiedScoreWeight = Math.max(0.18, Math.min(1, maxScore));
  const transformedScores = scored
    .map((item) => Math.log1p(item.rawScore))
    .sort((left, right) => left - right);
  const transformedMin = transformedScores[0] ?? 0;
  const transformedMax = transformedScores.at(-1) ?? transformedMin;
  const transformedRange = transformedMax - transformedMin;

  return scored
    .map(({ node, rawScore }) => {
      const transformed = Math.log1p(rawScore);
      const logarithmicSignal =
        transformedRange <= 0
          ? 1
          : (transformed - transformedMin) / transformedRange;
      const scoreWeight = hasScoreSpread
        ? 0.18 + logarithmicSignal * 0.82
        : tiedScoreWeight;
      const normalized = Math.max(0.18, Math.min(1, scoreWeight));

      return {
        ...node,
        popularityScore: roundScore(normalized * 100),
        sizeWeight: roundScore(Math.sqrt(normalized)),
      };
    })
    .sort((left, right) => right.popularityScore - left.popularityScore);
};

export const topicNodeId = (storyClusterId: string): string =>
  `topic:${storyClusterId}`;

const reviewedTopicClusters = (
  params: BuildReaderSummaryTopicMapParams,
  reviewedNodeIds: ReadonlySet<string>,
): readonly StoryCluster[] => {
  if (params.generatedBy !== "agent-runtime" || reviewedNodeIds.size === 0) {
    return params.clusters;
  }

  return params.clusters.filter((cluster) =>
    reviewedNodeIds.has(topicNodeId(cluster.id)),
  );
};

const validLabelGroups = (
  plan: ReaderSummaryTopicLabelPlan | undefined,
  nodeLabels: ReadonlyMap<string, ReaderSummaryTopicNodeLabel>,
  providerLabels: readonly string[],
): ReadonlyMap<string, ReaderSummaryTopicGroupLabel> => {
  if (plan === undefined) {
    return new Map();
  }
  const referencedGroupIds = new Set(
    [...nodeLabels.values()]
      .map((label) => compactId(label.groupId))
      .filter((groupId): groupId is string => groupId !== undefined),
  );

  return new Map(
    plan.groups
      .filter(
        (group) =>
          isUsableTopicGroupLabel(group, { providerLabels }) &&
          (referencedGroupIds.has(group.id) ||
            (group.nodeIds ?? []).some((nodeId) => nodeLabels.has(nodeId))),
      )
      .map((group) => [group.id, group] as const),
  );
};

const deterministicGroupId = (
  cluster: StoryCluster,
  keywords: readonly string[],
): string => {
  const semanticToken =
    storyTopicAnchorTokens(keywords)[0] ??
    keywords.find((keyword) => !isWeakTopicLabel(keyword));
  if (semanticToken !== undefined) {
    return `topic:${slug(semanticToken)}`;
  }
  const interest = cluster.interestIds[0];
  if (interest !== undefined) {
    return `interest:${slug(interest)}`;
  }

  return `provider:${slug(cluster.providerKeys[0] ?? "unknown")}`;
};

const citationsByFeedItemIdMap = (
  citations: readonly ReaderSummaryCitation[],
): ReadonlyMap<string, readonly string[]> => {
  const result = new Map<string, string[]>();

  for (const citation of citations) {
    result.set(citation.feedItemId, [
      ...(result.get(citation.feedItemId) ?? []),
      citation.citationId,
    ]);
  }

  return result;
};

const roundScore = (value: number): number => Math.round(value * 1000) / 1000;
