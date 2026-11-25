import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelFailure,
  ReaderSummaryModelValidationResult,
} from "../../ports";

// Pure deterministic-provider boundary: the adapter must not own error taxonomy
// or the strict response-version gate alongside evidence orchestration.
export const validateDeterministicReaderSummaryProviderResponse = (
  attempt: ProviderReaderSummaryAttempt,
): ReaderSummaryModelValidationResult => {
  if (attempt.route.schemaVersion !== "reader_summary.artifact.v1") {
    return {
      ok: false,
      failure: {
        kind: "invalid_schema",
        retryable: false,
        message: "Unsupported reader summary schema version",
      },
    };
  }

  return { ok: true };
};

export const classifyDeterministicReaderSummaryError = (
  error: unknown,
): ReaderSummaryModelFailure => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown reader summary model error";

  if (message.toLowerCase().includes("budget")) {
    return {
      kind: "budget_exceeded",
      retryable: false,
      message,
    };
  }

  if (message.toLowerCase().includes("citation")) {
    return {
      kind: "citation_validation_failed",
      retryable: false,
      message,
    };
  }

  return {
    kind: "unknown",
    retryable: false,
    message,
  };
};
