import type { ProviderSummaryAttempt, SummaryModelValidationResult } from "../../ports";
import { assertOpenAiSummaryDraftShape } from "./openai-responses-summary-draft-normalizer";

// Preserve the historical named export as the identical function object.
export { completeOpenAiSummaryAttempt } from "./openai-responses-summary-attempt-completion";

/** Keep post-normalization port validation distinct from HTTP and schema decoding. */
export const validateOpenAiSummaryResponse = (
  attempt: ProviderSummaryAttempt,
): SummaryModelValidationResult => {
  try {
    assertOpenAiSummaryDraftShape(attempt.draft);

    if (attempt.route.schemaVersion !== "summary.artifact.v1") {
      throw new Error("Unsupported summary schema version");
    }

    if (attempt.route.provider !== "openai-responses") {
      throw new Error("Unexpected summary provider route");
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
            : "Invalid summary provider response",
      },
    };
  }
};
