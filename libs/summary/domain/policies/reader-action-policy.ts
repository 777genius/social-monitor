import type { ReaderAction } from "../entities/reader-action";
import type { TopRead, TopicHighlight } from "../entities/top-read";
import type { ReaderSummaryQualityState } from "../value-objects/summary-quality";
import { topicTitle } from "../value-objects/summary-text";

export type ReaderActionPolicyInput = {
  readonly topReads: readonly TopRead[];
  readonly topicHighlights: readonly TopicHighlight[];
  readonly qualityState: ReaderSummaryQualityState;
};

export const buildReaderActions = (
  input: ReaderActionPolicyInput,
): readonly ReaderAction[] => {
  const actions: ReaderAction[] = input.topReads.slice(0, 3).map((item) => ({
    kind: item.primaryActionKind,
    label:
      item.primaryActionKind === "watch_repository"
        ? `Watch ${item.title}`
        : `Read ${item.title}`,
    reason: item.reason,
    citationIds: item.citationIds,
    canonicalUrl: item.canonicalUrl,
  }));
  const firstTopRead = input.topReads[0];
  const firstTopicId =
    input.topicHighlights[0]?.topicId ?? firstTopRead?.matchedTopicIds[0];

  if (
    input.qualityState.isSingleSource ||
    input.qualityState.status === "limited_sources" ||
    input.qualityState.status === "low_confidence"
  ) {
    actions.push({
      kind: "request_deeper_scan",
      label: "Request deeper scan",
      reason:
        "The summary has limited confirmation and needs more provider coverage before strong conclusions.",
      citationIds: firstTopRead?.citationIds ?? [],
      canonicalUrl: firstTopRead?.canonicalUrl,
    });
  }

  if (firstTopicId !== undefined) {
    actions.push({
      kind: "add_topic_rule",
      label: `Tune ${topicTitle(firstTopicId)}`,
      reason:
        "Add or adjust topic rules if this signal should be tracked more precisely.",
      citationIds: firstTopRead?.citationIds ?? [],
      canonicalUrl: firstTopRead?.canonicalUrl,
    });
  }

  if (firstTopRead !== undefined) {
    actions.push(
      {
        kind: "mark_relevant",
        label: "Mark relevant",
        reason:
          "Use feedback to keep future summaries aligned with this signal.",
        citationIds: firstTopRead.citationIds,
        canonicalUrl: firstTopRead.canonicalUrl,
      },
      {
        kind: "mark_not_relevant",
        label: "Not relevant",
        reason: "Use feedback to reduce similar signals in future summaries.",
        citationIds: firstTopRead.citationIds,
        canonicalUrl: firstTopRead.canonicalUrl,
      },
    );
  }

  if (
    input.qualityState.status === "no_signal" ||
    input.qualityState.status === "low_confidence"
  ) {
    actions.push({
      kind: "ignore_low_confidence",
      label: "Ignore low-confidence signal",
      reason: "Skip acting until more cited evidence appears.",
      citationIds: [],
    });
  }

  return uniqueReaderActions(actions).slice(0, 7);
};

export const uniqueReaderActions = (
  actions: readonly ReaderAction[],
): readonly ReaderAction[] => {
  const seen = new Set<string>();

  return actions.filter((action) => {
    const key = `${action.kind}:${action.label}:${action.canonicalUrl ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
