import type { Provider } from '@nestjs/common';
import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';

import type {
  RelevanceFeedbackRepositoryPort,
  UserRelevanceProfileRepositoryPort,
} from '../../ports';

export type RelevancePersistenceMode = 'in-memory' | 'prisma';

export const RELEVANCE_PERSISTENCE_MODE = Symbol('RELEVANCE_PERSISTENCE_MODE');
export const RELEVANCE_PRISMA_CLIENT = Symbol('RELEVANCE_PRISMA_CLIENT');

export type RelevanceProviderTokenMap = {
  readonly [RELEVANCE_PERSISTENCE_MODE]: RelevancePersistenceMode;
  readonly [RELEVANCE_PRISMA_CLIENT]: unknown;
  readonly userRelevanceProfiles: UserRelevanceProfileRepositoryPort;
  readonly relevanceFeedback: RelevanceFeedbackRepositoryPort;
};

export const relevancePersistenceModeProvider: Provider<RelevancePersistenceMode> = {
  provide: RELEVANCE_PERSISTENCE_MODE,
  useFactory: () => resolveRelevancePersistenceMode(process.env),
};

export const resolveRelevancePersistenceMode = (env: NodeJS.ProcessEnv): RelevancePersistenceMode => {
  const value = env.RELEVANCE_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'RELEVANCE_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    return 'in-memory';
  }

  if (value === 'prisma') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'RELEVANCE_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('RELEVANCE_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('RELEVANCE_PERSISTENCE must be "in-memory" or "prisma"');
};
