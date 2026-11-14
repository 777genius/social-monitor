import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  type ReaderSummaryTopicNodeLabel,
} from "../../domain";
import { formatReaderSummaryTopicToken } from "../../domain/services/reader-summary-topic-map-text";
import {
  anchorKeys,
  identityAnchors,
  intersects,
  genericAnchors,
  noiseAnchors,
} from "./agent-runtime-reader-summary-topic-anchor-keys";
import { supportedAnchors } from "./agent-runtime-reader-summary-topic-anchor-support";

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

export const normalizeExistingGroups = (params: {
  readonly nodeLabels: readonly ReaderSummaryTopicNodeLabel[];
  readonly anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly explicitAnchorsByGroup: ReadonlyMap<string, readonly string[]>;
}): readonly ReaderSummaryTopicNodeLabel[] => {
  let labels = [...params.nodeLabels];
  const groupIds = new Set(
    labels
      .map((label) => label.groupId)
      .filter(
        (groupId): groupId is string =>
          groupId !== undefined &&
          groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
      ),
  );
  for (const groupId of groupIds) {
    const groupLabels = labels.filter((label) => label.groupId === groupId);
    const supported = supportedAnchors(
      groupLabels.map((label) => label.nodeId),
      params.anchorsByNodeId,
      params.explicitAnchorsByGroup.get(groupId) ?? [],
    );
    labels = labels.map((label) =>
      label.groupId === groupId &&
      (!intersects(params.anchorsByNodeId.get(label.nodeId), supported) ||
        !intersects(identityAnchors(label), supported))
        ? { ...label, groupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID }
        : label,
    );
    if (labels.filter((label) => label.groupId === groupId).length < 2) {
      labels = labels.map((label) =>
        label.groupId === groupId
          ? { ...label, groupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID }
          : label,
      );
    }
  }

  return labels;
};

export const supportedAnchorsForActiveGroups = (params: {
  readonly nodeLabels: readonly ReaderSummaryTopicNodeLabel[];
  readonly anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly explicitAnchorsByGroup: ReadonlyMap<string, readonly string[]>;
}): Map<string, readonly string[]> => {
  const result = new Map<string, readonly string[]>();
  for (const groupId of new Set(
    params.nodeLabels.map((label) => label.groupId),
  )) {
    if (
      groupId === undefined ||
      groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID
    ) {
      continue;
    }
    result.set(
      groupId,
      [
        ...supportedAnchors(
          params.nodeLabels
            .filter((label) => label.groupId === groupId)
            .map((label) => label.nodeId),
          params.anchorsByNodeId,
          params.explicitAnchorsByGroup.get(groupId) ?? [],
        ),
      ].map(formatReaderSummaryTopicToken),
    );
  }

  return result;
};


export { sharedUngroupedAnchors } from "./agent-runtime-reader-summary-topic-anchor-support";
