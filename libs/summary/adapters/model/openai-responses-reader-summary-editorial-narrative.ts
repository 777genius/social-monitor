import { assertDailyEditorialSynthesis } from "../../domain/services/reader-summary-daily-input-binding";
import type { ReaderSummaryCitation, ReaderSummaryNarrativeSection } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { asRecord, optionalString } from "./openai-responses-reader-summary-json";
import { normalizeLegacyDailyEditorialNarrative } from "./openai-responses-reader-summary-legacy-editorial-narrative";

/** New daily profile: no silent truncation, repair, or reassignment of citations. */
export const normalizeDailyEditorialNarrative = (params: {
  readonly rawSections: unknown;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
}): readonly ReaderSummaryNarrativeSection[] => {
  if (params.input.dailyEditorialPlan?.version === "reader_summary.daily_editorial.v1") return normalizeLegacyDailyEditorialNarrative(params);
  const plan = params.input.dailyEditorialPlan;
  if (plan === undefined || !Array.isArray(params.rawSections) ||
      params.rawSections.length < 1 || params.rawSections.length > 6) {
    throw new Error("Daily editorial narrative requires an overview and at most five takeaways");
  }
  const byCitation = new Map(params.citationMap.map(item => [item.citationId, item] as const));
  const frozen = params.input.evidence.dailyGenerationInput;
  if (frozen === undefined) throw new Error("Daily editorial input is missing");
  const sections = params.rawSections.map((raw, index): ReaderSummaryNarrativeSection => {
    const item = asRecord(raw);
    const expectedKind = index === 0 ? "lead" : "secondary_signal";
    const citations = item?.citationIds;
    if (item === null || item.kind !== expectedKind) {
      throw new Error("Daily editorial narrative has invalid section order");
    }
    if (item.storyClusterId !== null && item.storyClusterId !== undefined) {
      throw new Error("Daily editorial narrative has a story cluster on a synthesis section");
    }
    if (!Array.isArray(citations) || citations.length < 1 || citations.length > 3 ||
        new Set(citations).size !== citations.length ||
        citations.some(id => typeof id !== "string" ||
          !plan.topics.some(topic => topic.feedItemIds.includes(byCitation.get(id)?.feedItemId ?? "")))) {
      throw new Error("Daily editorial narrative has unplanned or duplicate citations");
    }
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
      citationIds: [...citations] as string[],
    };
  });
  assertDailyEditorialSynthesis(sections, plan, frozen.selected, params.citationMap);
  return sections;
};
