import type { Provider } from '@nestjs/common';
import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';

import type {
  RelevanceMemoryProjectionRepositoryPort,
  RelevanceMemoryGuidanceReaderPort,
  RelevanceMemoryProjectorPort,
  RelevanceFeedbackRepositoryPort,
  UserRelevanceProfileRepositoryPort,
} from '../../ports';

export type RelevancePersistenceMode = 'in-memory' | 'prisma';
export type RelevanceMemoryProjectionMode = 'disabled' | 'memo-stack';

export const RELEVANCE_PERSISTENCE_MODE = Symbol('RELEVANCE_PERSISTENCE_MODE');
export const RELEVANCE_MEMORY_PROJECTION_MODE = Symbol('RELEVANCE_MEMORY_PROJECTION_MODE');
export const RELEVANCE_PRISMA_CLIENT = Symbol('RELEVANCE_PRISMA_CLIENT');

export type RelevanceProviderTokenMap = {
  readonly [RELEVANCE_PERSISTENCE_MODE]: RelevancePersistenceMode;
  readonly [RELEVANCE_MEMORY_PROJECTION_MODE]: RelevanceMemoryProjectionMode;
  readonly [RELEVANCE_PRISMA_CLIENT]: unknown;
  readonly userRelevanceProfiles: UserRelevanceProfileRepositoryPort;
  readonly relevanceFeedback: RelevanceFeedbackRepositoryPort;
  readonly relevanceMemoryProjections: RelevanceMemoryProjectionRepositoryPort;
  readonly relevanceMemoryProjector: RelevanceMemoryProjectorPort;
  readonly relevanceMemoryGuidanceReader: RelevanceMemoryGuidanceReaderPort;
};

export const relevancePersistenceModeProvider: Provider<RelevancePersistenceMode> = {
  provide: RELEVANCE_PERSISTENCE_MODE,
  useFactory: () => resolveRelevancePersistenceMode(process.env),
};

export const relevanceMemoryProjectionModeProvider: Provider<RelevanceMemoryProjectionMode> = {
  provide: RELEVANCE_MEMORY_PROJECTION_MODE,
  useFactory: () => resolveRelevanceMemoryProjectionMode(process.env),
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

export const resolveRelevanceMemoryProjectionMode = (env: NodeJS.ProcessEnv): RelevanceMemoryProjectionMode => {
  const value = env.RELEVANCE_MEMORY_PROJECTION_MODE ?? 'disabled';

  if (value === 'disabled') {
    return 'disabled';
  }

  if (value === 'memo-stack') {
    if ((env.INFINITY_CONTEXT_URL ?? '').trim().length === 0) {
      throw new Error('RELEVANCE_MEMORY_PROJECTION_MODE=memo-stack requires INFINITY_CONTEXT_URL');
    }
    if ((env.INFINITY_CONTEXT_TOKEN ?? '').trim().length === 0) {
      throw new Error('RELEVANCE_MEMORY_PROJECTION_MODE=memo-stack requires INFINITY_CONTEXT_TOKEN');
    }

    return 'memo-stack';
  }

  throw new Error('RELEVANCE_MEMORY_PROJECTION_MODE must be "disabled" or "memo-stack"');
};
