import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  type ReaderSummaryTopicMapNode,
} from "../entities/reader-summary-topic-map";
import { meaningfulTopicLabelTokens } from "../services/reader-summary-topic-map-label-quality";
import {
  compactId,
  humanizeSlug,
  normalizeTopicLabel,
  slug,
} from "../services/reader-summary-topic-map-text";

export const READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS = 8;
export const READER_SUMMARY_TOPIC_MAP_MAX_NODES = 40;

export type ReaderSummaryTopicMapGroupingPolicyOptions = {
  readonly semanticAnchorsByGroup?: ReadonlyMap<string, readonly string[]>;
};

export const applyReaderSummaryTopicMapGroupingPolicy = (
  nodes: readonly ReaderSummaryTopicMapNode[],
  options: ReaderSummaryTopicMapGroupingPolicyOptions = {},
): readonly ReaderSummaryTopicMapNode[] => {
  const canonicalNodes = nodes.map((node) => ({
    ...node,
    groupId: canonicalReaderSummaryTopicMapGroupId(node.groupId),
  }));
  const semanticAnchorsByGroup = canonicalSemanticAnchorsByGroup(options);
  const supportedAnchorsByGroup = new Map<string, ReadonlySet<string>>();
  for (const groupId of new Set(canonicalNodes.map((node) => node.groupId))) {
    if (groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID) {
      continue;
    }
    supportedAnchorsByGroup.set(
      groupId,
      supportedSemanticGroupAnchors(
        canonicalNodes,
        groupId,
        semanticAnchorsByGroup.get(groupId) ?? [],
      ),
    );
  }
  const anchoredNodes = canonicalNodes.map((node) => ({
    ...node,
    groupId:
      node.groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID &&
      nodeMatchesAnyAnchor(
        node,
        supportedAnchorsByGroup.get(node.groupId) ?? new Set(),
      )
        ? node.groupId
        : READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  }));
  const recoveredNodes = recoverUngroupedByLeadingIdentity(anchoredNodes);
  const nodesByGroup = new Map<string, ReaderSummaryTopicMapNode[]>();
  for (const node of recoveredNodes) {
    nodesByGroup.set(node.groupId, [
      ...(nodesByGroup.get(node.groupId) ?? []),
      node,
    ]);
  }

  const retainedGroupIds = new Set(
    [...nodesByGroup.entries()]
      .filter(
        ([groupId, groupNodes]) =>
          groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID &&
          groupNodes.length >= 2,
      )
      .sort(compareSemanticGroups)
      .slice(0, READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS)
      .map(([groupId]) => groupId),
  );

  return recoveredNodes.map((node) => ({
    ...node,
    groupId: retainedGroupIds.has(node.groupId)
      ? node.groupId
      : READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  }));
};

const recoverUngroupedByLeadingIdentity = (
  nodes: readonly ReaderSummaryTopicMapNode[],
): readonly ReaderSummaryTopicMapNode[] => {
  const supportedIdentityByGroup = new Map<string, ReadonlySet<string>>();
  for (const groupId of new Set(nodes.map((node) => node.groupId))) {
    if (groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID) {
      continue;
    }
    const support = new Map<string, number>();
    for (const node of nodes.filter((item) => item.groupId === groupId)) {
      const identity = leadingTopicIdentity(node.label);
      if (identity !== undefined) {
        support.set(identity, (support.get(identity) ?? 0) + 1);
      }
    }
    supportedIdentityByGroup.set(
      groupId,
      new Set(
        [...support]
          .filter(([, count]) => count >= 2)
          .map(([identity]) => identity),
      ),
    );
  }

  return nodes.map((node) => {
    if (node.groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID) {
      return node;
    }
    const identity = leadingTopicIdentity(node.label);
    if (identity === undefined) {
      return node;
    }
    const matchingGroupIds = [...supportedIdentityByGroup]
      .filter(([, identities]) => identities.has(identity))
      .map(([groupId]) => groupId);

    return matchingGroupIds.length === 1
      ? { ...node, groupId: matchingGroupIds[0]! }
      : node;
  });
};

const leadingTopicIdentity = (label: string): string | undefined =>
  meaningfulTopicLabelTokens(label)
    .map(semanticTokenFamily)
    .find((token) => !nonDiscriminativeAnchorKeys.has(token));

export const canonicalReaderSummaryTopicMapGroupId = (
  value: string,
): string => {
  const compact = compactId(value);
  if (compact === undefined) {
    return READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID;
  }
  const [, rawValue = compact] = compact.split(":");
  const semanticSlug = slug(rawValue);

  return semanticSlug.length === 0 || semanticSlug === "ungrouped"
    ? READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID
    : `group:${semanticSlug}`;
};

