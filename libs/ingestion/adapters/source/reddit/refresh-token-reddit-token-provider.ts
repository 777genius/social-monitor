import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { REDACTED_VALUE, redactSensitiveText } from '@social-monitor/shared-kernel';

import { validateRedditTokenUrl } from './reddit-token-url-policy';

export type RedditRefreshTokenRequest = {
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly refreshToken: string;
  readonly userAgent?: string;
};

export type RedditRefreshTokenProviderOptions = {
  readonly tokenUrl?: string;
  readonly timeoutMs?: number;
  readonly refreshSkewMs?: number;
  readonly now?: () => number;
};

export interface RedditRefreshTokenProviderPort {
  getAccessToken(request: RedditRefreshTokenRequest): Promise<string>;
}

type CachedAccessToken = {
  readonly value: string;
  readonly expiresAtMs: number;
};

type RedditTokenResponse = {
  readonly access_token?: unknown;
  readonly expires_in?: unknown;
};

export class RedditRefreshTokenProvider implements RedditRefreshTokenProviderPort {
  private readonly tokenUrl: string;
  private readonly timeoutMs: number;
  private readonly refreshSkewMs: number;
  private readonly now: () => number;
  private readonly cached = new Map<string, CachedAccessToken>();
  private readonly pending = new Map<string, Promise<string>>();

  constructor(options: RedditRefreshTokenProviderOptions = {}) {
    this.tokenUrl = validateRedditTokenUrl(options.tokenUrl ?? 'https://www.reddit.com/api/v1/access_token');
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.refreshSkewMs = options.refreshSkewMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  static fromEnvironment(env: NodeJS.ProcessEnv): RedditRefreshTokenProvider {
    return new RedditRefreshTokenProvider({
      tokenUrl: firstNonEmptyString(env.REDDIT_REFRESH_TOKEN_URL, env.REDDIT_APP_TOKEN_URL),
      timeoutMs: readPositiveInteger(env.REDDIT_REFRESH_TOKEN_TIMEOUT_MS, 10_000),
      refreshSkewMs: readPositiveInteger(env.REDDIT_REFRESH_TOKEN_REFRESH_SKEW_MS, 60_000),
    });
  }

  async getAccessToken(request: RedditRefreshTokenRequest): Promise<string> {
    const normalized = normalizeRequest(request);
    const cacheKey = cacheKeyFor(normalized);
    const cached = this.cached.get(cacheKey);
    if (cached !== undefined && cached.expiresAtMs - this.refreshSkewMs > this.now()) {
      return cached.value;
    }

    const existing = this.pending.get(cacheKey);
    if (existing !== undefined) {
      return existing;
    }

    const pending = this.fetchAccessToken(normalized)
      .finally(() => {
        this.pending.delete(cacheKey);
      });
    this.pending.set(cacheKey, pending);

    return pending;
  }

  private async fetchAccessToken(request: Required<RedditRefreshTokenRequest>): Promise<string> {
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: basicAuthorization(request.clientId, request.clientSecret),
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': request.userAgent,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: request.refreshToken,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Reddit refresh-token OAuth request failed with HTTP ${response.status}: ${redactedBodyPreview(body)}`);
    }

    const parsed = parseTokenResponse(body);
    const accessToken = readResponseString(parsed.access_token, 'access_token');
    const expiresInSeconds = readExpiresInSeconds(parsed.expires_in);
    this.cached.set(cacheKeyFor(request), {
      value: accessToken,
      expiresAtMs: this.now() + expiresInSeconds * 1000,
    });

    return accessToken;
  }
}

function normalizeRequest(request: RedditRefreshTokenRequest): Required<RedditRefreshTokenRequest> {
  return {
    clientId: readRequiredString(request.clientId, 'Reddit refresh-token clientId'),
    clientSecret: readOptionalString(request.clientSecret) ?? '',
    refreshToken: readRequiredString(request.refreshToken, 'Reddit refreshToken'),
    userAgent: readOptionalString(request.userAgent) ?? 'social-monitor-mvp/0.1 reddit-refresh-token',
  };
}

function cacheKeyFor(request: Pick<Required<RedditRefreshTokenRequest>, 'clientId' | 'refreshToken'>): string {
  return createHash('sha256')
    .update(request.clientId)
    .update('\0')
    .update(request.refreshToken)
    .digest('hex');
}

function basicAuthorization(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

function parseTokenResponse(body: string): RedditTokenResponse {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as RedditTokenResponse;
    }
  } catch {
    throw new Error('Reddit refresh-token OAuth response must be JSON');
  }

  throw new Error('Reddit refresh-token OAuth response must be an object');
}

function readResponseString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reddit refresh-token OAuth response missing ${field}`);
  }
  return value.trim();
}

function readExpiresInSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('Reddit refresh-token OAuth response missing positive expires_in');
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

function readRequiredString(value: unknown, label: string): string {
  const resolved = readOptionalString(value);
  if (resolved === undefined) {
    throw new Error(`${label} must be set`);
  }
  return resolved;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
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
    throw new Error('Reddit refresh-token OAuth numeric env must be a positive integer');
  }
  return parsed;
}
