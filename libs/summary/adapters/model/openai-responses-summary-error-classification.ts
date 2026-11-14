import type { SummaryModelFailure } from '../../ports';
import { SummaryModelProviderError } from './openai-responses-summary-provider-error';

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
