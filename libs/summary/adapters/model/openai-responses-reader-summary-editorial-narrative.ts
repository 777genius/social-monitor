import { assertDailyEditorialSynthesis } from "../../domain/services/reader-summary-daily-input-binding";
import type { ReaderSummaryCitation, ReaderSummaryNarrativeSection } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeLegacyDailyEditorialNarrative } from "./openai-responses-reader-summary-legacy-editorial-narrative";
import { projectDailyEditorialSynthesisSection } from "./openai-responses-reader-summary-editorial-section";
import { admitOpenAiDailyEditorialSynthesis } from "./openai-responses-reader-summary-editorial-admission";

/** New daily profile: no silent truncation, repair, or reassignment of citations. */
export const normalizeDailyEditorialNarrative = (params: {
  readonly rawSections: unknown;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
}): readonly ReaderSummaryNarrativeSection[] => {
  if (params.input.dailyEditorialPlan?.version === "reader_summary.daily_editorial.v1") return normalizeLegacyDailyEditorialNarrative(params);
  const { plan, rawSections, byCitation, frozen } = admitOpenAiDailyEditorialSynthesis(params);
  const sections = rawSections.map((raw, index) =>
    projectDailyEditorialSynthesisSection({ raw, index, plan, byCitation }),
  );
  assertDailyEditorialSynthesis(sections, plan, frozen.selected, params.citationMap);
  return sections;
};
