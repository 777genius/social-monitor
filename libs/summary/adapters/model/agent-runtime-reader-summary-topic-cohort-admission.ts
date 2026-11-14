import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";

/**
 * Recovery capacity is determined by the already admitted semantic groups.
 * Never count the reserved ungrouped bucket; an existing cohort may be
 * completed even when the maximum number of distinct groups is reached.
 */
export const collectExistingGroundedCohortIds = (
  nodeLabels: ReaderSummaryTopicLabelPlan["nodeLabels"],
): Set<string> => {
  const groupIds = new Set(nodeLabels.flatMap((label) =>
    label.groupId && label.groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID
      ? [label.groupId] : [],
  ));
  return groupIds;
};

export const hasGroundedCohortCapacity = (
  groupId: string,
  groupIds: ReadonlySet<string>,
): boolean =>
  groupIds.has(groupId) ||
  groupIds.size < READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS;

/**
 * Only two independently grounded node displays can justify a cohort.
 * Count eligible existing members too; do not require two new recoveries.
 */
export const hasGroundedCohortMinimum = (
  displayByNodeId: ReadonlyMap<string, string>,
): boolean => displayByNodeId.size >= 2;
