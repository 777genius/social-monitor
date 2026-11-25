import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";

/**
 * Admit a sealed v2 editorial input before projecting provider sections.
 * The v1 legacy branch and subsequent synthesis verification stay with their
 * existing owners. Preserve the pre-projection error order and citation map.
 */
export const admitOpenAiDailyEditorialSynthesis = (params: {
  readonly rawSections: unknown;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
}) => {
  const plan = params.input.dailyEditorialPlan;
  if (plan === undefined || !Array.isArray(params.rawSections) ||
      params.rawSections.length < 1 || params.rawSections.length > 6) {
    throw new Error("Daily editorial narrative requires an overview and at most five takeaways");
  }
  const byCitation = new Map(params.citationMap.map(item => [item.citationId, item] as const));
  const frozen = params.input.evidence.dailyGenerationInput;
  if (frozen === undefined) throw new Error("Daily editorial input is missing");
  return { plan, rawSections: params.rawSections, byCitation, frozen };
};
