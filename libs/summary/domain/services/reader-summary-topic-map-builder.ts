import {
  emptyReaderSummaryTopicMap,
  type ReaderSummaryTopicMap,
  type ReaderSummaryTopicMapGenerator,
  type ReaderSummaryTopicMapGroup,
  type ReaderSummaryTopicMapNode,
} from "../entities/reader-summary-topic-map";
import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import { STORY_RANKING_POLICY_V1 } from "../policies/story-ranking-policy";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  compactUnique,
  interestTitle,
  uniqueNonEmpty,
} from "../value-objects/summary-text";
import {
  storyTopicAnchorTokens,
  storyTopicTokens,
} from "./story-key-normalizer";
import {
  aggregateReaderSummaryTopicMapNodes,
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
  hasUsableTopicNodeLabel,
  isUsableTopicGroupLabel,
  isWeakTopicLabel,
  sanitizeTopicNodeLabel,
} from "./reader-summary-topic-map-label-quality";
import {
  extractReaderSummaryTopicLabelCandidates,
  groundReaderSummaryTopicNodeLabel,
  readerSummaryTopicLabelEvidenceTexts,
  selectReaderSummaryTopicLabel,
} from "./reader-summary-topic-label-candidates";
import {
  compactId,
  compactLabel,
  compactOptional,
  fallbackTopicFamilyGroupId,
  fallbackTopicLabel,
  humanizeSlug,
  slug,
} from "./reader-summary-topic-map-text";

const maxEdges = 80;
const colorKeys = [
  "blue",
  "green",
  "pink",
  "amber",
  "violet",
  "teal",
  "orange",
  "slate",
] as const;
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
  const labelGroups = validLabelGroups(
    params.labelPlan,
    nodeLabels,
    providerLabels,
  );
  const aggregateByFallbackGroup =
    params.generatedBy === "agent-runtime" && nodeLabels.size === 0;
  const nodeDrafts = params.clusters
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

  const rawNodes = aggregateReaderSummaryTopicMapNodes(nodeDrafts);
  const nodes = normalizeNodePopularity(rawNodes);
  const groups = topicGroups(nodes, labelGroups);
  const edges = topicEdges(nodes);
  const warnings = uniqueNonEmpty([
    ...(params.warnings ?? []),
    ...(params.labelPlan?.warnings ?? []),
  ]);

  return {
    schemaVersion: "reader_summary.topic_map.v1",
    generatedBy: params.generatedBy ?? "deterministic",
    confidence: topicMapConfidence(nodes, groups, params.generatedBy),
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
    aggregateLabel: params.aggregateByFallbackGroup
      ? fallbackTopicLabel(fallbackTopicId)
      : undefined,
    aggregateRankScore: rawScore,
  };
};

const normalizeNodePopularity = (
  nodes: readonly ReaderSummaryTopicMapNode[],
): readonly ReaderSummaryTopicMapNode[] => {
  const scored = nodes.map((node, index) => {
    const rawScore =
      node.popularityScore +
      Math.log1p(node.evidenceCount) * 0.18 +
      Math.max(0, node.providerKeys.length - 1) * 0.15 +
      Math.max(0, node.interestIds.length - 1) * 0.08;

    return { node, rawScore, index };
  });
  const maxScore = Math.max(...scored.map((item) => item.rawScore), 0.001);
  const minScore = Math.min(...scored.map((item) => item.rawScore));
  const scoreRange = maxScore - minScore;
  const hasScoreSpread = scoreRange >= Math.max(0.08, maxScore * 0.04);
  const maxRank = Math.max(1, scored.length - 1);

  return scored
    .map(({ node, rawScore, index }) => {
      const scoreWeight = hasScoreSpread
        ? (rawScore - minScore) / scoreRange
        : 1 - (index / maxRank) * 0.78;
      const normalized = Math.max(0.18, Math.min(1, scoreWeight));

      return {
        ...node,
        popularityScore: roundScore(normalized * 100),
        sizeWeight: roundScore(Math.sqrt(normalized)),
      };
    })
    .sort((left, right) => right.popularityScore - left.popularityScore);
};

