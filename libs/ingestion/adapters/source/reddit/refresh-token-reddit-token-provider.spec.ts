import { Buffer } from 'node:buffer';

import { RedditRefreshTokenProvider } from './refresh-token-reddit-token-provider';

describe('RedditRefreshTokenProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('exchanges a tenant refresh token and reuses the access token until the refresh skew', async () => {
    let now = 1_000;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tenant-access-token-1', expires_in: 120 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tenant-access-token-2', expires_in: 120 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new RedditRefreshTokenProvider({
      tokenUrl: 'https://reddit.example.test/api/v1/access_token',
      refreshSkewMs: 10_000,
      now: () => now,
    });
    const request = {
      clientId: 'reddit-client-id',
      clientSecret: 'reddit-client-secret',
      refreshToken: 'tenant-refresh-token',
      userAgent: 'social-monitor-test/0.1',
    };

    await expect(provider.getAccessToken(request)).resolves.toBe('tenant-access-token-1');
    await expect(provider.getAccessToken(request)).resolves.toBe('tenant-access-token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body?.toString()).toBe('grant_type=refresh_token&refresh_token=tenant-refresh-token');
    expect((init.headers as Readonly<Record<string, string>>).authorization).toBe(
      `Basic ${Buffer.from('reddit-client-id:reddit-client-secret').toString('base64')}`,
    );
    expect((init.headers as Readonly<Record<string, string>>)['user-agent']).toBe('social-monitor-test/0.1');

    now += 111_000;
    await expect(provider.getAccessToken(request)).resolves.toBe('tenant-access-token-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('supports installed-app style refresh tokens without a client secret', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(jsonResponse({
      access_token: 'tenant-access-token',
      expires_in: 120,
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new RedditRefreshTokenProvider();

    await expect(provider.getAccessToken({
      clientId: 'installed-app-client-id',
      refreshToken: 'tenant-refresh-token',
    })).resolves.toBe('tenant-access-token');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Readonly<Record<string, string>>).authorization).toBe(
      `Basic ${Buffer.from('installed-app-client-id:').toString('base64')}`,
    );
  });

  it('rejects unsafe token URL overrides before runtime token requests', () => {
    expect(() => new RedditRefreshTokenProvider({
      tokenUrl: 'http://127.0.0.1:8080/token',
    })).toThrow('Reddit OAuth token URL rejected');
  });

  it('redacts token-like fields from failed token responses', async () => {
    globalThis.fetch = jest.fn().mockResolvedValueOnce(new Response(
      '{"error":"invalid_grant","access_token":"leaked-access","refresh_token":"leaked-refresh","client_secret":"leaked-secret"}',
      { status: 401 },
    )) as unknown as typeof fetch;

    const provider = new RedditRefreshTokenProvider();

    let message = '';
    try {
      await provider.getAccessToken({
        clientId: 'reddit-client-id',
        clientSecret: 'reddit-client-secret',
        refreshToken: 'tenant-refresh-token',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('"access_token":"[redacted]"');
    expect(message).not.toContain('leaked-access');
    expect(message).not.toContain('leaked-refresh');
    expect(message).not.toContain('leaked-secret');
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
