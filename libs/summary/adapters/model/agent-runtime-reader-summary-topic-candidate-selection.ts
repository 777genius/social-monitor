import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { buildGroundedTopicCohortsForCandidates } from "./agent-runtime-reader-summary-topic-grounded-cohorts";

type TopicCandidate =
  ReaderSummaryTopicLabelerInput["candidates"][number];

export const selectAgentRuntimeReaderSummaryTopicCandidates = (
  input: Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">,
  maxCandidates: number,
): readonly TopicCandidate[] => {
  const configuredLimit = Math.max(0, Math.floor(maxCandidates));
  if (configuredLimit === 0) {
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
  const boundedLimit = Math.min(configuredLimit, ranked.length);
  const cohorts = buildGroundedTopicCohortsForCandidates(ranked);
  const groundedNodeIds = new Set(
    cohorts.flatMap((cohort) => cohort.nodeIds),
  );
  if (groundedNodeIds.size < 2) {
    return ranked.slice(0, boundedLimit);
  }
  const effectiveLimit = Math.min(
    boundedLimit,
    Math.max(4, 2 * groundedNodeIds.size),
  );
  const targetGroundedCount = Math.ceil(effectiveLimit / 2);
  const selectedNodeIds = new Set<string>();
  for (const cohort of cohorts) {
    if (selectedNodeIds.size >= targetGroundedCount) {
      break;
    }
    if (selectedNodeIds.size + cohort.nodeIds.length <= effectiveLimit) {
      cohort.nodeIds.forEach((nodeId) => selectedNodeIds.add(nodeId));
    }
  }
  for (const candidate of ranked) {
    if (selectedNodeIds.size >= effectiveLimit) {
      break;
    }
    selectedNodeIds.add(candidate.nodeId);
  }

  return stabilizeGroundedCoverage(
    ranked.filter((candidate) => selectedNodeIds.has(candidate.nodeId)),
  );
};

const stabilizeGroundedCoverage = (
  selected: readonly TopicCandidate[],
): readonly TopicCandidate[] => {
  let stable = [...selected];
  while (stable.length > 0) {
    const rebuiltCohorts = buildGroundedTopicCohortsForCandidates(stable);
    const rebuiltGroundedNodeIds = new Set(
      rebuiltCohorts.flatMap((cohort) => cohort.nodeIds),
    );
    if (
      rebuiltGroundedNodeIds.size < 2 ||
      rebuiltGroundedNodeIds.size * 2 >= stable.length
    ) {
      return stable;
    }
    const nextLimit = Math.min(
      stable.length,
      Math.max(4, 2 * rebuiltGroundedNodeIds.size),
    );
    const nextNodeIds = new Set(rebuiltGroundedNodeIds);
    for (const candidate of stable) {
      if (nextNodeIds.size >= nextLimit) {
        break;
      }
      nextNodeIds.add(candidate.nodeId);
    }
    stable = stable.filter((candidate) => nextNodeIds.has(candidate.nodeId));
  }

  return stable;
};
