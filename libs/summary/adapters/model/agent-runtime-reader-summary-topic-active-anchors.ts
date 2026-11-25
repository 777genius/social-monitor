import { READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID, type ReaderSummaryTopicNodeLabel } from "../../domain";
import { formatReaderSummaryTopicToken } from "../../domain/services/reader-summary-topic-map-text";
import { supportedAnchors } from "./agent-runtime-reader-summary-topic-anchor-support";

/**
 * Publication-only projection of anchors corroborated by the final active
 * membership. It cannot admit a group member or rescue a rejected singleton.
 */
export const supportedAnchorsForActiveGroups = (params: {
  readonly nodeLabels: readonly ReaderSummaryTopicNodeLabel[];
  readonly anchorsByNodeId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly explicitAnchorsByGroup: ReadonlyMap<string, readonly string[]>;
}): Map<string, readonly string[]> => {
  const result = new Map<string, readonly string[]>();
  for (const groupId of new Set(
    params.nodeLabels.map((label) => label.groupId),
  )) {
    if (
      groupId === undefined ||
      groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID
    ) {
      continue;
    }
    result.set(
      groupId,
      [
        ...supportedAnchors(
          params.nodeLabels
            .filter((label) => label.groupId === groupId)
            .map((label) => label.nodeId),
          params.anchorsByNodeId,
          params.explicitAnchorsByGroup.get(groupId) ?? [],
        ),
      ].map(formatReaderSummaryTopicToken),
    );
  }

  return result;
};
