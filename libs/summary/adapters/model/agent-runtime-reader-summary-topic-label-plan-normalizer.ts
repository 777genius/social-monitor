import {
  normalizeSemanticGroupId,
  semanticGroupLabelFromId,
  retainedSemanticGroupIds,
} from "./agent-runtime-reader-summary-topic-group-policy";
import {
  readRecordArray,
  readStringArray,
  stringValue,
  optionalString,
  semanticLabelFromRaw,
} from "./agent-runtime-reader-summary-topic-raw-decoder";
import { recoverSemanticGroupAnchors } from "./agent-runtime-reader-summary-topic-anchor-recovery";
import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  renderReaderSummaryTopicSemanticLabel,
  type ReaderSummaryTopicSemanticLabel,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";


import { evaluateTopicLabelQuality } from "../../domain/services/reader-summary-topic-map-label-quality";
import { completeRequiredGroundedTopicCohorts } from "./agent-runtime-reader-summary-topic-cohort-completion";

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
  const finalGroupIds = new Set(
    nodeLabels
      .map((label) => label.groupId)
      .filter(
        (groupId): groupId is string =>
          groupId !== undefined &&
          groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
      ),
  );
  const groups = [...finalGroupIds].map((id) => {
    const group = groupRecords.get(id);
    const proposedLabel = group === undefined
      ? semanticGroupLabelFromId(id) : stringValue(group.label);
    const explicitAnchors =
      group === undefined ? [] : readStringArray(group.semanticAnchors);
    const recoveredAnchors = recoverSemanticGroupAnchors({
      groupId: id,
      nodeLabels,
      candidates,
    });

    return {
      id,
      label: evaluateTopicLabelQuality(proposedLabel).accepted
        ? proposedLabel : recovery.displayByGroup.get(id) ?? proposedLabel,
      recoveredDisplayLabel: recovery.displayByGroup.get(id),
      semanticAnchors: uniqueStrings([
        ...explicitAnchors,
        ...(recovery.semanticAnchorsByGroup.get(id) ?? []),
        ...recoveredAnchors,
        semanticGroupLabelFromId(id),
      ]).slice(0, 8),
      nodeIds: nodeLabels
        .filter((label) => label.groupId === id)
        .map((label) => label.nodeId),
      confidenceScore:
        group === undefined ? 0.5 : numberValue(group.confidenceScore),
      rationale:
        group === undefined
          ? "Recovered from consistent node group assignments"
          : optionalString(group.rationale),
    };
  });
  const recoveredGroupCount = [...finalGroupIds].filter(
    (groupId) => !groupRecords.has(groupId),
  ).length;
  const recoveredAnchorGroupCount = groups.filter((group) => {
    const explicit = readStringArray(
      groupRecords.get(group.id)?.semanticAnchors,
    );

    return explicit.length < 2 && group.semanticAnchors.length >= 2;
  }).length;
  const normalizedAwayCount = nodeLabels.filter(
    (label) =>
      label.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID &&
      parsedNodeLabels.find((candidate) => candidate.nodeId === label.nodeId)
        ?.rawGroupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  ).length;
  const lowConfidenceCount = parsedNodeLabels.filter(
    (label) =>
      label.semantic.confidenceScore <
      READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  ).length;

  return {
    nodeLabels,
    groups,
    warnings: [
      ...readStringArray(raw.warnings),
      ...(lowConfidenceCount > 0
        ? [
            `${lowConfidenceCount} low-confidence topic assignments were kept ungrouped`,
          ]
        : []),
      ...(normalizedAwayCount > 0
        ? [
            `${normalizedAwayCount} topic assignments exceeded the semantic group contract and were marked ungrouped`,
          ]
        : []),
      ...(recoveredGroupCount > 0
        ? [
            `${recoveredGroupCount} semantic group definitions were recovered from canonical node assignments`,
          ]
        : []),
      ...(recoveredAnchorGroupCount > 0
        ? [
            `${recoveredAnchorGroupCount} semantic group anchor sets were recovered from shared node evidence`,
          ]
        : []),
      ...(recovery.recoveredNodeCount > 0
        ? [
            `${recovery.recoveredNodeCount} ungrouped topic assignments were recovered from shared grounded anchors`,
          ]
        : []),
    ],
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

