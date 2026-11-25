import { READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID, type ReaderSummaryTopicNodeLabel } from "../../domain";
import { identityAnchors, intersects } from "./agent-runtime-reader-summary-topic-anchor-keys";
import { supportedAnchors } from "./agent-runtime-reader-summary-topic-anchor-support";

/** Keep existing group membership/corroboration policy separate from recovery decisions. */
export const normalizeExistingGroups = (params: {
  readonly nodeLabels: readonly ReaderSummaryTopicNodeLabel[];
  readonly anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly explicitAnchorsByGroup: ReadonlyMap<string, readonly string[]>;
}): readonly ReaderSummaryTopicNodeLabel[] => {
  let labels = [...params.nodeLabels];
  const groupIds = new Set(
    labels
      .map((label) => label.groupId)
      .filter(
        (groupId): groupId is string =>
          groupId !== undefined &&
          groupId !== READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
      ),
  );
  for (const groupId of groupIds) {
    const groupLabels = labels.filter((label) => label.groupId === groupId);
    const supported = supportedAnchors(
      groupLabels.map((label) => label.nodeId),
      params.anchorsByNodeId,
      params.explicitAnchorsByGroup.get(groupId) ?? [],
    );
    labels = labels.map((label) =>
      label.groupId === groupId &&
      (!intersects(params.anchorsByNodeId.get(label.nodeId), supported) ||
        !intersects(identityAnchors(label), supported))
        ? { ...label, groupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID }
        : label,
    );
    if (labels.filter((label) => label.groupId === groupId).length < 2) {
      labels = labels.map((label) =>
        label.groupId === groupId
          ? { ...label, groupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID }
          : label,
      );
    }
  }

  return labels;
};

// Preserve exact historical export identity for callers of the old policy.
export { supportedAnchorsForActiveGroups } from "./agent-runtime-reader-summary-topic-active-anchors";
