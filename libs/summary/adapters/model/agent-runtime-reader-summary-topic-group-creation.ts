import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  type ReaderSummaryTopicNodeLabel,
} from "../../domain";
import { uniqueRecoveredGroupId } from "./agent-runtime-reader-summary-topic-anchor-keys";

/**
 * Assign only new, evidence-supported groups. Recovery orchestration determines
 * which anchors are supported and the available slots; assignment owns membership
 * projection and collision-safe group ids without mutating its inputs.
 */
export const assignNewGroundedTopicGroups = (params: {
  readonly nodeLabels: readonly ReaderSummaryTopicNodeLabel[];
  readonly identityAnchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly recoveryCandidates: readonly {
    readonly key: string;
    readonly display: string;
  }[];
  readonly activeGroupIds: ReadonlySet<string>;
  readonly semanticAnchorsByGroup: ReadonlyMap<string, readonly string[]>;
  readonly recoveredNodeIds: ReadonlySet<string>;
  readonly availableGroupSlots: number;
}): {
  readonly nodeLabels: readonly ReaderSummaryTopicNodeLabel[];
  readonly semanticAnchorsByGroup: ReadonlyMap<string, readonly string[]>;
  readonly recoveredNodeIds: ReadonlySet<string>;
} => {
  let nodeLabels = params.nodeLabels;
  const activeGroupIds = new Set(params.activeGroupIds);
  const semanticAnchorsByGroup = new Map(params.semanticAnchorsByGroup);
  const recoveredNodeIds = new Set(params.recoveredNodeIds);

  // Preserve the original candidate-window policy: an invalid candidate still
  // consumes its ranked opportunity rather than promoting a later candidate.
  for (const recovery of params.recoveryCandidates.slice(0, params.availableGroupSlots)) {
    const matchingNodeIds = nodeLabels
      .filter(
        (label) =>
          label.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID &&
          !recoveredNodeIds.has(label.nodeId) &&
          params.identityAnchorsByNodeId.get(label.nodeId)?.has(recovery.key) === true,
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

  return { nodeLabels, semanticAnchorsByGroup, recoveredNodeIds };
};
