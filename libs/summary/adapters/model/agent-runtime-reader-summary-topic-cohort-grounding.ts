import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import { evaluateTopicLabelQuality } from "../../domain/services/reader-summary-topic-map-label-quality";
import { normalizeTopicLabel } from "../../domain/services/reader-summary-topic-map-text";
import type { ReaderSummaryTopicLabelCandidate } from "../../ports";
import type { GroundedTopicCohort } from "./agent-runtime-reader-summary-cohort-grouping";

/** Match cohort members only to identity-grounded display tokens, never model keywords. */
export const selectGroundedCohortDisplays = (params: {
  readonly nodeLabels: ReaderSummaryTopicLabelPlan["nodeLabels"];
  readonly cohort: GroundedTopicCohort;
  readonly candidateById: ReadonlyMap<string, ReaderSummaryTopicLabelCandidate>;
  readonly assignedGroupByNodeId: ReadonlyMap<string, string>;
}): ReadonlyMap<string, string> => {
  const { nodeLabels, cohort, candidateById, assignedGroupByNodeId } = params;
  const displayByNodeId = new Map<string, string>();
  for (const label of nodeLabels) {
    const originalGroup = assignedGroupByNodeId.get(label.nodeId);
    if (!cohort.nodeIds.includes(label.nodeId) ||
        (label.semantic?.confidenceScore ?? 0) < READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN ||
        (label.groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID && label.groupId !== cohort.groupId) ||
        (originalGroup !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID && originalGroup !== cohort.groupId)) {
      continue;
    }
    const candidate = candidateById.get(label.nodeId);
    // Preserve the display token from candidate identity evidence, never from
    // model keywords or incidental alternatives. Grounding still runs later.
    const sourceToken = candidate?.fallbackLabel.match(/[A-Za-z0-9]+/gu)?.find((token) =>
      normalizeTopicLabel(token) === cohort.sharedAnchor,
    );
    const display = sourceToken === undefined || candidate === undefined
      ? undefined
      : [sourceToken, cohort.label].find((token) =>
          evaluateTopicLabelQuality(token, {
            evidenceTexts: [candidate.fallbackLabel],
          }).accepted,
        );
    if (display !== undefined) {
      displayByNodeId.set(label.nodeId, display);
    }
  }
  return displayByNodeId;
};
