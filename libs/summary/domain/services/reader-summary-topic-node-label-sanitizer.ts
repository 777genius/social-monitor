import type { ReaderSummaryTopicNodeLabel } from "./reader-summary-topic-label-plan";
import { sanitizeReaderSummaryTopicSemanticLabel } from "./reader-summary-topic-claim-label-policy";
import {
  isWeakTopicLabel,
  sanitizeTopicId,
  sanitizeTopicLabel,
} from "./reader-summary-topic-map-label-quality";
import { compactOptional } from "./reader-summary-topic-map-text";

export const sanitizeTopicNodeLabel = (
  label: ReaderSummaryTopicNodeLabel,
): ReaderSummaryTopicNodeLabel => ({
  nodeId: label.nodeId,
  topicId: label.relationIdentity === undefined ? sanitizeTopicId(label.topicId) : label.topicId,
  relationIdentity: label.relationIdentity,
  label: sanitizeTopicLabel(label.label),
  semantic: sanitizeReaderSummaryTopicSemanticLabel(label.semantic),
  originalGroupId: label.originalGroupId,
  groupId: sanitizeTopicId(label.groupId),
  keywords: (label.keywords ?? [])
    .map(compactOptional)
    .filter((keyword): keyword is string => keyword !== undefined)
    .filter((keyword) => !isWeakTopicLabel(keyword))
    .slice(0, 8),
  rationale: compactOptional(label.rationale),
});
