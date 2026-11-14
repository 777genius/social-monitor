import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";

/** Independent, candidate-grounded group support and stable ranking policy.
 * Assignment confidence and untrusted response decoding remain separate.
 */
export const retainedSemanticGroupIds = (
  nodeLabels: readonly { readonly nodeId: string; readonly groupId: string }[],
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
): ReadonlySet<string> => {
  const candidateScoreById = new Map(
    candidates.map((candidate) => [candidate.nodeId, candidate.score] as const),
  );
  const stats = new Map<string, { count: number; score: number }>();
  const seenNodeIds = new Set<string>();
  for (const label of nodeLabels) {
    // Never let duplicate or unknown model node identities fabricate support.
    if (seenNodeIds.has(label.nodeId) || !candidateScoreById.has(label.nodeId)) {
      continue;
    }
    seenNodeIds.add(label.nodeId);
    if (label.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID) {
      continue;
    }
    const current = stats.get(label.groupId) ?? { count: 0, score: 0 };
    stats.set(label.groupId, {
      count: current.count + 1,
      score: current.score + (candidateScoreById.get(label.nodeId) ?? 0),
    });
  }

  return new Set(
    [...stats.entries()]
      .filter(([, stats]) => stats.count >= 2)
      .sort((left, right) => {
        const byCount = right[1].count - left[1].count;
        if (byCount !== 0) {
          return byCount;
        }
        const byScore = right[1].score - left[1].score;

        return byScore !== 0 ? byScore : left[0].localeCompare(right[0]);
      })
      .slice(0, READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS)
      .map(([groupId]) => groupId),
  );
};

