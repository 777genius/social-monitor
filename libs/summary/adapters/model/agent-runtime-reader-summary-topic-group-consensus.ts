import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  type ReaderSummaryTopicNodeLabel,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { formatReaderSummaryTopicToken } from "../../domain/services/reader-summary-topic-map-text";
import {
  anchorKeys,
  identityAnchors,
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

const supportedAnchors = (
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
  const ungroupedIds = labels
    .filter(
      (label) =>
        label.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID &&
        (label.semantic === undefined ||
          label.semantic.confidenceScore >=
            READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN),
    )
    .map((label) => label.nodeId);
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
  for (const nodeId of nodeIds) {
    for (const anchor of anchorsByNodeId.get(nodeId) ?? []) {
      support.set(anchor, (support.get(anchor) ?? 0) + 1);
    }
  }

  return support;
};

