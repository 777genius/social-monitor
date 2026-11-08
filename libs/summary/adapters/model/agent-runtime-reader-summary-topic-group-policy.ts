import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { readerSummaryTopicLabelFromSlug } from "../../domain/services/reader-summary-topic-map-text";

export const normalizeSemanticGroupId = (value: string | undefined): string =>
  value !== undefined &&
  /^group:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) &&
  value !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID
    ? value
    : READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID;

export const semanticGroupLabelFromId = (groupId: string): string => {
  const [, rawValue = groupId] = groupId.split(":");

  return readerSummaryTopicLabelFromSlug(rawValue ?? "other-topics");
};

export const retainedSemanticGroupIds = (
  nodeLabels: readonly { readonly nodeId: string; readonly groupId: string }[],
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
): ReadonlySet<string> => {
  const candidateScoreById = new Map(
    candidates.map((candidate) => [candidate.nodeId, candidate.score] as const),
  );
  const stats = new Map<string, { count: number; score: number }>();
  for (const label of nodeLabels) {
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