export const isReaderSummaryTopicMapUngrouped = (groupId: string): boolean =>
  canonicalReaderSummaryTopicMapGroupId(groupId) ===
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID;

export const supportedReaderSummaryTopicMapGroupAnchors = (
  nodes: readonly ReaderSummaryTopicMapNode[],
  groupId: string,
  semanticAnchors: readonly string[] = [],
): readonly string[] => [
  ...supportedSemanticGroupAnchors(
    nodes,
    canonicalReaderSummaryTopicMapGroupId(groupId),
    semanticAnchors,
  ),
];

const canonicalSemanticAnchorsByGroup = (
  options: ReaderSummaryTopicMapGroupingPolicyOptions,
): ReadonlyMap<string, readonly string[]> => {
  const result = new Map<string, string[]>();
  for (const [groupId, anchors] of options.semanticAnchorsByGroup ?? []) {
    const canonicalGroupId = canonicalReaderSummaryTopicMapGroupId(groupId);
    result.set(canonicalGroupId, [
      ...(result.get(canonicalGroupId) ?? []),
      ...anchors,
    ]);
  }

  return result;
};

const supportedSemanticGroupAnchors = (
  nodes: readonly ReaderSummaryTopicMapNode[],
  groupId: string,
  semanticAnchors: readonly string[],
): ReadonlySet<string> => {
  const [, rawValue = groupId] = groupId.split(":");
  const identityAnchors = new Set(
    semanticAnchorKeys(humanizeSlug(rawValue)).filter(
      (anchor) => !nonDiscriminativeAnchorKeys.has(anchor),
    ),
  );
  const candidateAnchors = new Set(
    [humanizeSlug(rawValue), ...semanticAnchors].flatMap(semanticAnchorKeys),
  );
  const groupNodes = nodes.filter((node) => node.groupId === groupId);

  return new Set(
    [...candidateAnchors].filter((anchor) => {
      if (nonDiscriminativeAnchorKeys.has(anchor)) {
        return false;
      }
      const groupSupport = groupNodes.filter((node) =>
        nodeSupportsAnchor(node, anchor),
      ).length;
      const globalSupport = nodes.filter((node) =>
        nodeSupportsAnchor(node, anchor),
      ).length;

      return (
        groupSupport >= (identityAnchors.has(anchor) ? 1 : 2) &&
        globalSupport > 0 &&
        groupSupport / globalSupport >= 0.6
      );
    }),
  );
};

const semanticAnchorKeys = (value: string): readonly string[] => {
  const normalized = normalizeTopicLabel(value);
  const tokens = meaningfulTopicLabelTokens(value).map(semanticTokenFamily);

  return [
    ...new Set([normalized, ...tokens].filter((item) => item.length > 1)),
  ];
};

const nodeMatchesAnyAnchor = (
  node: ReaderSummaryTopicMapNode,
  anchors: ReadonlySet<string>,
): boolean => [...anchors].some((anchor) => nodeSupportsAnchor(node, anchor));

const nodeSupportsAnchor = (
  node: ReaderSummaryTopicMapNode,
  anchor: string,
): boolean =>
  [node.label, ...node.keywords].some((value) => {
    const normalized = normalizeTopicLabel(value);
    const tokenFamilies = new Set(
      meaningfulTopicLabelTokens(value).map(semanticTokenFamily),
    );

    return normalized === anchor || tokenFamilies.has(anchor);
  });

const nonDiscriminativeAnchorKeys = new Set([
  "ai",
  "content",
  "developer",
  "developers",
  "ecosystem",
  "ecosystems",
  "event",
  "industry",
  "industries",
  "model",
  "models",
  "product",
  "products",
  "release event",
  "technology",
  "technologies",
  "tool",
  "tools",
]);

const semanticTokenFamily = (token: string): string =>
  token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;

const compareSemanticGroups = (
  left: readonly [string, readonly ReaderSummaryTopicMapNode[]],
  right: readonly [string, readonly ReaderSummaryTopicMapNode[]],
): number => {
  const byNodeCount = right[1].length - left[1].length;
  if (byNodeCount !== 0) {
    return byNodeCount;
  }
  const byPopularity = totalPopularity(right[1]) - totalPopularity(left[1]);
  if (byPopularity !== 0) {
    return byPopularity;
  }

  return left[0].localeCompare(right[0]);
};

const totalPopularity = (nodes: readonly ReaderSummaryTopicMapNode[]): number =>
  nodes.reduce((total, node) => total + node.popularityScore, 0);
