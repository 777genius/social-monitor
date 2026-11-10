import type { ReaderSummaryModelFailure } from "../../ports";
import {
  asRecord,
  classifyOpenAiReaderSummaryHttpFailure,
  readOpenAiResponseBody,
} from "./openai-responses-reader-summary-model-support";

export type OpenAiReaderSummaryFetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class ReaderSummaryModelProviderError extends Error {
  constructor(readonly failure: ReaderSummaryModelFailure) {
    super(failure.message);
  }
}

export const createOpenAiReaderSummaryResponse = async (params: Readonly<{
  request: Record<string, unknown>;
  apiKey: string;
  endpointUrl: string;
  timeoutMs: number;
  fetchFn: OpenAiReaderSummaryFetchLike;
}>): Promise<Record<string, unknown>> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const response = await params.fetchFn(params.endpointUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${params.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(params.request),
        signal: controller.signal,
      });
      const body = await readOpenAiResponseBody(response);

      if (!response.ok) {
        throw new ReaderSummaryModelProviderError(
          classifyOpenAiReaderSummaryHttpFailure(response.status, body),
        );
      }

      const record = asRecord(body);
      if (record === null) {
        throw new ReaderSummaryModelProviderError({
          kind: "invalid_schema",
          retryable: false,
          message: "OpenAI response body must be a JSON object",
        });
      }

      return record;
    } catch (error) {
      if (
        error instanceof ReaderSummaryModelProviderError ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw error;
      }

      throw new ReaderSummaryModelProviderError({
        kind: "provider_unavailable",
        retryable: true,
        message:
          error instanceof Error
            ? error.message
            : "OpenAI reader summary request failed",
      });
    } finally {
      clearTimeout(timeout);
    }
};
