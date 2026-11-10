import type { ReaderSummaryModelInput, ReaderSummaryModelRoute } from "../../ports";

// The two model transports share one editorial-vs-digest prompt selection rule.
// Keep this policy separate from provider selection, budgets and response parsing.
export const withReaderSummaryInputPromptVersion = (
  baseRoute: ReaderSummaryModelRoute,
  input: ReaderSummaryModelInput,
): ReaderSummaryModelRoute => ({
  ...baseRoute,
  ...(input.dailyEditorialPlan !== undefined
    ? { promptVersion: "reader_summary.prompt.2026-11-03.daily_editorial_v1" }
    : input.evidence.dailyGenerationInput === undefined
      ? {}
      : { promptVersion: "reader_summary.prompt.2026-11-03.daily_likes_digest" }),
});
