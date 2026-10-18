import { ContentHttpPolicyError, type ContentHttpRequest, type ContentHttpResponse } from '../../http/guarded-content-http';
import { HttpTelegramPreviewClient } from './http-telegram-preview-client';
import { telegramHtml, telegramMessageHtml } from './telegram-preview.spec-support';

describe('Anonymous Telegram preview HTTP boundary', () => {
  const response = (request: ContentHttpRequest, status = 200, headers: Record<string, string> = {}): ContentHttpResponse => ({
    status, headers: new Headers(headers), finalUrl: request.url, body: telegramHtml(telegramMessageHtml(2, 'A public release')),
  });

  it('only requests the fixed public host, without authorization/cookies, and bounds redirects/time/body', async () => {
    const get = jest.fn(async (input: ContentHttpRequest) => response(input));
    const client = new HttpTelegramPreviewClient(2500, get);
    expect((await client.readPage('example_channel', 21)).posts[0]?.id).toBe(2);
    const request = get.mock.calls[0]?.[0];
    expect(request?.url).toBe('https://t.me/s/example_channel?before=21');
    expect(request?.headers).not.toHaveProperty('authorization');
    expect(request?.headers).not.toHaveProperty('cookie');
    expect(request?.maxRedirects).toBe(0);
    expect(request?.maxBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(request?.timeoutMs).toBeGreaterThan(0);
    expect(request?.timeoutMs).toBeLessThanOrEqual(834);
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    await expect(client.readPage('https://127.0.0.1/private')).rejects.toMatchObject({ kind: 'invalid_query' });
    await expect(client.readPage('example_channel', -1)).rejects.toMatchObject({ kind: 'invalid_query' });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('classifies 429 and unavailable public previews without reading a healthy empty feed', async () => {
    const client = new HttpTelegramPreviewClient(2500, async (input) => response(input, 429, { 'retry-after': '120' }));
    await expect(client.readPage('example_channel')).rejects.toMatchObject({ kind: 'rate_limited', retryable: true, retryAfterMs: 120_000 });
    const inaccessible = new HttpTelegramPreviewClient(2500, async (input) => ({ ...response(input), body: '<html>Open Telegram</html>' }));
    await expect(inaccessible.readPage('example_channel')).rejects.toMatchObject({ kind: 'unavailable', retryable: false });
    const redirected = new HttpTelegramPreviewClient(2500, async (input) => ({ ...response(input), finalUrl: 'https://example.com/' }));
    await expect(redirected.readPage('example_channel')).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it.each(['telegram.me', 'telegram.dog'])('preserves channel/history identity through fallback to %s', async (host) => {
    const get = jest.fn(async (input: ContentHttpRequest) => {
      if (new URL(input.url).hostname === 't.me') throw Object.assign(new Error('Network reset'), { code: 'ECONNRESET' });
      return response(input, new URL(input.url).hostname === host ? 200 : 503);
    });
    const page = await new HttpTelegramPreviewClient(3000, get).readPage('example_channel', 51);
    expect(page.posts[0]).toMatchObject({ id: 2, incomplete: false });
    expect(page.warnings).toEqual([`telegram.preview_endpoint_fallback:${host}`]);
    expect(get.mock.calls.map(([input]) => input.url)).toEqual([
      'https://t.me/s/example_channel?before=51', 'https://telegram.me/s/example_channel?before=51',
      ...(host === 'telegram.dog' ? ['https://telegram.dog/s/example_channel?before=51'] : []),
    ]);
    for (const [input] of get.mock.calls) {
      expect(input.maxBytes).toBe(2_097_152);
      expect(input.maxRedirects).toBe(0);
      expect(Object.keys(input.headers).sort()).toEqual(['accept', 'user-agent']);
      expect(input.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('preserves parser warnings on a successful mirror', async () => {
    const get = jest.fn(async (input: ContentHttpRequest) => new URL(input.url).hostname === 't.me'
      ? response(input, 502)
      : { ...response(input), body: telegramHtml(telegramMessageHtml(2, 'Release', '<div class="message_media_not_supported"></div>')) });
    const page = await new HttpTelegramPreviewClient(3000, get).readPage('example_channel');
    expect(page.warnings).toEqual(['telegram.preview_content_incomplete', 'telegram.preview_endpoint_fallback:telegram.me']);
  });

  it.each<[string | undefined, number]>([
    ['120', 120_000], ['0', 0], ['not-a-delay', 60_000], [undefined, 60_000], ['999999', 86_400_000],
  ])('stops on 429 without switching endpoints and preserves Retry-After %s', async (raw, expected) => {
    const get = jest.fn(async (input: ContentHttpRequest) => response(input, 429, raw === undefined ? {} : { 'retry-after': raw }));
    await expect(new HttpTelegramPreviewClient(3000, get).readPage('example_channel')).rejects.toMatchObject({
      kind: 'rate_limited', retryable: true, retryAfterMs: expected,
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('also stops on a rate-limited mirror', async () => {
    const get = jest.fn(async (input: ContentHttpRequest) => response(input,
      new URL(input.url).hostname === 't.me' ? 503 : 429, { 'retry-after': '45' }));
    await expect(new HttpTelegramPreviewClient(3000, get).readPage('example_channel')).rejects.toMatchObject({
      kind: 'rate_limited', retryable: true, retryAfterMs: 45_000,
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it.each(['unsafe_target', 'unsafe_connection', 'redirect_limit', 'response_too_large'])('never retries HTTP policy failure %s', async (reason) => {
    const get = jest.fn(async () => { throw new ContentHttpPolicyError(reason, 'Synthetic HTTP policy refusal'); });
    await expect(new HttpTelegramPreviewClient(3000, get).readPage('example_channel')).rejects.toMatchObject({
      kind: 'unavailable', retryable: false,
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not interpret a wrapped policy refusal as a network error', async () => {
    const error = Object.assign(new Error('Wrapped transport failure', {
      cause: new ContentHttpPolicyError('unsafe_target', 'Synthetic unsafe DNS'),
    }), { code: 'ECONNRESET' });
    const get = jest.fn(async () => { throw error; });
    await expect(new HttpTelegramPreviewClient(3000, get).readPage('example_channel')).rejects.toMatchObject({
      kind: 'unavailable', retryable: false,
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each([301, 302, 400, 401, 403, 404, 408, 600])('never retries non-5xx HTTP %s', async (status) => {
    const get = jest.fn(async (input: ContentHttpRequest) => response(input, status));
    await expect(new HttpTelegramPreviewClient(3000, get).readPage('example_channel')).rejects.toMatchObject({
      kind: 'unavailable', retryable: false,
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('rejects unexpected final URLs before interpreting a retryable status', async () => {
    const get = jest.fn(async (input: ContentHttpRequest) => ({ ...response(input, 503), finalUrl: 'https://telegram.me/s/example_channel' }));
    await expect(new HttpTelegramPreviewClient(3000, get).readPage('example_channel')).rejects.toMatchObject({
      kind: 'unavailable', retryable: false,
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each(['<html>Open Telegram</html>', telegramHtml('', 'different_channel')])('does not mask invalid primary HTML with fallback', async (body) => {
    const get = jest.fn(async (input: ContentHttpRequest) => ({ ...response(input), body }));
    await expect(new HttpTelegramPreviewClient(3000, get).readPage('example_channel')).rejects.toMatchObject({
      kind: 'unavailable', retryable: false,
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('validates channel identity on mirrors and stops on parser failure', async () => {
    const get = jest.fn(async (input: ContentHttpRequest) => new URL(input.url).hostname === 't.me'
      ? response(input, 500) : { ...response(input), body: telegramHtml(telegramMessageHtml(2, 'Release'), 'different_channel') });
    await expect(new HttpTelegramPreviewClient(3000, get).readPage('example_channel')).rejects.toMatchObject({
      kind: 'unavailable', retryable: false,
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('returns typed retryable unavailability after exhausting the official endpoints', async () => {
    const get = jest.fn(async (input: ContentHttpRequest) => response(input, 503));
    await expect(new HttpTelegramPreviewClient(3000, get).readPage('example_channel')).rejects.toMatchObject({
      kind: 'unavailable', retryable: true,
    });
    expect(get.mock.calls.map(([input]) => new URL(input.url).hostname)).toEqual(['t.me', 'telegram.me', 'telegram.dog']);
  });

  it.each([
    new Error('Unexpected failure'),
    new Error('Unknown wrapper', { cause: Object.assign(new Error('Network reset'), { code: 'ECONNRESET' }) }),
    Object.assign(new Error('Invalid certificate'), { code: 'CERT_HAS_EXPIRED' }),
  ])('propagates unexpected failures without trying mirrors: %s', async (error) => {
    const get = jest.fn(async () => { throw error; });
    await expect(new HttpTelegramPreviewClient(3000, get).readPage('example_channel')).rejects.toBe(error);
    expect(get).toHaveBeenCalledTimes(1);
  });

  describe('page deadlines', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException('Synthetic deadline', 'TimeoutError')), milliseconds);
        return controller.signal;
      });
    });
    afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

    it('leaves time for a mirror when the primary exhausts its attempt budget', async () => {
      const get = jest.fn(async (input: ContentHttpRequest) => {
        if (new URL(input.url).hostname !== 't.me') return response(input);
        return new Promise<ContentHttpResponse>((_resolve, reject) => {
          input.signal?.addEventListener('abort', () => reject(input.signal?.reason), { once: true });
        });
      });
      const pending = new HttpTelegramPreviewClient(3000, get).readPage('example_channel');
      await jest.advanceTimersByTimeAsync(999);
      expect(get).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({ warnings: ['telegram.preview_endpoint_fallback:telegram.me'] });
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('shares the overall deadline across attempts even when transport cleanup is delayed', async () => {
      const get = jest.fn(async (input: ContentHttpRequest) => new Promise<ContentHttpResponse>((_resolve, reject) => {
        if (new URL(input.url).hostname === 't.me') {
          // The attempt aborts at 1000 ms, but its transport takes longer to reject.
          setTimeout(() => reject(Object.assign(new Error('Delayed reset'), { code: 'ECONNRESET' })), 2500);
        } else {
          input.signal?.addEventListener('abort', () => reject(input.signal?.reason), { once: true });
        }
      }));
      const outcome = new HttpTelegramPreviewClient(3000, get).readPage('example_channel').catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(2500);
      expect(get).toHaveBeenCalledTimes(2);
      expect(get.mock.calls[0]?.[0].signal?.aborted).toBe(true);
      expect(get.mock.calls[1]?.[0].signal?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(499);
      expect(get.mock.calls[1]?.[0].signal?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(get.mock.calls[1]?.[0].signal?.aborted).toBe(true);
      await expect(outcome).resolves.toMatchObject({ kind: 'unavailable', retryable: true });
      expect(get).toHaveBeenCalledTimes(2);
    });
  });
});
