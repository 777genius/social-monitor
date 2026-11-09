import type { SummaryModelFailure } from '../../ports';
import { asRecord } from './openai-responses-summary-json';

export class SummaryModelProviderError extends Error {
  constructor(readonly failure: SummaryModelFailure) {
    super(failure.message);
  }
}

export const classifyOpenAiHttpFailure = (
  status: number,
  body: unknown,
): SummaryModelFailure => {
  const message =
    extractOpenAiErrorMessage(body) ??
    `OpenAI summary request failed with HTTP ${status}`;

  if (status === 429) {
    return {
      kind: 'provider_rate_limited',
      retryable: true,
      message,
    };
  }

  if (status === 400 || status === 413) {
    return {
      kind: 'context_too_large',
      retryable: false,
      message,
    };
  }

  if (status === 401 || status === 403) {
    return {
      kind: 'provider_unavailable',
      retryable: false,
      message,
    };
  }

  if (status >= 500) {
    return {
      kind: 'provider_unavailable',
      retryable: true,
      message,
    };
  }

  return {
    kind: 'provider_unavailable',
    retryable: false,
    message,
  };
};

export const readOpenAiResponseBody = async (
  response: Response,
): Promise<unknown> => {
  const text = await response.text();

  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
};

const extractOpenAiErrorMessage = (body: unknown): string | undefined => {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  const message = error?.message;

  return typeof message === 'string' && message.trim().length > 0
    ? message
    : undefined;
};

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
