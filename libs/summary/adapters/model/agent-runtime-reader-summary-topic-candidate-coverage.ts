import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { buildGroundedTopicCohortsForCandidates } from "./agent-runtime-reader-summary-topic-grounded-cohorts";

type TopicCandidate = ReaderSummaryTopicLabelerInput["candidates"][number];

/** Preserve whole grounded cohorts while bounding the selected candidates. */
export const selectGroundedTopicCandidateCoverage = (
  ranked: readonly TopicCandidate[],
  boundedLimit: number,
): readonly TopicCandidate[] => {
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
