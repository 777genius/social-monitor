import { Buffer } from 'node:buffer';

import { validateOutboundUrl } from '@social-monitor/shared-kernel';

import type {
  SourceCredentialRefreshPort,
  SourceCredentialRefreshResult,
  SourceCredentialSecret,
} from '../../ports';

export type OAuth2TokenUrlPolicyResult =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: string };

export type OAuth2TokenUrlPolicy = (value: string) => OAuth2TokenUrlPolicyResult;

export type OAuth2SourceCredentialRefresherOptions = {
  readonly timeoutMs?: number;
  readonly refreshSkewMs?: number;
  readonly tokenUrlPolicy?: OAuth2TokenUrlPolicy;
};

type OAuth2TokenResponse = {
  readonly access_token?: unknown;
  readonly refresh_token?: unknown;
  readonly expires_in?: unknown;
  readonly token_type?: unknown;
  readonly scope?: unknown;
};

export class OAuth2SourceCredentialRefresher implements SourceCredentialRefreshPort {
  private readonly timeoutMs: number;
  private readonly refreshSkewMs: number;
  private readonly tokenUrlPolicy: OAuth2TokenUrlPolicy;

  constructor(options: OAuth2SourceCredentialRefresherOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.refreshSkewMs = options.refreshSkewMs ?? 60_000;
    this.tokenUrlPolicy = options.tokenUrlPolicy ?? validateOAuth2TokenUrl;
  }

  async refreshIfNeeded(
    params: Parameters<SourceCredentialRefreshPort['refreshIfNeeded']>[0],
  ): Promise<SourceCredentialRefreshResult> {
    const refreshToken = readString(params.secret.refreshToken);
    const tokenUrl = readString(params.secret.tokenUrl);
    const expiresAt = readDate(params.secret.accessTokenExpiresAt) ?? params.credential.toSnapshot().expiresAt;

    if (refreshToken === undefined || tokenUrl === undefined) {
      return {
        refreshed: false,
        secret: params.secret,
        expiresAt,
        scopes: params.credential.toSnapshot().scopes,
      };
    }

    if (expiresAt !== undefined && expiresAt.getTime() - this.refreshSkewMs > params.now.getTime()) {
      return {
        refreshed: false,
        secret: params.secret,
        expiresAt,
        scopes: params.credential.toSnapshot().scopes,
      };
    }

    const clientId = readString(params.secret.clientId);
    const clientSecret = readString(params.secret.clientSecret);
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    };
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    if (clientId !== undefined && clientSecret !== undefined) {
      headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    } else {
      appendOptional(body, 'client_id', clientId);
      appendOptional(body, 'client_secret', clientSecret);
    }

    const tokenUrlResult = this.tokenUrlPolicy(tokenUrl);
    if (!tokenUrlResult.ok) {
      throw new Error(`OAuth2 source credential token URL rejected: ${tokenUrlResult.reason}`);
    }

    const response = await fetch(tokenUrlResult.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`OAuth2 source credential refresh failed with HTTP ${response.status}: ${redactedBodyPreview(responseText)}`);
    }

    const parsed = parseTokenResponse(responseText);
    const accessToken = readRequiredString(parsed.access_token, 'access_token');
    const expiresInSeconds = readExpiresInSeconds(parsed.expires_in);
    const nextExpiresAt = new Date(params.now.getTime() + expiresInSeconds * 1000);
    const scope = readString(parsed.scope);
    const scopes = scope === undefined
      ? params.credential.toSnapshot().scopes
      : scope.split(/\s+/).map((item) => item.trim()).filter((item) => item.length > 0);
    const nextSecret: SourceCredentialSecret = {
      ...params.secret,
      accessToken,
      accessTokenExpiresAt: nextExpiresAt.toISOString(),
      tokenType: readString(parsed.token_type) ?? readString(params.secret.tokenType) ?? 'bearer',
      refreshToken: readString(parsed.refresh_token) ?? refreshToken,
    };

    return {
      refreshed: true,
      secret: nextSecret,
      expiresAt: nextExpiresAt,
      scopes,
    };
  }
}

const appendOptional = (body: URLSearchParams, key: string, value: string | undefined): void => {
  if (value !== undefined) {
    body.set(key, value);
  }
};

const validateOAuth2TokenUrl = (value: string): OAuth2TokenUrlPolicyResult =>
  validateOutboundUrl(value, {
    label: 'OAuth2 token URL',
    allowedProtocols: ['https:'],
  });

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const readRequiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`OAuth2 token response missing ${field}`);
  }

  return value.trim();
};

const readDate = (value: unknown): Date | undefined => {
  const raw = readString(value);
  if (raw === undefined) {
    return undefined;
  }

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const readExpiresInSeconds = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('OAuth2 token response missing positive expires_in');
  }

  return Math.floor(value);
};

const parseTokenResponse = (body: string): OAuth2TokenResponse => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as OAuth2TokenResponse;
    }
  } catch {
    throw new Error('OAuth2 token response must be JSON');
  }

  throw new Error('OAuth2 token response must be an object');
};

const redactedBodyPreview = (body: string): string =>
  body
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[redacted]"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, '"refresh_token":"[redacted]"')
    .replace(/"client_secret"\s*:\s*"[^"]+"/gi, '"client_secret":"[redacted]"')
    .slice(0, 500);
