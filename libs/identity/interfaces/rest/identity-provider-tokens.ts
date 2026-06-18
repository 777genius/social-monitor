import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';

import type { JwksDocument, JwksUserAccessTokenVerifierConfig } from '../../adapters/authorization/jwks-user-access-token.verifier';
import type { ApiKeyRepositoryPort } from '../../ports';

export type IdentityPersistenceMode = 'in-memory' | 'prisma';
export type IdentityUserAccessTokenMode = 'disabled' | 'oidc-jwt';
export type IdentityUserAccessTokenConfig =
  | {
    readonly mode: 'disabled';
  }
  | ({
    readonly mode: 'oidc-jwt';
  } & JwksUserAccessTokenVerifierConfig);

export const IDENTITY_PERSISTENCE_MODE = Symbol('IDENTITY_PERSISTENCE_MODE');
export const IDENTITY_PRISMA_CLIENT = Symbol('IDENTITY_PRISMA_CLIENT');
export const IDENTITY_API_KEY_REPOSITORY = Symbol('IDENTITY_API_KEY_REPOSITORY');
export const IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE = Symbol('IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE');
export const IDENTITY_USER_ACCESS_TOKEN_CONFIG = Symbol('IDENTITY_USER_ACCESS_TOKEN_CONFIG');

export type IdentityProviderTokenMap = {
  readonly [IDENTITY_PERSISTENCE_MODE]: IdentityPersistenceMode;
  readonly [IDENTITY_PRISMA_CLIENT]: unknown;
  readonly [IDENTITY_API_KEY_REPOSITORY]: ApiKeyRepositoryPort;
  readonly [IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE]: number;
  readonly [IDENTITY_USER_ACCESS_TOKEN_CONFIG]: IdentityUserAccessTokenConfig;
};

export const resolveIdentityPersistenceMode = (env: NodeJS.ProcessEnv): IdentityPersistenceMode => {
  const value = env.IDENTITY_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'IDENTITY_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    return 'in-memory';
  }

  if (value === 'prisma') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'IDENTITY_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('IDENTITY_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('IDENTITY_PERSISTENCE must be "in-memory" or "prisma"');
};

export const resolvePublicApiRateLimitPerMinute = (env: NodeJS.ProcessEnv): number => {
  const configured = Number(env.PUBLIC_API_RATE_LIMIT_PER_MINUTE);

  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  return 60;
};

export const resolveIdentityUserAccessTokenConfig = (
  env: NodeJS.ProcessEnv,
): IdentityUserAccessTokenConfig => {
  const mode = resolveIdentityUserAccessTokenMode(env);

  if (mode === 'disabled') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'SOCIAL_MONITOR_USER_AUTH_MODE',
      selectedMode: mode,
      durableModes: ['oidc-jwt'],
    });

    return { mode };
  }

  assertRuntimeProfileAllowsMode({
    env,
    settingName: 'SOCIAL_MONITOR_USER_AUTH_MODE',
    selectedMode: mode,
    durableModes: ['oidc-jwt'],
  });

  return {
    mode,
    issuer: requireEnv(env, 'SOCIAL_MONITOR_OIDC_ISSUER'),
    audience: requireEnv(env, 'SOCIAL_MONITOR_OIDC_AUDIENCE'),
    jwks: parseJwks(requireEnv(env, 'SOCIAL_MONITOR_OIDC_JWKS_JSON')),
    clockToleranceSeconds: parseClockToleranceSeconds(env.SOCIAL_MONITOR_OIDC_CLOCK_TOLERANCE_SECONDS),
    subjectClaim: env.SOCIAL_MONITOR_OIDC_SUBJECT_CLAIM,
    tenantIdClaim: env.SOCIAL_MONITOR_OIDC_TENANT_ID_CLAIM,
    workspaceIdClaim: env.SOCIAL_MONITOR_OIDC_WORKSPACE_ID_CLAIM,
    rolesClaim: env.SOCIAL_MONITOR_OIDC_WORKSPACE_ROLES_CLAIM,
  };
};

const resolveIdentityUserAccessTokenMode = (env: NodeJS.ProcessEnv): IdentityUserAccessTokenMode => {
  const value = env.SOCIAL_MONITOR_USER_AUTH_MODE ?? 'disabled';

  if (value === 'disabled' || value === 'oidc-jwt') {
    return value;
  }

  throw new Error('SOCIAL_MONITOR_USER_AUTH_MODE must be "disabled" or "oidc-jwt"');
};

const requireEnv = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();

  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required when SOCIAL_MONITOR_USER_AUTH_MODE=oidc-jwt`);
  }

  return value;
};

const parseJwks = (value: string): JwksDocument => {
  try {
    const parsed = JSON.parse(value) as JwksDocument;

    if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
      throw new Error('empty keys');
    }

    return parsed;
  } catch {
    throw new Error('SOCIAL_MONITOR_OIDC_JWKS_JSON must be a JWKS JSON object with non-empty keys');
  }
};

const parseClockToleranceSeconds = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 300) {
    throw new Error('SOCIAL_MONITOR_OIDC_CLOCK_TOLERANCE_SECONDS must be an integer between 0 and 300');
  }

  return parsed;
};
