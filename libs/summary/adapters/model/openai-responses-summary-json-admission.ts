import { SummaryModelProviderError } from "./openai-responses-summary-model-error";
import { requiredRecord } from "./openai-responses-summary-required-json";

/** Admit one provider JSON object without exposing its raw syntax in diagnostics. */
export const parseOpenAiSummaryJsonObject = (
  value: string,
): Record<string, unknown> => {
  try {
    return requiredRecord(JSON.parse(value), 'OpenAI summary output');
  } catch (error) {
    throw new SummaryModelProviderError({
      kind: 'invalid_schema',
      retryable: false,
      // V8 JSON.parse diagnostics can quote raw provider text, which must
      // never leak into error logs or downstream failure messages.
      message:
        error instanceof SyntaxError
          ? 'OpenAI summary output must be JSON'
          : error instanceof Error
            ? error.message
            : 'OpenAI summary output must be JSON',
    });
  }
};
