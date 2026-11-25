import {
  OpenAiReaderSummaryWeeklyModelError,
  isTimeoutError,
  timeoutFailure,
  type OpenAiReaderSummaryWeeklyModelFailure,
} from "./openai-responses-reader-summary-weekly-response-contract";
import { OpenAiReaderSummaryWeeklyOutputParseError } from "./openai-responses-reader-summary-weekly-response-parser";

/** External failure taxonomy is independent of network execution. */
export const classifyOpenAiReaderSummaryWeeklyError = (
  error: unknown,
): OpenAiReaderSummaryWeeklyModelFailure => {
  if (error instanceof OpenAiReaderSummaryWeeklyModelError) {
    return error.failure;
  }
  if (error instanceof OpenAiReaderSummaryWeeklyOutputParseError) {
    return {
      kind: "output_validation",
      retryable: false,
      message: error.message,
    };
  }
  if (isTimeoutError(error)) {
    return timeoutFailure();
  }
  return {
    kind: "unknown",
    retryable: false,
    message:
      error instanceof Error
        ? error.message
        : "Unknown OpenAI reader summary weekly model failure",
  };
};
