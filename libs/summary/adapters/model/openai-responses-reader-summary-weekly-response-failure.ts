export type OpenAiReaderSummaryWeeklyModelFailureKind =
  | "invalid_input"
  | "configuration"
  | "transport"
  | "timeout"
  | "http_error"
  | "response_state"
  | "refusal"
  | "invalid_response"
  | "output_validation"
  | "unknown";

export type OpenAiReaderSummaryWeeklyModelFailure = Readonly<{
  kind: OpenAiReaderSummaryWeeklyModelFailureKind;
  retryable: boolean;
  message: string;
}>;


export class OpenAiReaderSummaryWeeklyModelError extends Error {
  constructor(readonly failure: OpenAiReaderSummaryWeeklyModelFailure) {
    super(failure.message);
    this.name = "OpenAiReaderSummaryWeeklyModelError";
  }
}

export const modelError = (
  kind: OpenAiReaderSummaryWeeklyModelFailureKind,
  retryable: boolean,
  message: string,
): OpenAiReaderSummaryWeeklyModelError =>
  new OpenAiReaderSummaryWeeklyModelError({ kind, retryable, message });

export const timeoutFailure = (): OpenAiReaderSummaryWeeklyModelFailure => ({
  kind: "timeout",
  retryable: true,
  message: "OpenAI reader summary weekly request timed out",
});

export const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "AbortError" || error.name === "TimeoutError");
