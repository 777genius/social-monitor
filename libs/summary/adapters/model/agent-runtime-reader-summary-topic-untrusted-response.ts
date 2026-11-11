import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  renderReaderSummaryTopicSemanticLabel,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { normalizeSemanticGroupId } from "./agent-runtime-reader-summary-topic-group-policy";
import {
  readRecordArray,
  readStringArray,
  stringValue,
  optionalString,
  semanticLabelFromRaw,
} from "./agent-runtime-reader-summary-topic-raw-decoder";

type TopicCandidate = ReaderSummaryTopicLabelerInput["candidates"][number];

/** Reject missing or duplicate requested identities before any grouping decision.
 * Provider-supplied identity and relation authority are deliberately ignored.
 */
export const readCompleteTopicNodeLabels = (
  rawNodeLabels: unknown,
  candidates: readonly TopicCandidate[],
) => {
  const knownNodeIds = new Set(candidates.map((candidate) => candidate.nodeId));
  const candidateByNodeId = new Map(
    candidates.map((candidate) => [candidate.nodeId, candidate] as const),
  );
  const parsedNodeLabels = readRecordArray(rawNodeLabels)
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
  return parsedNodeLabels;
};

/** Only the first definition for a valid group ID can supply display metadata. */
export const readUniqueTopicGroupRecords = (
  rawGroups: unknown,
): Map<string, Record<string, unknown>> => {
  const groupRecords = new Map<string, Record<string, unknown>>();
  for (const group of readRecordArray(rawGroups)) {
    const id = normalizeSemanticGroupId(optionalString(group.id));
    if (id !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID && !groupRecords.has(id)) {
      groupRecords.set(id, group);
    }
  }
  return groupRecords;
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

