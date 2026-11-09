import type { SummaryModelFailure } from '../../ports';

export class SummaryModelProviderError extends Error {
  constructor(readonly failure: SummaryModelFailure) {
    super(failure.message);
  }
}

export { classifyOpenAiHttpFailure, readOpenAiResponseBody } from './openai-responses-summary-http-failure';

/** Map provider/parse failures to the unchanged public retry classification. */
export const classifyOpenAiSummaryError = (error: unknown): SummaryModelFailure => {
  if (error instanceof SummaryModelProviderError) {
    return error.failure;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return {
      kind: 'provider_unavailable',
      retryable: true,
      message: 'OpenAI summary request timed out',
    };
  }

  const message =
    error instanceof Error ? error.message : 'Unknown summary model error';
  const lower = message.toLowerCase();

  if (lower.includes('budget')) {
    return {
      kind: 'budget_exceeded',
      retryable: false,
      message,
    };
  }

  if (lower.includes('citation')) {
    return {
      kind: 'citation_validation_failed',
      retryable: false,
      message,
    };
  }

  if (lower.includes('schema') || lower.includes('json')) {
    return {
      kind: 'invalid_schema',
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
