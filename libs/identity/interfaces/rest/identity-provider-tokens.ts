import type { ApiKeyRepositoryPort } from '../../ports';

export type IdentityPersistenceMode = 'in-memory' | 'prisma';

export const IDENTITY_PERSISTENCE_MODE = Symbol('IDENTITY_PERSISTENCE_MODE');
export const IDENTITY_PRISMA_CLIENT = Symbol('IDENTITY_PRISMA_CLIENT');
export const IDENTITY_API_KEY_REPOSITORY = Symbol('IDENTITY_API_KEY_REPOSITORY');

export type IdentityProviderTokenMap = {
  readonly [IDENTITY_PERSISTENCE_MODE]: IdentityPersistenceMode;
  readonly [IDENTITY_PRISMA_CLIENT]: unknown;
  readonly [IDENTITY_API_KEY_REPOSITORY]: ApiKeyRepositoryPort;
};

export const resolveIdentityPersistenceMode = (env: NodeJS.ProcessEnv): IdentityPersistenceMode => {
  const value = env.IDENTITY_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    return 'in-memory';
  }

  if (value === 'prisma') {
    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('IDENTITY_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('IDENTITY_PERSISTENCE must be "in-memory" or "prisma"');
};
