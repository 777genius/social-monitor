import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import {
  buildGroundedTopicCohorts,
  groundedCandidateTopicAnchors,
  type GroundedTopicCohort,
} from "./agent-runtime-reader-summary-topic-grounded-cohorts";

type TopicCandidate =
  ReaderSummaryTopicLabelerInput["candidates"][number];

type CohortSelection = {
  readonly count: number;
  readonly rankCost: number;
  readonly contributions: readonly number[];
};

export const selectAgentRuntimeReaderSummaryTopicCandidates = (
  input: Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">,
  maxCandidates: number,
): readonly TopicCandidate[] => {
  const limit = Math.max(0, Math.floor(maxCandidates));
  if (limit === 0) {
    return [];
  }
  const clusterScoreById = new Map(
    input.clusters.map((cluster) => [cluster.id, cluster.score] as const),
  );
  const seenNodeIds = new Set<string>();
  const ranked = input.candidates
    .slice()
    .sort((left, right) => {
      const scoreDifference =
        (clusterScoreById.get(right.storyClusterId) ?? right.score) -
        (clusterScoreById.get(left.storyClusterId) ?? left.score);

      return scoreDifference !== 0
        ? scoreDifference
        : left.nodeId.localeCompare(right.nodeId);
    })
    .filter((candidate) => {
      if (seenNodeIds.has(candidate.nodeId)) {
        return false;
      }
      seenNodeIds.add(candidate.nodeId);
      return true;
    });
  const boundedLimit = Math.min(limit, ranked.length);
  if (ranked.length <= boundedLimit) {
    return ranked;
  }

  const anchorsByNodeId = new Map(
    ranked.map((candidate) => [
      candidate.nodeId,
      groundedCandidateTopicAnchors(candidate),
    ]),
  );
  const cohorts = buildGroundedTopicCohorts(
    ranked.map((candidate) => candidate.nodeId),
    anchorsByNodeId,
  );
  const connectedPrefixes = cohorts.map((cohort) =>
    connectedCohortPrefix(cohort, anchorsByNodeId),
  );
  const contributions = chooseCohortContributions({
    connectedPrefixes,
    target: Math.ceil(boundedLimit / 2),
    limit: boundedLimit,
    rankByNodeId: new Map(
      ranked.map((candidate, index) => [candidate.nodeId, index] as const),
    ),
  });
  const selectedNodeIds = new Set<string>();
  connectedPrefixes.forEach((prefix, index) => {
    prefix
      .slice(0, contributions[index] ?? 0)
      .forEach((nodeId) => selectedNodeIds.add(nodeId));
  });
  for (const candidate of ranked) {
    if (selectedNodeIds.size >= boundedLimit) {
      break;
    }
    selectedNodeIds.add(candidate.nodeId);
  }

  return ranked.filter((candidate) => selectedNodeIds.has(candidate.nodeId));
};

const chooseCohortContributions = (params: {
  readonly connectedPrefixes: readonly (readonly string[])[];
  readonly target: number;
  readonly limit: number;
  readonly rankByNodeId: ReadonlyMap<string, number>;
}): readonly number[] => {
  let states = new Map<number, CohortSelection>([
    [
      0,
      {
        count: 0,
        rankCost: 0,
        contributions: [],
      },
    ],
  ]);
  for (const prefix of params.connectedPrefixes) {
    const next = new Map<number, CohortSelection>();
    for (const state of states.values()) {
      for (const contribution of [
        0,
        ...Array.from(
          { length: Math.max(0, Math.min(prefix.length, params.limit) - 1) },
          (_, index) => index + 2,
        ),
      ]) {
        const count = state.count + contribution;
        if (count > params.limit) {
          continue;
        }
        const candidate = {
          count,
          rankCost:
            state.rankCost +
            prefix
              .slice(0, contribution)
              .reduce(
                (total, nodeId) =>
                  total +
                  (params.rankByNodeId.get(nodeId) ?? Number.MAX_SAFE_INTEGER),
                0,
              ),
          contributions: [...state.contributions, contribution],
        };
        const current = next.get(count);
        if (current === undefined || candidate.rankCost < current.rankCost) {
          next.set(count, candidate);
        }
      }
    }
    states = next;
  }
  const feasible = [...states.values()].filter(
    (state) => state.count >= params.target,
  );
  const chosen =
    feasible.sort(compareSelections)[0] ??
    [...states.values()].sort(
      (left, right) =>
        right.count - left.count || left.rankCost - right.rankCost,
    )[0];

  return [
    ...(chosen?.contributions ?? []),
    ...Array.from(
      {
        length: Math.max(
          0,
          params.connectedPrefixes.length -
            (chosen?.contributions.length ?? 0),
        ),
      },
      () => 0,
    ),
  ];
};

const compareSelections = (
  left: CohortSelection,
  right: CohortSelection,
): number =>
  left.count - right.count ||
  left.rankCost - right.rankCost ||
  left.contributions.filter((count) => count > 0).length -
    right.contributions.filter((count) => count > 0).length;

const connectedCohortPrefix = (
  cohort: GroundedTopicCohort,
  anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>,
): readonly string[] => {
  const remaining = [...cohort.nodeIds];
  const selected = [remaining.shift()!];
  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex((nodeId) =>
      selected.some((selectedNodeId) =>
        shareAnchor(
          anchorsByNodeId.get(nodeId),
          anchorsByNodeId.get(selectedNodeId),
        ),
      ),
    );
    if (nextIndex < 0) {
      break;
    }
    selected.push(remaining.splice(nextIndex, 1)[0]!);
  }

  return selected;
};

const shareAnchor = (
  left: ReadonlySet<string> | undefined,
  right: ReadonlySet<string> | undefined,
): boolean =>
  left !== undefined &&
  right !== undefined &&
  [...left].some((anchor) => right.has(anchor));
