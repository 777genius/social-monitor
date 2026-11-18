import type { ProviderReaderSummaryAttempt, ReaderSummaryModelValidationResult } from "../../ports";
import { assertOpenAiReaderSummaryDraftShape } from "./openai-responses-reader-summary-model-support";

/** Validates the normalized draft before crossing the model port. */
export const validateOpenAiReaderSummaryResponse = (
  attempt: ProviderReaderSummaryAttempt,
): ReaderSummaryModelValidationResult => {
  try {
    assertOpenAiReaderSummaryDraftShape(attempt.draft);
    if (attempt.route.schemaVersion !== "reader_summary.artifact.v1") {
      throw new Error("Unsupported reader summary schema version");
    }
    if (attempt.route.provider !== "openai-responses") {
      throw new Error("Unexpected reader summary provider route");
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid_schema",
        retryable: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid reader summary provider response",
      },
    };
  }
};
