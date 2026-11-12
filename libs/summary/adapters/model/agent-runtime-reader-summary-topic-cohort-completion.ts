import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import type { ReaderSummaryTopicLabelCandidate } from "../../ports";
import { buildGroundedTopicCohortsForCandidates } from "./agent-runtime-reader-summary-topic-grounded-cohorts";
import { selectGroundedCohortDisplays } from "./agent-runtime-reader-summary-topic-cohort-grounding";
import { applyGroundedCohortDisplays } from "./agent-runtime-reader-summary-topic-cohort-assignment";

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
  const groupIds = new Set(nodeLabels.flatMap((label) =>
    label.groupId && label.groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID
      ? [label.groupId] : [],
  ));
  let recoveredNodeCount = 0;
  for (const cohort of buildGroundedTopicCohortsForCandidates(candidates)) {
    if (!groupIds.has(cohort.groupId) &&
        groupIds.size >= READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS) {
      continue;
    }
    const displayByNodeId = selectGroundedCohortDisplays({
      nodeLabels,
      cohort,
      candidateById,
      assignedGroupByNodeId,
    });
    // Existing eligible members of this exact cohort count toward the minimum.
    if (displayByNodeId.size < 2) {
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
