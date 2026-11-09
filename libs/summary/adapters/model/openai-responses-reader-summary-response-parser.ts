// Keep the direct response-parser entrypoint compatible for existing callers.
export { assertOpenAiReaderSummaryClaimCitationIds } from "./openai-responses-reader-summary-claim-citations";
export { resolveOpenAiReaderSummaryUsage } from "./openai-responses-reader-summary-usage";

import {
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

export const parseOpenAiReaderSummaryJsonObject = (
  value: string,
): Record<string, unknown> => {
  try {
    return requiredRecord(JSON.parse(value), "OpenAI reader summary output");
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown parse failure";
    throw new OpenAiReaderSummaryOutputParseError(detail);
  }
};

export class OpenAiReaderSummaryOutputParseError extends Error {
  constructor(readonly detail: string) {
    super(`OpenAI reader summary output must be JSON: ${detail}`);
    this.name = "OpenAiReaderSummaryOutputParseError";
  }
}
