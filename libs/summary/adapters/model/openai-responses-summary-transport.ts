import { rethrowOpenAiSummaryTransportFailure } from './openai-responses-summary-transport-failure';
import { readOpenAiResponseBody } from './openai-responses-summary-http-failure';
import { admitOpenAiSummaryHttpResponse } from './openai-responses-summary-http-response-admission';

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

      return admitOpenAiSummaryHttpResponse(response, body);
    } catch (error) {
      return rethrowOpenAiSummaryTransportFailure(error);
    } finally {
      clearTimeout(timeout);
    }
};
