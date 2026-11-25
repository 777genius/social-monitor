import type { ProviderSummaryAttempt, SummaryModelValidationResult } from "../../ports";
import { assertOpenAiSummaryDraftShape } from "./openai-responses-summary-draft-normalizer";

/** Validate normalized provider output independently of transport and task execution. */
export const validateAgentRuntimeSummaryProviderResponse = (
  attempt: ProviderSummaryAttempt,
): SummaryModelValidationResult => {
    try {
      assertOpenAiSummaryDraftShape(attempt.draft);
      if (attempt.route.schemaVersion !== "summary.artifact.v1") {
        throw new Error("Unsupported summary schema version");
      }
      if (attempt.route.provider !== "agent-runtime") {
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
              : "Invalid agent-runtime summary provider response",
        },
      };
    }
};
