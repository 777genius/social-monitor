import {
  normalizeSemanticGroupId,
  retainedSemanticGroupIds,
} from "./agent-runtime-reader-summary-topic-group-policy";
import {
  readRecordArray,
  readStringArray,
  stringValue,
  optionalString,
  semanticLabelFromRaw,
} from "./agent-runtime-reader-summary-topic-raw-decoder";
import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  renderReaderSummaryTopicSemanticLabel,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";


import { completeRequiredGroundedTopicCohorts } from "./agent-runtime-reader-summary-topic-cohort-completion";
import { projectAgentRuntimeTopicGroups } from "./agent-runtime-reader-summary-topic-group-projection";
import { buildTopicNormalizationWarnings } from "./agent-runtime-reader-summary-topic-normalization-warnings";

export const normalizeAgentRuntimeReaderSummaryTopicLabelPlan = (
  raw: Record<string, unknown>,
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
): ReaderSummaryTopicLabelPlan => {
  const knownNodeIds = new Set(candidates.map((candidate) => candidate.nodeId));
  const candidateByNodeId = new Map(
    candidates.map((candidate) => [candidate.nodeId, candidate] as const),
  );
  const parsedNodeLabels = readRecordArray(raw.nodeLabels)
    .map((label) => {
      const nodeId = stringValue(label.nodeId);
      const semantic = semanticLabelFromRaw(
        label,
        candidateByNodeId.get(nodeId)?.fallbackLabel,
      );

      return {
        nodeId,
        topicId: optionalString(label.topicId),
        label: renderReaderSummaryTopicSemanticLabel(semantic),
        semantic,
        rawGroupId: optionalString(label.groupId),
        groupId: normalizeSemanticGroupId(optionalString(label.groupId)),
        keywords: readStringArray(label.keywords).slice(0, 8),
        rationale: optionalString(label.rationale),
      };
    })
    .filter((label) => knownNodeIds.has(label.nodeId));
  const returnedNodeIds = new Set(
    parsedNodeLabels.map((label) => label.nodeId),
  );
  if (
    returnedNodeIds.size !== parsedNodeLabels.length ||
    [...knownNodeIds].some((nodeId) => !returnedNodeIds.has(nodeId))
  ) {
    throw new Error(
      "Reader summary topic map response must label every requested node exactly once",
    );
  }
  const retainedGroupIds = retainedSemanticGroupIds(
    parsedNodeLabels,
    candidates,
  );
  const initialNodeLabels = parsedNodeLabels.map((label) => ({
    nodeId: label.nodeId,
    topicId: label.topicId,
    label: label.label,
    semantic: label.semantic,
    originalGroupId: label.groupId,
    groupId:
      retainedGroupIds.has(label.groupId) &&
      label.semantic.confidenceScore >=
        READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN
        ? label.groupId
        : READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
    keywords: label.keywords,
    rationale: label.rationale,
  }));
  const groupRecords = new Map<string, Record<string, unknown>>();
  for (const group of readRecordArray(raw.groups)) {
    const id = normalizeSemanticGroupId(optionalString(group.id));
    if (id !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID && !groupRecords.has(id)) {
      groupRecords.set(id, group);
    }
  }
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

export const parseAgentRuntimeReaderSummaryTopicLabelerJsonObject = (
  value: string,
): Record<string, unknown> => {
  const parsed = JSON.parse(value);

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Reader summary topic map response must be a JSON object");
  }

  return parsed as Record<string, unknown>;
};

