import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { selectGroundedTopicCandidateCoverage } from "./agent-runtime-reader-summary-topic-candidate-coverage";

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
  return selectGroundedTopicCandidateCoverage(ranked, boundedLimit);
};
