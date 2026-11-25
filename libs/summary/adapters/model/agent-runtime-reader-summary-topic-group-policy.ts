import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { readerSummaryTopicLabelFromSlug } from "../../domain/services/reader-summary-topic-map-text";
import { retainedSemanticGroupIds } from "./agent-runtime-reader-summary-topic-group-support-policy";

export const normalizeSemanticGroupId = (value: string | undefined): string =>
  value !== undefined &&
  /^group:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) &&
  value !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID
    ? value
    : READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID;

export const semanticGroupLabelFromId = (groupId: string): string => {
  const [, rawValue = groupId] = groupId.split(":");

  return readerSummaryTopicLabelFromSlug(rawValue ?? "other-topics");
};

// Keep the historical import surface stable while group support/ranking
// has an independent policy owner from label projection.
export { retainedSemanticGroupIds } from "./agent-runtime-reader-summary-topic-group-support-policy";

/** Semantic admission is independent of untrusted response decoding and recovery. */
type ParsedTopicNodeLabel = Pick<
  ReaderSummaryTopicLabelPlan["nodeLabels"][number],
  "nodeId" | "topicId" | "label" | "keywords" | "rationale"
> & {
  readonly semantic: NonNullable<
    ReaderSummaryTopicLabelPlan["nodeLabels"][number]["semantic"]
  >;
  readonly groupId: string;
};

export const projectInitialTopicGroupAssignments = (
  parsedNodeLabels: readonly ParsedTopicNodeLabel[],
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
) => {
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
  return initialNodeLabels;
};
