import type { ReaderSummaryCitation, ReaderSummaryNarrativeSection } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { asRecord, optionalString } from "./openai-responses-reader-summary-json";

export const normalizeLegacyDailyEditorialNarrative = (params: {
  readonly rawSections: unknown;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
}): readonly ReaderSummaryNarrativeSection[] => {
  const plan = params.input.dailyEditorialPlan;
  if (plan === undefined || !Array.isArray(params.rawSections) ||
      params.rawSections.length !== plan.topics.length) {
    throw new Error("Daily editorial narrative must cover every planned topic");
  }
  const byCitation = new Map(params.citationMap.map(item => [item.citationId, item] as const));
  const frozen = params.input.evidence.dailyGenerationInput;
  if (frozen === undefined) throw new Error("Daily editorial input is missing");
  const byFeed = new Map(frozen.selected.map(item => [item.feedItemId, item] as const));
  return params.rawSections.map((raw, index): ReaderSummaryNarrativeSection => {
    const topic = plan.topics[index]!;
    const item = asRecord(raw);
    const anchor = byFeed.get(topic.feedItemIds[0]!);
    const expectedKind = index === 0 ? "lead" : "secondary_signal";
    const citations = item?.citationIds;
    if (anchor === undefined || item === null || item?.kind !== expectedKind ||
        item.storyClusterId !== anchor.storyId ||
        !Array.isArray(citations) || citations.length < 1 || citations.length > 3 ||
        citations.some(id => typeof id !== "string" ||
          !topic.feedItemIds.includes(byCitation.get(id)?.feedItemId ?? ""))) {
      throw new Error("Daily editorial narrative has unplanned citations or order");
    }
    if (anchor === undefined) throw new Error("Daily editorial anchor is missing");
    const title = optionalString(item.title);
    const text = optionalString(item.text);
    if (title === undefined || text === undefined) {
      throw new Error("Daily editorial narrative text is missing");
    }
    if (Array.from(text).length > 1_600 || !/[.!?…。！？]["'’”)]*$/u.test(text)) {
      throw new Error("Daily editorial narrative text is unfinished or too long");
    }
    return {
      id: `narrative-${index + 1}`, kind: expectedKind, title, text,
      citationIds: [...citations] as string[], storyClusterId: anchor.storyId,
    };
  });
};
