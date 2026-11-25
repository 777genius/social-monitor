import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  type ReaderSummaryTopicMap,
} from "../entities/reader-summary-topic-map";
import {
  evaluateTopicLabelQuality,
  meaningfulTopicLabelTokens,
} from "../services/reader-summary-topic-map-label-quality";
import {
  humanizeSlug,
  normalizeTopicLabel,
} from "../services/reader-summary-topic-map-text";
import {
  applyReaderSummaryTopicMapGroupingPolicy,
  READER_SUMMARY_TOPIC_MAP_MAX_NODES,
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
} from "./reader-summary-topic-map-grouping-policy";

export type ReaderSummaryTopicMapStructureQuality = {
  readonly passed: boolean;
  readonly issues: readonly string[];
  readonly metrics: {
    readonly nodeCount: number;
    readonly semanticGroupCount: number;
    readonly ungroupedNodeCount: number;
    readonly groupedCoverage: number;
    readonly singletonSemanticGroupCount: number;
    readonly invalidGroupIdCount: number;
    readonly misalignedGroupLabelCount: number;
    readonly inconsistentGroupMembershipCount: number;
    readonly incoherentGroupNodeCount: number;
    readonly invalidEdgeCount: number;
    readonly duplicateLabelAcrossGroupsCount: number;
    readonly invalidNodeLabelCount: number;
    readonly invalidSemanticGroupLabelCount: number;
  };
};

export const evaluateReaderSummaryTopicMapStructure = (
  topicMap: ReaderSummaryTopicMap,
): ReaderSummaryTopicMapStructureQuality => {
  const nodeById = new Map(topicMap.nodes.map((node) => [node.id, node]));
  const semanticGroups = topicMap.groups.filter(
    (group) => group.id !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  );
  const ungroupedNodeCount = topicMap.nodes.filter(
    (node) => node.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  ).length;
  const groupedCoverage =
    topicMap.nodes.length === 0
      ? 1
      : (topicMap.nodes.length - ungroupedNodeCount) / topicMap.nodes.length;
  const singletonSemanticGroupCount = semanticGroups.filter(
    (group) => group.nodeIds.length < 2,
  ).length;
  const invalidGroupIdCount = topicMap.groups.filter(
    (group) => !/^group:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(group.id),
  ).length;
  const misalignedGroupLabelCount = semanticGroups.filter(
    (group) => !groupLabelMatchesId(group.id, group.label),
  ).length;
  const inconsistentGroupMembershipCount = topicMap.groups.filter((group) =>
    group.nodeIds.some((nodeId) => nodeById.get(nodeId)?.groupId !== group.id),
  ).length;
  const regroupedNodes = applyReaderSummaryTopicMapGroupingPolicy(
    topicMap.nodes,
    {
      semanticAnchorsByGroup: new Map(
        topicMap.groups.map((group) => [
          group.id,
          [group.label, ...(group.semanticAnchors ?? [])],
        ]),
      ),
    },
  );
  const regroupedNodeById = new Map(
    regroupedNodes.map((node) => [node.id, node] as const),
  );
  const incoherentGroupNodeCount = topicMap.nodes.filter(
    (node) =>
      node.groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID &&
      regroupedNodeById.get(node.id)?.groupId !== node.groupId,
  ).length;
  const invalidEdgeCount = topicMap.edges.filter((edge) => {
    const source = nodeById.get(edge.sourceNodeId);
    const target = nodeById.get(edge.targetNodeId);

    return (
      source === undefined ||
      target === undefined ||
      source.groupId !== target.groupId ||
      source.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID
    );
  }).length;
  const duplicateLabelAcrossGroupsCount = duplicateLabelsAcrossGroups(topicMap);
  const invalidNodeLabelCount = topicMap.nodes.filter(
    (node) => !evaluateTopicLabelQuality(node.label).accepted,
  ).length;
  const invalidSemanticGroupLabelCount = semanticGroups.filter(
    (group) => !evaluateTopicLabelQuality(group.label).accepted,
  ).length;
  const issues = [
    ...(topicMap.nodes.length > READER_SUMMARY_TOPIC_MAP_MAX_NODES
      ? ["topic node count exceeds the map contract"]
      : []),
    ...(semanticGroups.length > READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS
      ? ["semantic group count exceeds the map contract"]
      : []),
    ...(topicMap.nodes.length >= 4 && semanticGroups.length === 0
      ? ["map has no supported semantic groups"]
      : []),
    ...(singletonSemanticGroupCount > 0
      ? ["semantic groups must contain at least two nodes"]
      : []),
    ...(invalidGroupIdCount > 0
      ? ["group ids must use the canonical group:<slug> format"]
      : []),
    ...(misalignedGroupLabelCount > 0
      ? ["group labels must describe their semantic group ids"]
      : []),
    ...(inconsistentGroupMembershipCount > 0
      ? ["group node lists must match node group assignments"]
      : []),
    ...(incoherentGroupNodeCount > 0
      ? ["semantic groups contain nodes without shared evidence anchors"]
      : []),
    ...(invalidEdgeCount > 0
      ? ["edges must connect nodes inside one supported semantic group"]
      : []),
    ...(duplicateLabelAcrossGroupsCount > 0
      ? ["the same topic label cannot appear in different groups"]
      : []),
    ...(invalidNodeLabelCount > 0
      ? ["topic nodes must use concrete reader-facing noun phrases"]
      : []),
    ...(invalidSemanticGroupLabelCount > 0
      ? ["semantic groups must use concrete reader-facing labels"]
      : []),
  ];

  return {
    passed: issues.length === 0,
    issues,
    metrics: {
      nodeCount: topicMap.nodes.length,
      semanticGroupCount: semanticGroups.length,
      ungroupedNodeCount,
      groupedCoverage: roundScore(groupedCoverage),
      singletonSemanticGroupCount,
      invalidGroupIdCount,
      misalignedGroupLabelCount,
      inconsistentGroupMembershipCount,
      incoherentGroupNodeCount,
      invalidEdgeCount,
      duplicateLabelAcrossGroupsCount,
      invalidNodeLabelCount,
      invalidSemanticGroupLabelCount,
    },
  };
};

const groupLabelMatchesId = (groupId: string, label: string): boolean => {
  const [, rawValue = groupId] = groupId.split(":");
  const idTokens = new Set(
    meaningfulTopicLabelTokens(humanizeSlug(rawValue)).map(semanticTokenFamily),
  );

  return meaningfulTopicLabelTokens(label)
    .map(semanticTokenFamily)
    .some((token) => idTokens.has(token));
};

const duplicateLabelsAcrossGroups = (
  topicMap: ReaderSummaryTopicMap,
): number => {
  const groupIdsByLabel = new Map<string, Set<string>>();
  for (const node of topicMap.nodes) {
    const label = normalizeTopicLabel(node.label);
    const groupIds = groupIdsByLabel.get(label) ?? new Set<string>();
    groupIds.add(node.groupId);
    groupIdsByLabel.set(label, groupIds);
  }

  return [...groupIdsByLabel.values()].filter((groupIds) => groupIds.size > 1)
    .length;
};

const semanticTokenFamily = (token: string): string =>
  token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;

const roundScore = (value: number): number => Math.round(value * 1000) / 1000;
