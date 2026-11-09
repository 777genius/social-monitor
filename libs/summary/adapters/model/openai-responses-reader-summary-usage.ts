import type { GeneratedReaderSummaryDraft } from "../../domain";
import type { ReaderSummaryModelEstimate } from "../../ports";
import { asRecord, numberOrFallback } from "./openai-responses-reader-summary-json";

/** Model usage is untrusted; only finite nonnegative token counts override the route estimate. */
export const resolveOpenAiReaderSummaryUsage = (
  response: Record<string, unknown>,
  fallback: ReaderSummaryModelEstimate,
): GeneratedReaderSummaryDraft["usage"] => {
  const usage = asRecord(response.usage);
  const inputTokens = numberOrFallback(
    usage?.input_tokens,
    fallback.inputTokens,
  );
  const outputTokens = numberOrFallback(
    usage?.output_tokens,
    fallback.outputTokens,
  );

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: fallback.estimatedCostUsd,
  };
};
