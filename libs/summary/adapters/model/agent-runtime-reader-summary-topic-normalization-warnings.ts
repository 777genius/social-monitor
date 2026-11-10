import { READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID, READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN } from "../../domain";
import { readStringArray } from "./agent-runtime-reader-summary-topic-raw-decoder";

export type TopicNormalizationWarningInput = {
  readonly raw: Readonly<Record<string, unknown>>;
  readonly parsedNodeLabels: readonly {
    readonly nodeId: string;
    readonly rawGroupId: string | undefined;
    readonly semantic: { readonly confidenceScore: number };
  }[];
  readonly nodeLabels: readonly { readonly nodeId: string; readonly groupId?: string }[];
  readonly groups: readonly { readonly id: string; readonly semanticAnchors: readonly string[] }[];
  readonly finalGroupIds: ReadonlySet<string>;
  readonly groupRecords: ReadonlyMap<string, Record<string, unknown>>;
  readonly recovery: { readonly recoveredNodeCount: number };
};

/** Preserve stable diagnostic ordering after all grouping/recovery decisions. */
export const buildTopicNormalizationWarnings = ({
  raw, parsedNodeLabels, nodeLabels, groups, finalGroupIds, groupRecords, recovery,
}: TopicNormalizationWarningInput): readonly string[] => {
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

  return [
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
    ];
};
