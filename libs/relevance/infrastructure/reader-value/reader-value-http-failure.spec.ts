import { parseReaderValueRetryAfter, readerValueHttpFailure } from './reader-value-http-failure';

const receivedAt = new Date('2026-09-20T10:00:00Z');

describe('reader-value HTTP failure translation', () => {
  it('honors both delay seconds and distant HTTP-date', () => {
    expect(parseReaderValueRetryAfter('120', receivedAt)?.toISOString()).toBe('2026-09-20T10:02:00.000Z');
    expect(parseReaderValueRetryAfter('Thu, 01 Oct 2026 00:00:00 GMT', receivedAt)?.toISOString())
      .toBe('2026-10-01T00:00:00.000Z');
    expect(readerValueHttpFailure(429, '120', receivedAt)).toMatchObject({
      code: 'rate_limited', retryable: true, retryAfterAt: new Date('2026-09-20T10:02:00Z'),
    });
  });

  it.each([null, '', '-1', '1.5', 'tomorrow', '2026-09-21', '9'.repeat(30)])('ignores invalid Retry-After %s', (header) => {
    expect(parseReaderValueRetryAfter(header, receivedAt)).toBeUndefined();
  });

  it.each([401, 402, 403])('pauses dispatch after HTTP %s, retaining a restart retry opportunity', (status) => {
    expect(readerValueHttpFailure(status, null, receivedAt)).toMatchObject({
      code: 'auth_paused', pauseDispatch: true, retryable: true,
    });
  });

  it.each([400, 404, 422])('permanently rejects HTTP %s and pauses the configuration', (status) => {
    expect(readerValueHttpFailure(status, null, receivedAt)).toMatchObject({
      code: 'request_rejected', pauseDispatch: true, retryable: false,
    });
  });

  it.each([408, 500, 503])('bounds transport retries for HTTP %s without inventing known usage', (status) => {
    expect(readerValueHttpFailure(status, null, receivedAt)).toMatchObject({
      code: 'transport', pauseDispatch: false, retryable: true, usageUnknown: true,
    });
  });
});
