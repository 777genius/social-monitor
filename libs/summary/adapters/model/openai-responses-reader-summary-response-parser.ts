// Keep the direct response-parser entrypoint compatible for existing callers.
export { extractOpenAiOutputText } from "./openai-responses-reader-summary-output-text";
export { assertOpenAiReaderSummaryClaimCitationIds } from "./openai-responses-reader-summary-claim-citations";
export { resolveOpenAiReaderSummaryUsage } from "./openai-responses-reader-summary-usage";

import { requiredRecord } from "./openai-responses-reader-summary-json";

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
