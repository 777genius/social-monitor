import {
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import { normalizeTopicLabel } from "../../domain/services/reader-summary-topic-map-text";
import type { GroundedTopicCohort } from "./agent-runtime-reader-summary-cohort-grouping";

/**
 * Apply an already identity-grounded cohort match. Admission, group limits and
 * conflicting membership remain the caller's responsibility.
 */
export const applyGroundedCohortDisplays = (
  nodeLabels: ReaderSummaryTopicLabelPlan["nodeLabels"],
  cohort: Pick<GroundedTopicCohort, "groupId" | "sharedAnchor">,
  displayByNodeId: ReadonlyMap<string, string>,
): {
  readonly nodeLabels: ReaderSummaryTopicLabelPlan["nodeLabels"][number][];
  readonly recoveredNodeCount: number;
} => {
  let recoveredNodeCount = 0;
  const assigned = nodeLabels.map((label) => {
    const display = displayByNodeId.get(label.nodeId);
    if (display === undefined) {
      return label;
    }
    if (label.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID) {
      recoveredNodeCount += 1;
    }
    return {
      ...label,
      groupId: cohort.groupId,
      keywords: [display, ...(label.keywords ?? []).filter((keyword) =>
        normalizeTopicLabel(keyword) !== cohort.sharedAnchor,
      )].slice(0, 8),
    };
  });

  return { nodeLabels: assigned, recoveredNodeCount };
};
