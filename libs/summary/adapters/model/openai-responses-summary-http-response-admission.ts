import { SummaryModelProviderError } from './openai-responses-summary-model-error';
import { classifyOpenAiHttpFailure } from './openai-responses-summary-http-failure';
import { asRecord } from './openai-responses-summary-json';

/**
 * HTTP-success and provider JSON root admission.
 * The transport owns I/O and timeout cleanup; downstream interpretation owns
 * provider completion/refusal and semantic summary validation.
 */
export const admitOpenAiSummaryHttpResponse = (
  response: Readonly<{ ok: boolean; status: number }>,
  body: unknown,
): Record<string, unknown> => {
  if (!response.ok) {
    throw new SummaryModelProviderError(
      classifyOpenAiHttpFailure(response.status, body),
    );
  }

  const record = asRecord(body);

  if (record === null) {
    throw new SummaryModelProviderError({
      kind: 'invalid_schema',
      retryable: false,
      message: 'OpenAI response body must be a JSON object',
    });
  }

  return record;
};
