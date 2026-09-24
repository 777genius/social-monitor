export type ReaderValueFailureCode =
  | 'rate_limited' | 'transport' | 'timeout' | 'auth_paused'
  | 'schema_invalid' | 'model_version_changed' | 'provider_changed'
  | 'request_rejected' | 'response_too_large' | 'retry_exhausted'
  | 'lease_expired' | 'scope_changed' | 'empty_input' | 'configuration_invalid';

/** Contains no provider message, response body, credential or source text. */
export type ReaderValueFailure = {
  readonly code: ReaderValueFailureCode;
  readonly retryable: boolean;
  readonly pauseDispatch: boolean;
  readonly usageUnknown: boolean;
  readonly retryAfterAt?: Date;
};

export type ReaderValueRetryDecision =
  | { readonly state: 'retryable_failed'; readonly nextAttemptAt: Date }
  | { readonly state: 'permanent_failed'; readonly code: ReaderValueFailureCode };

export const READER_VALUE_MAX_ATTEMPTS = 3;
export const READER_VALUE_LEASE_MS = 90_000;

/** Attempts count dispatch reservations, including a crash before sending HTTP. */
export function readerValueRetryDecision(
  attempts: number,
  failure: ReaderValueFailure,
  finishedAt: Date,
): ReaderValueRetryDecision {
  if (!failure.retryable) return { state: 'permanent_failed', code: failure.code };
  if (attempts >= READER_VALUE_MAX_ATTEMPTS) return { state: 'permanent_failed', code: 'retry_exhausted' };
  const backoff = attempts <= 1 ? 10_000 : 60_000;
  return {
    state: 'retryable_failed',
    nextAttemptAt: new Date(Math.max(finishedAt.getTime() + backoff, failure.retryAfterAt?.getTime() ?? 0)),
  };
}
