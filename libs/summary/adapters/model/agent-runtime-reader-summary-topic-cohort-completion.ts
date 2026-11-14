import type { ReaderSummaryTopicLabelPlan } from "../../domain";
import type { ReaderSummaryTopicLabelCandidate } from "../../ports";
import { buildGroundedTopicCohortsForCandidates } from "./agent-runtime-reader-summary-topic-grounded-cohorts";
import { selectGroundedCohortDisplays } from "./agent-runtime-reader-summary-topic-cohort-grounding";
import { applyGroundedCohortDisplays } from "./agent-runtime-reader-summary-topic-cohort-assignment";
import {
  collectExistingGroundedCohortIds,
  hasGroundedCohortCapacity,
  hasGroundedCohortMinimum,
} from "./agent-runtime-reader-summary-topic-cohort-admission";

export const completeRequiredGroundedTopicCohorts = (
  initialNodeLabels: ReaderSummaryTopicLabelPlan["nodeLabels"],
  candidates: readonly ReaderSummaryTopicLabelCandidate[],
  assignedGroupByNodeId: ReadonlyMap<string, string>,
): {
  readonly nodeLabels: ReaderSummaryTopicLabelPlan["nodeLabels"];
  readonly semanticAnchorsByGroup: ReadonlyMap<string, readonly string[]>;
  readonly displayByGroup: ReadonlyMap<string, string>;
  readonly recoveredNodeCount: number;
} => {
  let nodeLabels = [...initialNodeLabels];
  const candidateById = new Map(candidates.map((item) => [item.nodeId, item]));
  const semanticAnchorsByGroup = new Map<string, readonly string[]>();
  const displayByGroup = new Map<string, string>();
  const groupIds = collectExistingGroundedCohortIds(nodeLabels);
  let recoveredNodeCount = 0;
  for (const cohort of buildGroundedTopicCohortsForCandidates(candidates)) {
    if (!hasGroundedCohortCapacity(cohort.groupId, groupIds)) {
      continue;
    }
    const displayByNodeId = selectGroundedCohortDisplays({
      nodeLabels,
      cohort,
      candidateById,
      assignedGroupByNodeId,
    });
    // Existing eligible members of this exact cohort count toward the minimum.
    if (!hasGroundedCohortMinimum(displayByNodeId)) {
      continue;
    }
    const assignment = applyGroundedCohortDisplays(
      nodeLabels,
      cohort,
      displayByNodeId,
    );
    nodeLabels = assignment.nodeLabels;
    recoveredNodeCount += assignment.recoveredNodeCount;
    groupIds.add(cohort.groupId);
    displayByGroup.set(cohort.groupId, [...displayByNodeId.values()][0]!);
    semanticAnchorsByGroup.set(cohort.groupId, [cohort.sharedAnchor]);
  }

  return { nodeLabels, semanticAnchorsByGroup, displayByGroup, recoveredNodeCount };
};
