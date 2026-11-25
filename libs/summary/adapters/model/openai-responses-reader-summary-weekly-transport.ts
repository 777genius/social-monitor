import {
  OpenAiReaderSummaryWeeklyModelError,
  isTimeoutError,
  modelError,
  timeoutFailure,
} from "./openai-responses-reader-summary-weekly-response-contract";
import type { OpenAiReaderSummaryWeeklyFetchLike } from "./openai-responses-reader-summary-weekly-options";

type WeeklyRequestTransport = Readonly<{
  request: Readonly<Record<string, unknown>>;
  apiKey: string;
  endpointUrl: string;
  timeoutMs: number;
  fetchFn: OpenAiReaderSummaryWeeklyFetchLike;
}>;

/** Owns only the weekly HTTP dispatch, bounded abort and fail-closed transport mapping. */
export const postOpenAiReaderSummaryWeeklyResponse = async (
  params: WeeklyRequestTransport,
): Promise<Response> => {
  try {
    return await params.fetchFn(params.endpointUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(params.request),
      signal: AbortSignal.timeout(params.timeoutMs),
    });
  } catch (error) {
    if (error instanceof OpenAiReaderSummaryWeeklyModelError) {
      throw error;
    }
    if (isTimeoutError(error)) {
      throw new OpenAiReaderSummaryWeeklyModelError(timeoutFailure());
    }
    throw modelError(
      "transport",
      true,
      "OpenAI reader summary weekly transport failed",
    );
  }
};
