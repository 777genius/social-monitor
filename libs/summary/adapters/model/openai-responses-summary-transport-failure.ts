import { SummaryModelProviderError } from './openai-responses-summary-model-error';

/**
 * Transport-only failure boundary. Preserve HTTP/provider failures and aborted
 * requests exactly; only unknown fetch/stream failures are retryable.
 */
export const rethrowOpenAiSummaryTransportFailure = (error: unknown): never => {
  if (
    error instanceof SummaryModelProviderError ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    throw error;
  }

  throw new SummaryModelProviderError({
    kind: 'provider_unavailable',
    retryable: true,
    message:
      error instanceof Error
        ? error.message
        : 'OpenAI summary request failed',
  });
};
