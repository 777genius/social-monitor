import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';

import type { ApiKeyRepositoryPort } from '../../ports';

export type IdentityPersistenceMode = 'in-memory' | 'prisma';

export const IDENTITY_PERSISTENCE_MODE = Symbol('IDENTITY_PERSISTENCE_MODE');
export const IDENTITY_PRISMA_CLIENT = Symbol('IDENTITY_PRISMA_CLIENT');
export const IDENTITY_API_KEY_REPOSITORY = Symbol('IDENTITY_API_KEY_REPOSITORY');
export const IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE = Symbol('IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE');

export type IdentityProviderTokenMap = {
  readonly [IDENTITY_PERSISTENCE_MODE]: IdentityPersistenceMode;
  readonly [IDENTITY_PRISMA_CLIENT]: unknown;
  readonly [IDENTITY_API_KEY_REPOSITORY]: ApiKeyRepositoryPort;
  readonly [IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE]: number;
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
