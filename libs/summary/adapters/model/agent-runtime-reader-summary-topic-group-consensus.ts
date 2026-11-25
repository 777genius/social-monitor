import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  type ReaderSummaryTopicNodeLabel,
} from "../../domain";
import {
  anchorKeys,
  intersects,
  genericAnchors,
  noiseAnchors,
} from "./agent-runtime-reader-summary-topic-anchor-keys";

export const recoverIntoExistingGroups = (params: {
  readonly nodeLabels: readonly ReaderSummaryTopicNodeLabel[];
  readonly anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly semanticAnchorsByGroup: ReadonlyMap<string, readonly string[]>;
  readonly recoveredNodeIds: Set<string>;
}): readonly ReaderSummaryTopicNodeLabel[] => {
  const anchorsByGroup = new Map(
    [...params.semanticAnchorsByGroup].map(([groupId, anchors]) => [
      groupId,
      new Set([
        ...anchors.flatMap(anchorKeys),
        ...anchorKeys(groupId).filter(
          (anchor) => !genericAnchors.has(anchor) && !noiseAnchors.has(anchor),
        ),
      ]),
    ]),
  );

  return params.nodeLabels.map((label) => {
    if (label.groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID) {
      return label;
    }
    if (
      label.semantic !== undefined &&
      label.semantic.confidenceScore <
        READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN
    ) {
      return label;
    }
    const nodeAnchors = params.anchorsByNodeId.get(label.nodeId);
    const labelAnchors = new Set(anchorKeys(label.label ?? ""));
    const matchingGroupIds = [...anchorsByGroup]
      .filter(
        ([, groupAnchors]) =>
          intersects(nodeAnchors, groupAnchors) &&
          intersects(labelAnchors, groupAnchors),
      )
      .map(([groupId]) => groupId);
    if (matchingGroupIds.length !== 1) {
      return label;
    }
    params.recoveredNodeIds.add(label.nodeId);

    return { ...label, groupId: matchingGroupIds[0] };
  });
};

// Preserve the historical import surface for existing adapter consumers.
export { normalizeExistingGroups, supportedAnchorsForActiveGroups } from "./agent-runtime-reader-summary-topic-group-existing-admission";
export { sharedUngroupedAnchors } from "./agent-runtime-reader-summary-topic-anchor-support";
