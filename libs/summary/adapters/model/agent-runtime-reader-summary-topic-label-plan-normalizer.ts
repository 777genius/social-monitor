import { projectInitialTopicGroupAssignments } from "./agent-runtime-reader-summary-topic-group-policy";
import {
  readCompleteTopicNodeLabels,
  readUniqueTopicGroupRecords,
} from "./agent-runtime-reader-summary-topic-untrusted-response";
import type { ReaderSummaryTopicLabelPlan } from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";


import { completeRequiredGroundedTopicCohorts } from "./agent-runtime-reader-summary-topic-cohort-completion";
import { projectAgentRuntimeTopicGroups } from "./agent-runtime-reader-summary-topic-group-projection";
import { buildTopicNormalizationWarnings } from "./agent-runtime-reader-summary-topic-normalization-warnings";

export const normalizeAgentRuntimeReaderSummaryTopicLabelPlan = (
  raw: Record<string, unknown>,
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
): ReaderSummaryTopicLabelPlan => {
  const parsedNodeLabels = readCompleteTopicNodeLabels(raw.nodeLabels, candidates);
  const initialNodeLabels = projectInitialTopicGroupAssignments(
    parsedNodeLabels,
    candidates,
  );
  const groupRecords = readUniqueTopicGroupRecords(raw.groups);
  const recovery = completeRequiredGroundedTopicCohorts(
    initialNodeLabels,
    candidates,
    new Map(parsedNodeLabels.map((label) => [label.nodeId, label.groupId])),
  );
  const nodeLabels = recovery.nodeLabels;
  const { groups, finalGroupIds } = projectAgentRuntimeTopicGroups(recovery, candidates, groupRecords);
  return {
    nodeLabels,
    groups,
    warnings: buildTopicNormalizationWarnings({
      raw, parsedNodeLabels, nodeLabels, groups, finalGroupIds, groupRecords, recovery,
    }),
  };
};

export { parseAgentRuntimeReaderSummaryTopicLabelerJsonObject } from "./agent-runtime-reader-summary-topic-untrusted-response";
