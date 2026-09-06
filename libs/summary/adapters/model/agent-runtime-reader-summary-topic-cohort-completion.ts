import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import { evaluateTopicLabelQuality } from "../../domain/services/reader-summary-topic-map-label-quality";
import { normalizeTopicLabel } from "../../domain/services/reader-summary-topic-map-text";
import type { ReaderSummaryTopicLabelCandidate } from "../../ports";
import { buildGroundedTopicCohortsForCandidates } from "./agent-runtime-reader-summary-topic-grounded-cohorts";

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
    // Existing eligible members of this exact cohort count toward the minimum.
    if (displayByNodeId.size < 2) {
      continue;
    }
    nodeLabels = nodeLabels.map((label) => {
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
    groupIds.add(cohort.groupId);
    displayByGroup.set(cohort.groupId, [...displayByNodeId.values()][0]!);
    semanticAnchorsByGroup.set(cohort.groupId, [cohort.sharedAnchor]);
  }

  return { nodeLabels, semanticAnchorsByGroup, displayByGroup, recoveredNodeCount };
};
