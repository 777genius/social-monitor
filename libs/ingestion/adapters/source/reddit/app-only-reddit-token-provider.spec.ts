import { Buffer } from 'node:buffer';

import { RedditAppOnlyTokenProvider } from './app-only-reddit-token-provider';

describe('RedditAppOnlyTokenProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('requests app-only credentials and reuses the token until the refresh skew', async () => {
    let now = 1_000;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'reddit-app-token-1', expires_in: 120 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'reddit-app-token-2', expires_in: 120 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new RedditAppOnlyTokenProvider({
      clientId: 'reddit-client-id',
      clientSecret: 'reddit-client-secret',
      userAgent: 'social-monitor-test/0.1',
      tokenUrl: 'https://reddit.example.test/api/v1/access_token',
      refreshSkewMs: 10_000,
      now: () => now,
    });

    await expect(provider.getAccessToken()).resolves.toBe('reddit-app-token-1');
    await expect(provider.getAccessToken()).resolves.toBe('reddit-app-token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body?.toString()).toBe('grant_type=client_credentials');
    expect((init.headers as Readonly<Record<string, string>>).authorization).toBe(
      `Basic ${Buffer.from('reddit-client-id:reddit-client-secret').toString('base64')}`,
    );
    expect((init.headers as Readonly<Record<string, string>>)['user-agent']).toBe('social-monitor-test/0.1');

    now += 111_000;
    await expect(provider.getAccessToken()).resolves.toBe('reddit-app-token-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is disabled when app credentials are not present in the runtime env', () => {
    expect(RedditAppOnlyTokenProvider.fromEnvironment({})).toBeNull();
    expect(RedditAppOnlyTokenProvider.fromEnvironment({
      REDDIT_APP_CLIENT_ID: 'reddit-client-id',
      REDDIT_APP_CLIENT_SECRET: 'reddit-client-secret',
    })).toBeInstanceOf(RedditAppOnlyTokenProvider);
  });

  it('redacts token-like fields from failed token responses', async () => {
    globalThis.fetch = jest.fn().mockResolvedValueOnce(new Response(
      '{"error":"invalid_client","access_token":"leaked","client_secret":"leaked"}',
      { status: 401 },
    )) as unknown as typeof fetch;

    const provider = new RedditAppOnlyTokenProvider({
      clientId: 'reddit-client-id',
      clientSecret: 'reddit-client-secret',
    });

    await expect(provider.getAccessToken()).rejects.toThrow('"access_token":"[redacted]"');
    await expect(provider.getAccessToken()).rejects.not.toThrow('leaked');
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