const topicGroups = (
  nodes: readonly ReaderSummaryTopicMapNode[],
  labelGroups: ReadonlyMap<string, ReaderSummaryTopicGroupLabel>,
): readonly ReaderSummaryTopicMapGroup[] => {
  const byGroup = new Map<string, ReaderSummaryTopicMapNode[]>();

  for (const node of nodes) {
    byGroup.set(node.groupId, [...(byGroup.get(node.groupId) ?? []), node]);
  }

  return [...byGroup.entries()]
    .map(([groupId, groupNodes], index) => {
      const labeled = labelGroups.get(groupId);
      const nodeIds = groupNodes.map((node) => node.id);

      return {
        id: groupId,
        label:
          compactOptional(labeled?.label) ??
          deterministicGroupLabel(groupId, groupNodes),
        colorKey: colorKeys[index % colorKeys.length] ?? "blue",
        nodeIds,
        confidence: {
          level: labeled === undefined ? "medium" : "high",
          score: boundedScore(labeled?.confidenceScore ?? 0.72),
          rationale:
            compactOptional(labeled?.rationale) ??
            `Groups ${groupNodes.length} related topic nodes`,
        },
      } satisfies ReaderSummaryTopicMapGroup;
    })
    .sort((left, right) => right.nodeIds.length - left.nodeIds.length);
};

const topicEdges = (
  nodes: readonly ReaderSummaryTopicMapNode[],
): ReaderSummaryTopicMap["edges"] =>
  nodes
    .flatMap((source, sourceIndex) =>
      nodes.slice(sourceIndex + 1).map((target) => {
        const sameGroup = source.groupId === target.groupId ? 0.32 : 0;
        const sharedInterests = sharedCount(
          source.interestIds,
          target.interestIds,
        );
        const sharedProviders = sharedCount(
          source.providerKeys,
          target.providerKeys,
        );
        const sharedKeywords = sharedCount(source.keywords, target.keywords);
        const weight = roundScore(
          Math.min(
            1,
            sameGroup +
              Math.min(0.35, sharedInterests * 0.18) +
              Math.min(0.2, sharedProviders * 0.08) +
              Math.min(0.28, sharedKeywords * 0.06),
          ),
        );

        return {
          sourceNodeId: source.id,
          targetNodeId: target.id,
          weight,
          reason: edgeReason({
            sameGroup: sameGroup > 0,
            sharedInterests,
            sharedProviders,
            sharedKeywords,
          }),
        };
      }),
    )
    .filter((edge) => edge.weight >= 0.24)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, maxEdges);

const topicMapConfidence = (
  nodes: readonly ReaderSummaryTopicMapNode[],
  groups: readonly ReaderSummaryTopicMapGroup[],
  generatedBy: ReaderSummaryTopicMapGenerator | undefined,
): ReaderSummaryTopicMap["confidence"] => {
  const crossSourceNodeCount = nodes.filter(
    (node) => node.providerKeys.length > 1,
  ).length;
  const score = boundedScore(
    0.45 +
      Math.min(0.25, nodes.length * 0.03) +
      Math.min(0.2, crossSourceNodeCount * 0.06) +
      (generatedBy === "agent-runtime" ? 0.1 : 0),
  );

  return {
    level: score >= 0.78 ? "high" : score >= 0.55 ? "medium" : "low",
    score,
    rationale: `Built from ${nodes.length} topic nodes across ${groups.length} semantic groups`,
  };
};

export const topicNodeId = (storyClusterId: string): string =>
  `topic:${storyClusterId}`;

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

const deterministicGroupLabel = (
  groupId: string,
  nodes: readonly ReaderSummaryTopicMapNode[],
): string => {
  const [, rawValue = groupId] = groupId.split(":");
  if (groupId.startsWith("interest:")) {
    return interestTitle(rawValue);
  }

  const fallbackLabel = compactLabel(
    nodes
      .flatMap((node) => node.keywords)
      .find((keyword) => !isWeakTopicLabel(keyword)) ?? humanizeSlug(rawValue),
  );

  return isWeakTopicLabel(fallbackLabel) ? "Other topics" : fallbackLabel;
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

const edgeReason = (params: {
  readonly sameGroup: boolean;
  readonly sharedInterests: number;
  readonly sharedProviders: number;
  readonly sharedKeywords: number;
}): string => {
  if (params.sameGroup) {
    return "Same semantic topic group";
  }
  if (params.sharedInterests > 0) {
    return "Shared monitored interest";
  }
  if (params.sharedKeywords > 0) {
    return "Shared content keywords";
  }
  if (params.sharedProviders > 0) {
    return "Shared source provider";
  }

  return "Weak related topic signal";
};

const sharedCount = (
  left: readonly string[],
  right: readonly string[],
): number => {
  const rightSet = new Set(
    right.map((value) => value.toLocaleLowerCase("en-US")),
  );

  return new Set(
    left
      .map((value) => value.toLocaleLowerCase("en-US"))
      .filter((value) => rightSet.has(value)),
  ).size;
};

const boundedScore = (value: number): number =>
  roundScore(Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

const roundScore = (value: number): number => Math.round(value * 1000) / 1000;
