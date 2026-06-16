import type { Provider } from '@nestjs/common';

import type {
  SummaryArtifactRepositoryPort,
  SummaryFeedbackRepositoryPort,
  SummaryJobRepositoryPort,
  SummaryPolicyRepositoryPort,
} from '../../ports';

export type SummaryPersistenceMode = 'in-memory' | 'prisma';

export const SUMMARY_PERSISTENCE_MODE = Symbol('SUMMARY_PERSISTENCE_MODE');
export const SUMMARY_PRISMA_CLIENT = Symbol('SUMMARY_PRISMA_CLIENT');
export const SUMMARY_JOB_REPOSITORY = Symbol('SUMMARY_JOB_REPOSITORY');
export const SUMMARY_ARTIFACT_REPOSITORY = Symbol('SUMMARY_ARTIFACT_REPOSITORY');
export const SUMMARY_FEEDBACK_REPOSITORY = Symbol('SUMMARY_FEEDBACK_REPOSITORY');
export const SUMMARY_POLICY_REPOSITORY = Symbol('SUMMARY_POLICY_REPOSITORY');

export type SummaryProviderTokenMap = {
  readonly [SUMMARY_PERSISTENCE_MODE]: SummaryPersistenceMode;
  readonly [SUMMARY_PRISMA_CLIENT]: unknown;
  readonly [SUMMARY_JOB_REPOSITORY]: SummaryJobRepositoryPort;
  readonly [SUMMARY_ARTIFACT_REPOSITORY]: SummaryArtifactRepositoryPort;
  readonly [SUMMARY_FEEDBACK_REPOSITORY]: SummaryFeedbackRepositoryPort;
  readonly [SUMMARY_POLICY_REPOSITORY]: SummaryPolicyRepositoryPort;
};

export const summaryPersistenceModeProvider: Provider<SummaryPersistenceMode> = {
  provide: SUMMARY_PERSISTENCE_MODE,
  useFactory: () => resolveSummaryPersistenceMode(process.env),
};

export const resolveSummaryPersistenceMode = (env: NodeJS.ProcessEnv): SummaryPersistenceMode => {
  const value = env.SUMMARY_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    return 'in-memory';
  }

  if (value === 'prisma') {
    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('SUMMARY_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('SUMMARY_PERSISTENCE must be "in-memory" or "prisma"');
};
