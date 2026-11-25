import type { ReaderSummaryTopicLabelerInput } from "../../ports";

type TopicCandidate = ReaderSummaryTopicLabelerInput["candidates"][number];

/**
 * Provider-independent priority and identity policy.
 * Cluster scores outrank raw candidate scores; the highest-ranked duplicate
 * node survives, with stable lexical node identity as the tie breaker.
 */
export const rankUniqueAgentRuntimeTopicCandidates = (
  input: Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">,
): readonly TopicCandidate[] => {
  const clusterScoreById = new Map(
    input.clusters.map((cluster) => [cluster.id, cluster.score] as const),
  );
  const seenNodeIds = new Set<string>();
  return input.candidates
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
};
