import { SummaryModelProviderError } from './openai-responses-summary-model-error';
import {
  classifyOpenAiHttpFailure,
  readOpenAiResponseBody,
} from './openai-responses-summary-http-failure';
import { asRecord } from './openai-responses-summary-json';

export type OpenAiSummaryFetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export const createOpenAiSummaryResponse = async (params: Readonly<{
  request: Record<string, unknown>;
  endpointUrl: string;
  apiKey: string;
  timeoutMs: number;
  fetchFn: OpenAiSummaryFetchLike;
}>): Promise<Record<string, unknown>> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const response = await params.fetchFn(params.endpointUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${params.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(params.request),
        signal: controller.signal,
      });
      const body = await readOpenAiResponseBody(response);

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
    } catch (error) {
      if (
        error instanceof SummaryModelProviderError ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        throw error;
      }

      throw new SummaryModelProviderError({
        kind: 'provider_unavailable',
        retryable: true,
        message:
          error instanceof Error
            ? error.message
            : 'OpenAI summary request failed',
      });
    } finally {
      clearTimeout(timeout);
    }
};
