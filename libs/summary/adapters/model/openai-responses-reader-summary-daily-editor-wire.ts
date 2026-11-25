import type { ReaderSummaryModelEstimate } from "../../ports";
import {
  dailyEditorialInstructions,
  dailyEditorialOutputSchema,
} from "./reader-summary-daily-editorial-model";
import { resolveOpenAiReaderSummaryUsage } from "./openai-responses-reader-summary-usage";

/** OpenAI daily-editor wire serialization and metering stay distinct from plan trust. */
export const buildOpenAiDailyEditorialRequest = (
  model: string,
  maxOutputTokens: number,
  prompt: string,
): Record<string, unknown> => ({
  model,
  store: false,
  max_output_tokens: Math.min(maxOutputTokens, 3_000),
  instructions: dailyEditorialInstructions,
  input: prompt,
  text: { format: {
    type: "json_schema", name: "social_monitor_daily_editorial_plan",
    strict: true, schema: dailyEditorialOutputSchema,
  } },
});

export const resolveOpenAiDailyEditorialUsage = (params: {
  readonly response: Record<string, unknown>;
  readonly prompt: string;
  readonly inputTokenDivisor: number;
  readonly estimatedInputCostUsdPerMillionTokens: number;
  readonly estimatedOutputCostUsdPerMillionTokens: number;
}): ReaderSummaryModelEstimate => {
  const inputTokens = Math.ceil(params.prompt.length / params.inputTokenDivisor);
  const estimate: ReaderSummaryModelEstimate = {
    inputTokens,
    outputTokens: 3_000,
    estimatedCostUsd: (inputTokens * params.estimatedInputCostUsdPerMillionTokens +
      3_000 * params.estimatedOutputCostUsdPerMillionTokens) / 1_000_000,
  };
  const actual = resolveOpenAiReaderSummaryUsage(params.response, estimate);
  return {
    inputTokens: actual.inputTokens ?? estimate.inputTokens,
    outputTokens: actual.outputTokens ?? estimate.outputTokens,
    estimatedCostUsd: actual.estimatedCostUsd,
  };
};
