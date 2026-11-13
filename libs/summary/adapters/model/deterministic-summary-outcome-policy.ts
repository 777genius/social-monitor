import type {
  ProviderSummaryAttempt,
  SummaryModelFailure,
  SummaryModelValidationResult,
} from "../../ports";

// Provider outcome policy is distinct from deterministic evidence construction.
// Keep exact legacy schema and failure precedence for the public adapter.
export const validateDeterministicSummaryProviderResponse = (
  attempt: ProviderSummaryAttempt,
): SummaryModelValidationResult => {
  if (attempt.route.schemaVersion !== 'summary.artifact.v1') {
    return {
      ok: false,
      failure: {
        kind: 'invalid_schema',
        retryable: false,
        message: 'Unsupported summary schema version',
      },
    };
  }

  return { ok: true };
};

export const classifyDeterministicSummaryError = (
  error: unknown,
): SummaryModelFailure => {
  const message =
    error instanceof Error ? error.message : 'Unknown summary model error';

  if (message.toLowerCase().includes('budget')) {
    return {
      kind: 'budget_exceeded',
      retryable: false,
      message,
    };
  }

  if (message.toLowerCase().includes('citation')) {
    return {
      kind: 'citation_validation_failed',
      retryable: false,
      message,
    };
  }

  return {
    kind: 'unknown',
    retryable: false,
    message,
  };
};
