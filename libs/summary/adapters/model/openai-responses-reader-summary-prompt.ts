import {
  dailyDigestInstructions,
  dailyEditorialWriterInstructions,
  legacyDailyEditorialWriterInstructions,
} from "./openai-responses-reader-summary-daily-instructions";
export { buildOpenAiReaderSummaryPromptPayload } from "./openai-responses-reader-summary-prompt-payload";

import type { ReaderSummaryModelInput } from "../../ports";
import { buildLegacyReaderSummaryInstructions } from "./openai-responses-reader-summary-legacy-instructions";

// Preserve historical exports while provider-neutral release admission has its
// own independent responsibility from OpenAI instruction construction.
export {
  currentReaderSummaryPromptRelease,
  assertNoReaderSummaryPromptReleaseOverride,
} from "./reader-summary-prompt-release-policy";
export type { ReaderSummaryPromptRelease } from "./reader-summary-prompt-release-policy";

export const buildOpenAiReaderSummaryInstructions = (
  input: ReaderSummaryModelInput,
): string =>
  input.dailyEditorialPlan !== undefined ? (input.dailyEditorialPlan.version === "reader_summary.daily_editorial.v1" ? legacyDailyEditorialWriterInstructions(input) : dailyEditorialWriterInstructions(input)).join("\n") :
  input.evidence.dailyGenerationInput !== undefined ? dailyDigestInstructions(input) : buildLegacyReaderSummaryInstructions(input);

