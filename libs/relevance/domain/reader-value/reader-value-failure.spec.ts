import { readerValueRetryDecision, type ReaderValueFailure } from './reader-value-failure';

const now = new Date('2026-09-20T10:00:00Z');
const transient: ReaderValueFailure = {
  code: 'timeout', retryable: true, pauseDispatch: false, usageUnknown: true,
};

describe('reader-value dispatch reservation budget', () => {
  it('backs off ten then sixty seconds and exhausts the third reservation', () => {
    expect(readerValueRetryDecision(1, transient, now)).toEqual({
      state: 'retryable_failed', nextAttemptAt: new Date('2026-09-20T10:00:10Z'),
    });
    expect(readerValueRetryDecision(2, transient, now)).toEqual({
      state: 'retryable_failed', nextAttemptAt: new Date('2026-09-20T10:01:00Z'),
    });
    expect(readerValueRetryDecision(3, transient, now)).toEqual({ state: 'permanent_failed', code: 'retry_exhausted' });
  });

  it('never shortens a distant Retry-After', () => {
    const retryAfterAt = new Date('2026-10-01T00:00:00Z');
    expect(readerValueRetryDecision(1, { ...transient, code: 'rate_limited', retryAfterAt }, now))
      .toEqual({ state: 'retryable_failed', nextAttemptAt: retryAfterAt });
  });

  it('does not retry invalid schemas', () => {
    expect(readerValueRetryDecision(1, { ...transient, code: 'schema_invalid', retryable: false }, now))
      .toEqual({ state: 'permanent_failed', code: 'schema_invalid' });
  });

  it('leaves auth eligible for retry after explicit restart within the same reservation budget', () => {
    expect(readerValueRetryDecision(1, { ...transient, code: 'auth_paused', pauseDispatch: true }, now).state)
      .toBe('retryable_failed');
  });
});
