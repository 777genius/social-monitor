import type { DeliveryAttemptRepositoryPort } from '../../ports';

export type DeliveryPersistenceMode = 'in-memory' | 'prisma';

export const DELIVERY_PERSISTENCE_MODE = Symbol('DELIVERY_PERSISTENCE_MODE');
export const DELIVERY_PRISMA_CLIENT = Symbol('DELIVERY_PRISMA_CLIENT');
export const DELIVERY_ATTEMPT_REPOSITORY = Symbol('DELIVERY_ATTEMPT_REPOSITORY');

export type DeliveryProviderTokenMap = {
  readonly [DELIVERY_PERSISTENCE_MODE]: DeliveryPersistenceMode;
  readonly [DELIVERY_PRISMA_CLIENT]: unknown;
  readonly [DELIVERY_ATTEMPT_REPOSITORY]: DeliveryAttemptRepositoryPort;
};

export const resolveDeliveryPersistenceMode = (env: NodeJS.ProcessEnv): DeliveryPersistenceMode => {
  const value = env.DELIVERY_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    return 'in-memory';
  }

  if (value === 'prisma') {
    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('DELIVERY_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('DELIVERY_PERSISTENCE must be "in-memory" or "prisma"');
};
