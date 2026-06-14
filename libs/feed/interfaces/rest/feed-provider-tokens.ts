import type { Provider } from '@nestjs/common';

export type FeedPersistenceMode = 'in-memory' | 'prisma';

export const FEED_PERSISTENCE_MODE = Symbol('FEED_PERSISTENCE_MODE');
export const FEED_PRISMA_CLIENT = Symbol('FEED_PRISMA_CLIENT');

export const feedPersistenceModeProvider: Provider<FeedPersistenceMode> = {
  provide: FEED_PERSISTENCE_MODE,
  useFactory: () => resolveFeedPersistenceMode(process.env),
};

export const resolveFeedPersistenceMode = (env: NodeJS.ProcessEnv): FeedPersistenceMode => {
  const value = env.FEED_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    return 'in-memory';
  }

  if (value === 'prisma') {
    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('FEED_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('FEED_PERSISTENCE must be "in-memory" or "prisma"');
};
