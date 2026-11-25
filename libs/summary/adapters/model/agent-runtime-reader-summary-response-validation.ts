import type { ProviderReaderSummaryAttempt, ReaderSummaryModelValidationResult } from "../../ports";
import { assertOpenAiReaderSummaryDraftShape } from "./reader-summary-draft-shape-contract";

/** Fail closed on normalized content and provider-route mismatches, before accepting an attempt. */
export const validateAgentRuntimeReaderSummaryProviderResponse = (
  attempt: ProviderReaderSummaryAttempt,
): ReaderSummaryModelValidationResult => {
  try {
    assertOpenAiReaderSummaryDraftShape(attempt.draft);
    if (attempt.route.schemaVersion !== "reader_summary.artifact.v1") {
      throw new Error("Unsupported reader summary schema version");
    }
    if (attempt.route.provider !== "agent-runtime") {
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
            : "Invalid agent-runtime reader summary provider response",
      },
    };
  }
};
