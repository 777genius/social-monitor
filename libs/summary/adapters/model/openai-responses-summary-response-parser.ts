import { SummaryModelProviderError } from "./openai-responses-summary-model-error";
import { requiredRecord } from "./openai-responses-summary-json";

// Preserve the historical direct-import surface; new consumers use the owning modules.
export { resolveOpenAiSummaryUsage } from "./openai-responses-summary-usage";
export { extractOpenAiSummaryOutputText } from "./openai-responses-summary-output-text";

export const parseOpenAiSummaryJsonObject = (
  value: string,
): Record<string, unknown> => {
  try {
    return requiredRecord(JSON.parse(value), 'OpenAI summary output');
  } catch (error) {
    throw new SummaryModelProviderError({
      kind: 'invalid_schema',
      retryable: false,
      message:
        error instanceof Error
          ? error.message
          : 'OpenAI summary output must be JSON',
    });
  }
};
