import { Buffer } from 'node:buffer';

import { REDACTED_VALUE, redactSensitiveText } from '@social-monitor/shared-kernel';

import type { RedditTokenProviderPort } from './reddit-token-provider.port';
import { validateRedditTokenUrl } from './reddit-token-url-policy';

export type RedditAppOnlyTokenProviderOptions = {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly userAgent?: string;
  readonly tokenUrl?: string;
  readonly timeoutMs?: number;
  readonly refreshSkewMs?: number;
  readonly now?: () => number;
};

type CachedAccessToken = {
  readonly value: string;
  readonly expiresAtMs: number;
};

type RedditTokenResponse = {
  readonly access_token?: unknown;
  readonly expires_in?: unknown;
};

export class RedditAppOnlyTokenProvider implements RedditTokenProviderPort {
  private readonly tokenUrl: string;
  private readonly timeoutMs: number;
  private readonly refreshSkewMs: number;
  private readonly now: () => number;
  private cached?: CachedAccessToken;
  private pending?: Promise<string>;

  constructor(private readonly options: RedditAppOnlyTokenProviderOptions) {
    assertNonEmpty(options.clientId, 'Reddit app-only clientId');
    assertNonEmpty(options.clientSecret, 'Reddit app-only clientSecret');
    this.tokenUrl = validateRedditTokenUrl(options.tokenUrl ?? 'https://www.reddit.com/api/v1/access_token');
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.refreshSkewMs = options.refreshSkewMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  static fromEnvironment(env: NodeJS.ProcessEnv): RedditAppOnlyTokenProvider | null {
    const clientId = firstNonEmptyString(env.REDDIT_APP_CLIENT_ID, env.REDDIT_CLIENT_ID);
    const clientSecret = firstNonEmptyString(env.REDDIT_APP_CLIENT_SECRET, env.REDDIT_CLIENT_SECRET);

    if (clientId === undefined || clientSecret === undefined) {
      return null;
    }

    return new RedditAppOnlyTokenProvider({
      clientId,
      clientSecret,
      userAgent: firstNonEmptyString(env.REDDIT_APP_USER_AGENT, env.REDDIT_USER_AGENT),
      tokenUrl: firstNonEmptyString(env.REDDIT_APP_TOKEN_URL),
      timeoutMs: readPositiveInteger(env.REDDIT_APP_TOKEN_TIMEOUT_MS, 10_000),
      refreshSkewMs: readPositiveInteger(env.REDDIT_APP_TOKEN_REFRESH_SKEW_MS, 60_000),
    });
  }

  async getAccessToken(): Promise<string> {
    const cached = this.cached;
    if (cached !== undefined && cached.expiresAtMs - this.refreshSkewMs > this.now()) {
      return cached.value;
    }

    this.pending ??= this.fetchAccessToken()
      .finally(() => {
        this.pending = undefined;
      });

    return this.pending;
  }

  private async fetchAccessToken(): Promise<string> {
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: this.basicAuthorization(),
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': this.options.userAgent ?? 'social-monitor-mvp/0.1 reddit-app-only',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Reddit app-only OAuth token request failed with HTTP ${response.status}: ${redactedBodyPreview(body)}`);
    }

    const parsed = parseTokenResponse(body);
    const accessToken = readResponseString(parsed.access_token, 'access_token');
    const expiresInSeconds = readExpiresInSeconds(parsed.expires_in);
    this.cached = {
      value: accessToken,
      expiresAtMs: this.now() + expiresInSeconds * 1000,
    };

    return accessToken;
  }

  private basicAuthorization(): string {
    return `Basic ${Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString('base64')}`;
  }
}

function parseTokenResponse(body: string): RedditTokenResponse {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as RedditTokenResponse;
    }
  } catch {
    throw new Error('Reddit app-only OAuth token response must be JSON');
  }

  throw new Error('Reddit app-only OAuth token response must be an object');
}

function readResponseString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reddit app-only OAuth token response missing ${field}`);
  }
  return value.trim();
}

function readExpiresInSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('Reddit app-only OAuth token response missing positive expires_in');
  }
  return Math.floor(value);
}

function redactedBodyPreview(body: string): string {
  return redactSensitiveText(body
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, `"access_token":"${REDACTED_VALUE}"`)
    .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, `"refresh_token":"${REDACTED_VALUE}"`)
    .replace(/"client_secret"\s*:\s*"[^"]+"/gi, `"client_secret":"${REDACTED_VALUE}"`))
    .slice(0, 500);
}

function firstNonEmptyString(...values: readonly (string | undefined)[]): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0)?.trim();
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Reddit app-only OAuth numeric env must be a positive integer');
  }
  return parsed;
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be set`);
  }
}
