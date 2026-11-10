import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  type ReaderSummaryTopicNodeLabel,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import {
  groundedNodeAnchors,
  identityAnchors,
  uniqueRecoveredGroupId,
} from "./agent-runtime-reader-summary-topic-anchor-keys";
import {
  recoverIntoExistingGroups,
  normalizeExistingGroups,
  supportedAnchorsForActiveGroups,
  sharedUngroupedAnchors,
} from "./agent-runtime-reader-summary-topic-group-consensus";

export type RecoveredTopicGroups = {
  readonly nodeLabels: readonly ReaderSummaryTopicNodeLabel[];
  readonly semanticAnchorsByGroup: ReadonlyMap<string, readonly string[]>;
  readonly recoveredNodeCount: number;
};

export const recoverGroundedTopicGroups = (params: {
  readonly nodeLabels: readonly ReaderSummaryTopicNodeLabel[];
  readonly candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][];
  readonly explicitAnchorsByGroup: ReadonlyMap<string, readonly string[]>;
}): RecoveredTopicGroups => {
  const candidateByNodeId = new Map(
    params.candidates.map(
      (candidate) => [candidate.nodeId, candidate] as const,
    ),
  );
  const anchorsByNodeId = new Map(
    params.nodeLabels.map((label) => [
      label.nodeId,
      groundedNodeAnchors(label, candidateByNodeId.get(label.nodeId)),
    ]),
  );
  const identityAnchorsByNodeId = new Map(
    params.nodeLabels.map((label) => [label.nodeId, identityAnchors(label)]),
  );
  let nodeLabels = normalizeExistingGroups({
    nodeLabels: params.nodeLabels,
    anchorsByNodeId,
    explicitAnchorsByGroup: params.explicitAnchorsByGroup,
  });
  const activeGroupIds = new Set(
    nodeLabels
      .map((label) => label.groupId)
      .filter(
        (groupId): groupId is string =>
          groupId !== undefined &&
          groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
      ),
  );
  const semanticAnchorsByGroup = supportedAnchorsForActiveGroups({
    nodeLabels,
    anchorsByNodeId,
    explicitAnchorsByGroup: params.explicitAnchorsByGroup,
  });
  const recoveredNodeIds = new Set<string>();
  nodeLabels = recoverIntoExistingGroups({
    nodeLabels,
    anchorsByNodeId,
    semanticAnchorsByGroup,
    recoveredNodeIds,
  });
  const availableGroupSlots = Math.max(
    0,
    READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS - activeGroupIds.size,
  );
  const recoveryCandidates = sharedUngroupedAnchors(
    nodeLabels,
    identityAnchorsByNodeId,
    candidateByNodeId,
  );

  for (const recovery of recoveryCandidates.slice(0, availableGroupSlots)) {
    const matchingNodeIds = nodeLabels
      .filter(
        (label) =>
          label.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID &&
          !recoveredNodeIds.has(label.nodeId) &&
          identityAnchorsByNodeId.get(label.nodeId)?.has(recovery.key) === true,
      )
      .map((label) => label.nodeId);
    if (matchingNodeIds.length < 2) {
      continue;
    }
    const groupId = uniqueRecoveredGroupId(
      recovery.display,
      new Set([...activeGroupIds, ...semanticAnchorsByGroup.keys()]),
    );
    const matchingNodeIdSet = new Set(matchingNodeIds);
    nodeLabels = nodeLabels.map((label) =>
      matchingNodeIdSet.has(label.nodeId) ? { ...label, groupId } : label,
    );
    matchingNodeIds.forEach((nodeId) => recoveredNodeIds.add(nodeId));
    activeGroupIds.add(groupId);
    semanticAnchorsByGroup.set(groupId, [recovery.display]);
  }

  return {
    nodeLabels,
    semanticAnchorsByGroup,
    recoveredNodeCount: recoveredNodeIds.size,
  };
};

