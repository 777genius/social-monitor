import {
  modelError,
  timeoutFailure,
  isTimeoutError,
  OpenAiReaderSummaryWeeklyModelError,
} from "./openai-responses-reader-summary-weekly-response-failure";
import { asRecord } from "./openai-responses-reader-summary-weekly-response-records";
import { assertCompletedResponseState } from "./openai-responses-reader-summary-weekly-response-state";

export {
  modelError,
  timeoutFailure,
  isTimeoutError,
  OpenAiReaderSummaryWeeklyModelError,
} from "./openai-responses-reader-summary-weekly-response-failure";
export type {
  OpenAiReaderSummaryWeeklyModelFailure,
  OpenAiReaderSummaryWeeklyModelFailureKind,
} from "./openai-responses-reader-summary-weekly-response-failure";
export { extractSingleOutputText } from "./openai-responses-reader-summary-weekly-response-output-text";

export const readCompletedResponse = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  if (!response.ok) {
    throw modelError(
      "http_error",
      response.status >= 500 && response.status <= 599,
      `OpenAI reader summary weekly request failed with HTTP ${response.status}`,
    );
  }

  let responseText: string;
  try {
    responseText = await response.text();
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new OpenAiReaderSummaryWeeklyModelError(timeoutFailure());
    }
    throw modelError(
      "transport",
      true,
      "OpenAI reader summary weekly response transport failed",
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(responseText);
  } catch {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly response body must be JSON",
    );
  }
  const record = asRecord(value);
  if (record === null) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly response body must be an object",
    );
  }
  assertCompletedResponseState(record);
  return record;
};
