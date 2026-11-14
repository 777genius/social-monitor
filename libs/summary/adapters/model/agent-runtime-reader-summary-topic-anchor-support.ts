import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  type ReaderSummaryTopicNodeLabel,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { formatReaderSummaryTopicToken } from "../../domain/services/reader-summary-topic-map-text";
import { anchorKeys, genericAnchors } from "./agent-runtime-reader-summary-topic-anchor-keys";

export const supportedAnchors = (
  nodeIds: readonly string[],
  anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>,
  explicitAnchors: readonly string[],
): ReadonlySet<string> => {
  const support = anchorSupport(nodeIds, anchorsByNodeId);
  const explicit = explicitAnchors.flatMap(anchorKeys);

  return new Set(
    [...new Set([...support.keys(), ...explicit])].filter(
      (anchor) =>
        !genericAnchors.has(anchor) && (support.get(anchor) ?? 0) >= 2,
    ),
  );
};

export const sharedUngroupedAnchors = (
  labels: readonly ReaderSummaryTopicNodeLabel[],
  anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>,
  candidateByNodeId: ReadonlyMap<
    string,
    ReaderSummaryTopicLabelerInput["candidates"][number]
  >,
): readonly {
  readonly key: string;
  readonly display: string;
  readonly score: number;
}[] => {
  const ungroupedIds = [...new Set(labels
    .filter(
      (label) =>
        label.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID &&
        (label.semantic === undefined ||
          label.semantic.confidenceScore >=
            READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN),
    )
    .map((label) => label.nodeId))];
  const support = anchorSupport(ungroupedIds, anchorsByNodeId);

  return [...support.entries()]
    .filter(([anchor, count]) => count >= 2 && !genericAnchors.has(anchor))
    .map(([key, count]) => ({
      key,
      display: formatReaderSummaryTopicToken(key),
      score:
        count * 1000 +
        ungroupedIds
          .filter((nodeId) => anchorsByNodeId.get(nodeId)?.has(key))
          .reduce(
            (total, nodeId) =>
              total + (candidateByNodeId.get(nodeId)?.score ?? 0),
            0,
          ),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.key.localeCompare(right.key),
    );
};

const anchorSupport = (
  nodeIds: readonly string[],
  anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, number> => {
  const support = new Map<string, number>();
  for (const nodeId of new Set(nodeIds)) {
    for (const anchor of anchorsByNodeId.get(nodeId) ?? []) {
      support.set(anchor, (support.get(anchor) ?? 0) + 1);
    }
  }

  return support;
};

