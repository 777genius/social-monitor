import { assertDailyEditorialSynthesis } from "../../domain/services/reader-summary-daily-input-binding";
import type { ReaderSummaryCitation, ReaderSummaryNarrativeSection } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeLegacyDailyEditorialNarrative } from "./openai-responses-reader-summary-legacy-editorial-narrative";
import { projectDailyEditorialSynthesisSection } from "./openai-responses-reader-summary-editorial-section";

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
  const sections = params.rawSections.map((raw, index) =>
    projectDailyEditorialSynthesisSection({ raw, index, plan, byCitation }),
  );
  assertDailyEditorialSynthesis(sections, plan, frozen.selected, params.citationMap);
  return sections;
};
