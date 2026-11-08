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

const assertCompletedResponseState = (
  response: Record<string, unknown>,
): void => {
  if (hasValue(response, "error")) {
    throw modelError(
      "response_state",
      false,
      "OpenAI reader summary weekly response contains an error state",
    );
  }
  if (response.status !== "completed") {
    const received = safeStateLabel(response.status);
    throw modelError(
      "response_state",
      false,
      `OpenAI reader summary weekly response status must be completed; received ${received}`,
    );
  }
  if (hasValue(response, "incomplete_details")) {
    throw modelError(
      "response_state",
      false,
      "OpenAI reader summary weekly response is truncated",
    );
  }
  if (hasRefusal(response)) {
    throw modelError(
      "refusal",
      false,
      "OpenAI reader summary weekly response was refused",
    );
  }
  if (hasNestedError(response)) {
    throw modelError(
      "response_state",
      false,
      "OpenAI reader summary weekly response contains an error state",
    );
  }
  if (hasIncompleteOutput(response)) {
    throw modelError(
      "response_state",
      false,
      "OpenAI reader summary weekly response output is incomplete",
    );
  }
};

export const extractSingleOutputText = (
  response: Record<string, unknown>,
): string => {
  const aggregate = nonEmptyString(response.output_text);
  const fragments: string[] = [];
  if (response.output !== undefined && !Array.isArray(response.output)) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly output must be an array",
    );
  }
  for (const item of Array.isArray(response.output) ? response.output : []) {
    const output = asRecord(item);
    if (output === null || !Array.isArray(output.content)) {
      continue;
    }
    for (const itemContent of output.content) {
      const content = asRecord(itemContent);
      if (content?.type !== "output_text") {
        continue;
      }
      const text = nonEmptyString(content.text);
      if (text === undefined) {
        throw modelError(
          "invalid_response",
          false,
          "OpenAI reader summary weekly output text is empty",
        );
      }
      fragments.push(text);
    }
  }
  if (fragments.length > 1) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly response contains stitched output text",
    );
  }
  if (
    aggregate !== undefined &&
    fragments.length === 1 &&
    aggregate !== fragments[0]
  ) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly aggregate output text is inconsistent",
    );
  }
  const outputText = aggregate ?? fragments[0];
  if (outputText === undefined) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly response has no output text",
    );
  }
  return outputText;
};

const hasRefusal = (response: Record<string, unknown>): boolean => {
  if (hasValue(response, "refusal")) {
    return true;
  }
  return outputRecords(response).some(
    (record) =>
      record.type === "refusal" ||
      hasValue(record, "refusal") ||
      contentRecords(record).some(
        (content) =>
          content.type === "refusal" || hasValue(content, "refusal"),
      ),
  );
};

const hasNestedError = (response: Record<string, unknown>): boolean =>
  outputRecords(response).some(
    (record) =>
      record.type === "error" ||
      hasValue(record, "error") ||
      contentRecords(record).some(
        (content) =>
          content.type === "error" || hasValue(content, "error"),
      ),
  );

const hasIncompleteOutput = (response: Record<string, unknown>): boolean =>
  outputRecords(response).some(
    (record) =>
      (record.status !== undefined && record.status !== "completed") ||
      hasValue(record, "incomplete_details"),
  );

const outputRecords = (
  response: Record<string, unknown>,
): readonly Record<string, unknown>[] =>
  Array.isArray(response.output)
    ? response.output.flatMap((value) => {
        const record = asRecord(value);
        return record === null ? [] : [record];
      })
    : [];

const contentRecords = (
  output: Record<string, unknown>,
): readonly Record<string, unknown>[] =>
  Array.isArray(output.content)
    ? output.content.flatMap((value) => {
        const record = asRecord(value);
        return record === null ? [] : [record];
      })
    : [];

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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const hasValue = (
  record: Record<string, unknown>,
  key: string,
): boolean => record[key] !== undefined && record[key] !== null;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const safeStateLabel = (value: unknown): string =>
  typeof value === "string" && /^[a-z_]{1,32}$/u.test(value)
    ? value
    : "missing_or_invalid";

