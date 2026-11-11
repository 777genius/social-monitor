import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import {
  buildOpenAiReaderSummaryWeeklyInstructions,
  buildOpenAiReaderSummaryWeeklyPromptPayload,
} from "./openai-responses-reader-summary-weekly-prompt";
import { buildOpenAiReaderSummaryWeeklyResponseFormat } from "./openai-responses-reader-summary-weekly-schema";

/**
 * Provider wire request, separate from transport/credentials and orchestration.
 * Keep property insertion order and the sealed output schema stable.
 */
export const buildOpenAiReaderSummaryWeeklyRequest = (
  input: ReaderSummaryWeeklyModelInput,
  options: Readonly<{ model: string; maxOutputTokens: number }>,
): Readonly<Record<string, unknown>> => ({
  model: options.model,
  store: false,
  max_output_tokens: options.maxOutputTokens,
  instructions: buildOpenAiReaderSummaryWeeklyInstructions(),
  input: buildOpenAiReaderSummaryWeeklyPromptPayload(input),
  text: {
    format: buildOpenAiReaderSummaryWeeklyResponseFormat(input),
  },
});
