import type { ReaderSummaryTopicLabelPlan } from "../../domain";
import type { ReaderSummaryTopicLabelCandidate } from "../../ports";
import { buildGroundedTopicCohortsForCandidates } from "./agent-runtime-reader-summary-topic-grounded-cohorts";
import { indexUniqueReaderSummaryTopicCandidates } from "./agent-runtime-reader-summary-topic-candidate-index";
import { collectExistingGroundedCohortIds } from "./agent-runtime-reader-summary-topic-cohort-admission";
import { recoverEligibleGroundedTopicCohort } from "./agent-runtime-reader-summary-topic-cohort-recovery-policy";

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
  let nodeLabels: ReaderSummaryTopicLabelPlan["nodeLabels"] = [...initialNodeLabels];
  const candidateById = indexUniqueReaderSummaryTopicCandidates(candidates);
  const semanticAnchorsByGroup = new Map<string, readonly string[]>();
  const displayByGroup = new Map<string, string>();
  const groupIds = collectExistingGroundedCohortIds(nodeLabels);
  let recoveredNodeCount = 0;
  for (const cohort of buildGroundedTopicCohortsForCandidates(candidates)) {
    const recovery = recoverEligibleGroundedTopicCohort({
      nodeLabels,
      cohort,
      candidateById,
      assignedGroupByNodeId,
      activeGroupIds: groupIds,
    });
    if (recovery === undefined) continue;
    nodeLabels = recovery.nodeLabels;
    recoveredNodeCount += recovery.recoveredNodeCount;
    groupIds.add(cohort.groupId);
    displayByGroup.set(cohort.groupId, recovery.display);
    semanticAnchorsByGroup.set(cohort.groupId, [cohort.sharedAnchor]);
  }

  return { nodeLabels, semanticAnchorsByGroup, displayByGroup, recoveredNodeCount };
};
