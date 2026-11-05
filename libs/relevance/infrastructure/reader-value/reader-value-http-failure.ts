import type { ReaderValueFailure } from '../../domain/reader-value/reader-value-failure';

/** No response text is retained: providers can echo source data or credentials. */
export function readerValueHttpFailure(
  status: number,
  retryAfter: string | null,
  receivedAt: Date,
): ReaderValueFailure {
  if (status === 429) {
    const retryAfterAt = parseReaderValueRetryAfter(retryAfter, receivedAt);
    return {
      code: 'rate_limited', retryable: true, pauseDispatch: false, usageUnknown: true,
      ...(retryAfterAt === undefined ? {} : { retryAfterAt }),
    };
  }
  if (status === 401 || status === 402 || status === 403) {
    return { code: 'auth_paused', retryable: true, pauseDispatch: true, usageUnknown: true };
  }
  if (status === 408 || status >= 500) {
    return { code: 'transport', retryable: true, pauseDispatch: false, usageUnknown: true };
  }
  return { code: 'request_rejected', retryable: false, pauseDispatch: true, usageUnknown: true };
}

/** A valid distant date is preserved, not capped to the local retry backoff. */
export function parseReaderValueRetryAfter(value: string | null, receivedAt: Date): Date | undefined {
  if (value === null) return undefined;
  const header = value.trim();
  let milliseconds: number;
  if (/^\d+$/u.test(header)) {
    const seconds = Number(header);
    if (!Number.isSafeInteger(seconds)) return undefined;
    milliseconds = receivedAt.getTime() + seconds * 1000;
  } else {
    // IMF-fixdate, obsolete RFC 850 and ANSI C asctime forms of HTTP-date.
    const httpDate = /^(?:[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]+, \d{2}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/u;
    if (!httpDate.test(header)) return undefined;
    milliseconds = Date.parse(header.endsWith('GMT') ? header : `${header} GMT`);
  }
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
