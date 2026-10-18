import type { ContentHttpRequest, ContentHttpResponse } from '../../http/guarded-content-http';
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
    expect(request?.timeoutMs).toBe(2500);
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
});
