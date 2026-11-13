import { modelError } from "./openai-responses-reader-summary-weekly-response-failure";
import { hasValue, outputRecords, contentRecords } from "./openai-responses-reader-summary-weekly-response-records";

export const assertCompletedResponseState = (
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

const safeStateLabel = (value: unknown): string =>
  typeof value === "string" && /^[a-z_]{1,32}$/u.test(value)
    ? value
    : "missing_or_invalid";
