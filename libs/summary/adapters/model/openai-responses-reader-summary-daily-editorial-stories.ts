import {
  primaryReaderSummaryEvidence,
  type ReaderSummaryCitation,
  type ReaderSummaryTopStory,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeTopStory } from "./openai-responses-reader-summary-story-input";

/** The model cannot backfill topics from unplanned context in the new profile. */
export const normalizeDailyEditorialStories = (
  values: readonly Record<string, unknown>[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
  const plan = input.dailyEditorialPlan;
  const frozen = input.evidence.dailyGenerationInput;
  if (plan === undefined || frozen === undefined || values.length !== plan.topics.length) {
    throw new Error("Daily editorial stories must match the plan");
  }
  const byFeed = new Map(frozen.selected.map(item => [item.feedItemId, item] as const));
  const byCitation = new Map(citationMap.map(item => [item.citationId, item] as const));
  const evidenceById = new Map(primaryReaderSummaryEvidence(input.evidence).selectedEvidence
    .map(item => [item.feedItemId, item] as const));
  return values.map((raw, index): ReaderSummaryTopStory => {
    const topic = plan.topics[index]!;
    const anchor = byFeed.get(topic.feedItemIds[0]!);
    const story = normalizeTopStory(raw);
    if (anchor === undefined || story.storyClusterId !== anchor.storyId ||
        story.readerReasonProvenance?.kind !== "model" ||
        story.citationIds.length !== 1 ||
        byCitation.get(story.citationIds[0]!)?.feedItemId !== anchor.feedItemId) {
      throw new Error("Daily editorial story is missing or cites an unplanned source");
    }
    const evidence = evidenceById.get(anchor.feedItemId);
    if (evidence === undefined) throw new Error("Daily editorial story evidence missing");
    return { ...story, interestIds: [evidence.interestId],
      providerKeys: [evidence.providerKey] };
  });
};
