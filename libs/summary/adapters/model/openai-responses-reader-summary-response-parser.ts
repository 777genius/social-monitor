import type {
  GeneratedReaderSummaryDraft,
} from "../../domain";
import type { ReaderSummaryModelEstimate } from "../../ports";
import {
  asRecord,
  numberOrFallback,
  requiredArray,
  requiredRecord,
} from "./openai-responses-reader-summary-json";

export const extractOpenAiOutputText = (
  response: Record<string, unknown>,
): string | undefined => {
  if (
    typeof response.output_text === "string" &&
    response.output_text.trim().length > 0
  ) {
    return response.output_text;
  }

  for (const output of requiredArray<Record<string, unknown>>(
    response.output ?? [],
    "OpenAI output",
  )) {
    for (const content of requiredArray<Record<string, unknown>>(
      output.content ?? [],
      "OpenAI content",
    )) {
      if (typeof content.text === "string" && content.text.trim().length > 0) {
        return content.text;
      }
    }
  }

  return undefined;
};

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

export const parseOpenAiReaderSummaryJsonObject = (
  value: string,
): Record<string, unknown> => {
  try {
    return requiredRecord(JSON.parse(value), "OpenAI reader summary output");
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown parse failure";
    throw new Error(`OpenAI reader summary output must be JSON: ${detail}`);
  }
};
