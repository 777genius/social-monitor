import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  type ReaderSummaryTopicNodeLabel,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { buildGroundedTopicRecoveryAnchorMaps } from "./agent-runtime-reader-summary-topic-anchor-keys";
import { assignNewGroundedTopicGroups } from "./agent-runtime-reader-summary-topic-group-creation";
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
  const { candidateByNodeId, anchorsByNodeId, identityAnchorsByNodeId } =
    buildGroundedTopicRecoveryAnchorMaps({
      nodeLabels: params.nodeLabels,
      candidates: params.candidates,
    });
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

  const assignment = assignNewGroundedTopicGroups({
    nodeLabels,
    identityAnchorsByNodeId,
    recoveryCandidates,
    activeGroupIds,
    semanticAnchorsByGroup,
    recoveredNodeIds,
    availableGroupSlots,
  });

  return {
    nodeLabels: assignment.nodeLabels,
    semanticAnchorsByGroup: assignment.semanticAnchorsByGroup,
    recoveredNodeCount: assignment.recoveredNodeIds.size,
  };
};

