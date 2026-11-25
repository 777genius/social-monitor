import type { ReaderSummaryTopicLabelPlan } from "../../domain";
import { READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID } from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { semanticGroupLabelFromId } from "./agent-runtime-reader-summary-topic-group-policy";
import { numberValue, optionalString, readStringArray, stringValue } from "./agent-runtime-reader-summary-topic-raw-decoder";
import { recoverSemanticGroupAnchors, uniqueStrings } from "./agent-runtime-reader-summary-topic-anchor-recovery";
import { evaluateTopicLabelQuality } from "../../domain/services/reader-summary-topic-map-label-quality";
import type { completeRequiredGroundedTopicCohorts } from "./agent-runtime-reader-summary-topic-cohort-completion";

/** Project vetted canonical node assignments into display-only group records. */
export const projectAgentRuntimeTopicGroups = (
  recovery: ReturnType<typeof completeRequiredGroundedTopicCohorts>,
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
  groupRecords: ReadonlyMap<string, Record<string, unknown>>,
): { readonly groups: readonly (ReaderSummaryTopicLabelPlan["groups"][number] & { readonly semanticAnchors: readonly string[] })[]; readonly finalGroupIds: ReadonlySet<string> } => {
  const nodeLabels = recovery.nodeLabels;
  const finalGroupIds = new Set(
    nodeLabels
      .map((label) => label.groupId)
      .filter(
        (groupId): groupId is string =>
          groupId !== undefined &&
          groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
      ),
  );
  const groups = [...finalGroupIds].map((id) => {
    const group = groupRecords.get(id);
    const proposedLabel = group === undefined
      ? semanticGroupLabelFromId(id) : stringValue(group.label);
    const explicitAnchors =
      group === undefined ? [] : readStringArray(group.semanticAnchors);
    const recoveredAnchors = recoverSemanticGroupAnchors({
      groupId: id,
      nodeLabels,
      candidates,
    });

    return {
      id,
      label: evaluateTopicLabelQuality(proposedLabel).accepted
        ? proposedLabel : recovery.displayByGroup.get(id) ?? proposedLabel,
      recoveredDisplayLabel: recovery.displayByGroup.get(id),
      semanticAnchors: uniqueStrings([
        ...explicitAnchors,
        ...(recovery.semanticAnchorsByGroup.get(id) ?? []),
        ...recoveredAnchors,
        semanticGroupLabelFromId(id),
      ]).slice(0, 8),
      nodeIds: nodeLabels
        .filter((label) => label.groupId === id)
        .map((label) => label.nodeId),
      confidenceScore:
        group === undefined ? 0.5 : numberValue(group.confidenceScore),
      rationale:
        group === undefined
          ? "Recovered from consistent node group assignments"
          : optionalString(group.rationale),
    };
  });
  return { groups, finalGroupIds };
};
