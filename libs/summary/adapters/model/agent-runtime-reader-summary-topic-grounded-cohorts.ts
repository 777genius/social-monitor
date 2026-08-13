import { meaningfulTopicLabelTokens } from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";

type TopicCandidate =
  ReaderSummaryTopicLabelerInput["candidates"][number];

export type GroundedTopicCohort = {
  readonly nodeIds: readonly string[];
  readonly anchors: readonly string[];
};

export const groundedCandidateTopicAnchors = (
  candidate: TopicCandidate,
): ReadonlySet<string> =>
  new Set(
    [
      candidate.fallbackLabel,
      ...candidate.keywords,
      ...candidate.labelCandidates.map((option) => option.label),
    ]
      .flatMap(meaningfulTopicLabelTokens)
      .filter((term) => !nonDiscriminativeCandidateTerms.has(term)),
  );

export const buildGroundedTopicCohorts = (
  orderedNodeIds: readonly string[],
  anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>,
): readonly GroundedTopicCohort[] => {
  const indexByNodeId = new Map(
    orderedNodeIds.map((nodeId, index) => [nodeId, index] as const),
  );
  const parent = orderedNodeIds.map((_, index) => index);
  const nodesByAnchor = new Map<string, number[]>();
  for (const nodeId of orderedNodeIds) {
    const nodeIndex = indexByNodeId.get(nodeId)!;
    for (const anchor of anchorsByNodeId.get(nodeId) ?? []) {
      nodesByAnchor.set(anchor, [
        ...(nodesByAnchor.get(anchor) ?? []),
        nodeIndex,
      ]);
    }
  }
  for (const indexes of nodesByAnchor.values()) {
    if (indexes.length < 2) {
      continue;
    }
    for (const index of indexes.slice(1)) {
      union(parent, indexes[0]!, index);
    }
  }

  const nodeIdsByRoot = new Map<number, string[]>();
  for (const nodeId of orderedNodeIds) {
    const root = find(parent, indexByNodeId.get(nodeId)!);
    nodeIdsByRoot.set(root, [...(nodeIdsByRoot.get(root) ?? []), nodeId]);
  }

  return [...nodeIdsByRoot.values()]
    .filter((nodeIds) => nodeIds.length >= 2)
    .map((nodeIds) => ({
      nodeIds,
      anchors: supportedCohortAnchors(nodeIds, anchorsByNodeId),
    }))
    .filter((cohort) => cohort.anchors.length > 0)
    .sort(
      (left, right) =>
        (indexByNodeId.get(left.nodeIds[0]!) ?? Number.MAX_SAFE_INTEGER) -
        (indexByNodeId.get(right.nodeIds[0]!) ?? Number.MAX_SAFE_INTEGER),
    );
};

const supportedCohortAnchors = (
  nodeIds: readonly string[],
  anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>,
): readonly string[] => {
  const support = new Map<string, number>();
  for (const nodeId of nodeIds) {
    for (const anchor of anchorsByNodeId.get(nodeId) ?? []) {
      support.set(anchor, (support.get(anchor) ?? 0) + 1);
    }
  }

  return [...support]
    .filter(([, count]) => count >= 2)
    .sort(
      (left, right) =>
        right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .map(([anchor]) => anchor);
};

const find = (parent: number[], index: number): number => {
  let root = index;
  while (parent[root] !== root) {
    root = parent[root]!;
  }
  let cursor = index;
  while (parent[cursor] !== cursor) {
    const next = parent[cursor]!;
    parent[cursor] = root;
    cursor = next;
  }

  return root;
};

const union = (parent: number[], left: number, right: number): void => {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot !== rightRoot) {
    parent[rightRoot] = leftRoot;
  }
};

const nonDiscriminativeCandidateTerms = new Set([
  "ai",
  "agent",
  "agents",
  "availability",
  "benchmark",
  "code",
  "comparison",
  "content",
  "cost",
  "costs",
  "developer",
  "developers",
  "ecosystem",
  "ecosystems",
  "education",
  "efficiency",
  "engagement",
  "event",
  "industry",
  "industries",
  "href",
  "https",
  "limits",
  "model",
  "models",
  "preserve",
  "product",
  "products",
  "provider",
  "quality",
  "release",
  "review",
  "rollout",
  "security",
  "selected",
  "signal",
  "software",
  "strong",
  "technology",
  "technologies",
  "tool",
  "tools",
  "ve",
  "hey",
  "never",
]);
