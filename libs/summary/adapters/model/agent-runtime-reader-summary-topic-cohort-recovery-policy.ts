import type { ReaderSummaryTopicLabelPlan } from "../../domain";
import type { ReaderSummaryTopicLabelCandidate } from "../../ports";
import type { GroundedTopicCohort } from "./agent-runtime-reader-summary-cohort-grouping";
import {
  hasGroundedCohortCapacity,
  hasGroundedCohortMinimum,
} from "./agent-runtime-reader-summary-topic-cohort-admission";
import { selectGroundedCohortDisplays } from "./agent-runtime-reader-summary-topic-cohort-grounding";
import { applyGroundedCohortDisplays } from "./agent-runtime-reader-summary-topic-cohort-assignment";

/**
 * One cohort's fail-closed admission and immutable assignment. The batch
 * coordinator owns only cross-cohort state and publication order.
 */
export const recoverEligibleGroundedTopicCohort = (params: {
  readonly nodeLabels: ReaderSummaryTopicLabelPlan["nodeLabels"];
  readonly cohort: GroundedTopicCohort;
  readonly candidateById: ReadonlyMap<string, ReaderSummaryTopicLabelCandidate>;
  readonly assignedGroupByNodeId: ReadonlyMap<string, string>;
  readonly activeGroupIds: ReadonlySet<string>;
}): {
  readonly nodeLabels: ReaderSummaryTopicLabelPlan["nodeLabels"];
  readonly recoveredNodeCount: number;
  readonly display: string;
} | undefined => {
  if (!hasGroundedCohortCapacity(params.cohort.groupId, params.activeGroupIds)) {
    return undefined;
  }
  const displays = selectGroundedCohortDisplays(params);
  if (!hasGroundedCohortMinimum(displays)) return undefined;
  const firstDisplay = displays.values().next();
  if (firstDisplay.done) return undefined;

  const assignment = applyGroundedCohortDisplays(
    params.nodeLabels,
    params.cohort,
    displays,
  );
  return { ...assignment, display: firstDisplay.value };
};
