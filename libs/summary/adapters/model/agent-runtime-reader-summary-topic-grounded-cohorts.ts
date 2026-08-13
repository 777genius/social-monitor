import { meaningfulTopicLabelTokens } from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";

type TopicCandidate =
  ReaderSummaryTopicLabelerInput["candidates"][number];

export type GroundedTopicCohort = {
  readonly groupId: string;
  readonly label: string;
  readonly sharedAnchor: string;
  readonly nodeIds: readonly string[];
  readonly anchors: readonly string[];
};

/** Identity anchors intentionally exclude descriptive keywords and alternatives. */
export const groundedCandidateTopicAnchors = (
  candidate: TopicCandidate,
): ReadonlySet<string> =>
  new Set(
    meaningfulTopicLabelTokens(candidate.fallbackLabel).filter(
      (term) => !nonDiscriminativeCandidateTerms.has(term),
    ),
  );

export const buildGroundedTopicCohorts = (
  orderedNodeIds: readonly string[],
  anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>,
): readonly GroundedTopicCohort[] => {
  const indexByNodeId = new Map(
    orderedNodeIds.map((nodeId, index) => [nodeId, index] as const),
  );
  const nodesByAnchor = new Map<string, string[]>();
  for (const nodeId of orderedNodeIds) {
    for (const anchor of anchorsByNodeId.get(nodeId) ?? []) {
      nodesByAnchor.set(anchor, [...(nodesByAnchor.get(anchor) ?? []), nodeId]);
    }
  }
  const supportedAnchors = [...nodesByAnchor]
    .filter(([, nodeIds]) => nodeIds.length >= 2)
    .sort(
      (left, right) =>
        right[1].length - left[1].length ||
        firstIndex(left[1], indexByNodeId) - firstIndex(right[1], indexByNodeId) ||
        left[0].localeCompare(right[0]),
    );
  const assignedNodeIds = new Set<string>();
  const cohorts: GroundedTopicCohort[] = [];
  for (const [sharedAnchor, candidateNodeIds] of supportedAnchors) {
    const nodeIds = candidateNodeIds.filter(
      (nodeId) => !assignedNodeIds.has(nodeId),
    );
    if (nodeIds.length < 2) {
      continue;
    }
    nodeIds.forEach((nodeId) => assignedNodeIds.add(nodeId));
    cohorts.push({
      groupId: groundedCohortGroupId(sharedAnchor),
      label: displayAnchor(sharedAnchor),
      sharedAnchor,
      nodeIds,
      anchors: [sharedAnchor],
    });
  }

  return cohorts.sort(
    (left, right) =>
      firstIndex(left.nodeIds, indexByNodeId) -
        firstIndex(right.nodeIds, indexByNodeId) ||
      left.sharedAnchor.localeCompare(right.sharedAnchor),
  );
};

export const buildGroundedTopicCohortsForCandidates = (
  candidates: readonly TopicCandidate[],
): readonly GroundedTopicCohort[] =>
  buildGroundedTopicCohorts(
    candidates.map((candidate) => candidate.nodeId),
    new Map(
      candidates.map((candidate) => [
        candidate.nodeId,
        groundedCandidateTopicAnchors(candidate),
      ]),
    ),
  );

const firstIndex = (
  nodeIds: readonly string[],
  indexByNodeId: ReadonlyMap<string, number>,
): number =>
  Math.min(
    ...nodeIds.map(
      (nodeId) => indexByNodeId.get(nodeId) ?? Number.MAX_SAFE_INTEGER,
    ),
  );

const groundedCohortGroupId = (anchor: string): string =>
  `group:${anchor.replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}`;

const displayAnchor = (anchor: string): string =>
  anchor.length === 0 ? anchor : `${anchor[0]!.toUpperCase()}${anchor.slice(1)}`;

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
  "family",
  "industry",
  "industries",
  "href",
  "http",
  "https",
  "limits",
  "model",
  "models",
  "product",
  "products",
  "provider",
  "quality",
  "release",
  "review",
  "rollout",
  "security",
  "signal",
  "software",
  "technology",
  "technologies",
  "top",
  "topic",
  "tool",
  "tools",
  "hey",
  "never",
  "ve",
  "will",
]);
