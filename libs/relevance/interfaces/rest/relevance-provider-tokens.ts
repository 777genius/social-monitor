import type { Provider } from '@nestjs/common';
import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';
import { readFileSync } from 'node:fs';

import type {
  RelevanceMemoryProjectionRepositoryPort,
  RelevanceMemoryGuidanceReaderPort,
  RelevanceMemoryProjectorPort,
  RelevanceFeedbackRepositoryPort,
  SourceContentQualityReviewerPort,
  UserRelevanceProfileRepositoryPort,
} from '../../ports';
import type {
  OpenAiSourceContentQualityReviewerOptions,
} from '../../adapters/model/openai-source-content-quality-reviewer.adapter';

export type RelevancePersistenceMode = 'in-memory' | 'prisma';
export type RelevanceMemoryProjectionMode = 'disabled' | 'memo-stack';
export type RelevanceContentQualityReviewerMode =
  | 'disabled'
  | 'openai-responses';

export const RELEVANCE_PERSISTENCE_MODE = Symbol('RELEVANCE_PERSISTENCE_MODE');
export const RELEVANCE_MEMORY_PROJECTION_MODE = Symbol('RELEVANCE_MEMORY_PROJECTION_MODE');
export const RELEVANCE_CONTENT_QUALITY_REVIEWER_MODE = Symbol(
  'RELEVANCE_CONTENT_QUALITY_REVIEWER_MODE',
);
export const RELEVANCE_CONTENT_QUALITY_OPENAI_OPTIONS = Symbol(
  'RELEVANCE_CONTENT_QUALITY_OPENAI_OPTIONS',
);
export const RELEVANCE_PRISMA_CLIENT = Symbol('RELEVANCE_PRISMA_CLIENT');

export type RelevanceProviderTokenMap = {
  readonly [RELEVANCE_PERSISTENCE_MODE]: RelevancePersistenceMode;
  readonly [RELEVANCE_MEMORY_PROJECTION_MODE]: RelevanceMemoryProjectionMode;
  readonly [RELEVANCE_CONTENT_QUALITY_REVIEWER_MODE]:
    RelevanceContentQualityReviewerMode;
  readonly [RELEVANCE_CONTENT_QUALITY_OPENAI_OPTIONS]:
    OpenAiSourceContentQualityReviewerOptions;
  readonly [RELEVANCE_PRISMA_CLIENT]: unknown;
  readonly userRelevanceProfiles: UserRelevanceProfileRepositoryPort;
  readonly relevanceFeedback: RelevanceFeedbackRepositoryPort;
  readonly relevanceMemoryProjections: RelevanceMemoryProjectionRepositoryPort;
  readonly relevanceMemoryProjector: RelevanceMemoryProjectorPort;
  readonly relevanceMemoryGuidanceReader: RelevanceMemoryGuidanceReaderPort;
  readonly sourceContentQualityReviewer: SourceContentQualityReviewerPort;
};

export const relevancePersistenceModeProvider: Provider<RelevancePersistenceMode> = {
  provide: RELEVANCE_PERSISTENCE_MODE,
  useFactory: () => resolveRelevancePersistenceMode(process.env),
};

export const relevanceMemoryProjectionModeProvider: Provider<RelevanceMemoryProjectionMode> = {
  provide: RELEVANCE_MEMORY_PROJECTION_MODE,
  useFactory: () => resolveRelevanceMemoryProjectionMode(process.env),
};

export const relevanceContentQualityReviewerModeProvider: Provider<RelevanceContentQualityReviewerMode> = {
  provide: RELEVANCE_CONTENT_QUALITY_REVIEWER_MODE,
  useFactory: () => resolveRelevanceContentQualityReviewerMode(process.env),
};

export const relevanceContentQualityOpenAiOptionsProvider: Provider<OpenAiSourceContentQualityReviewerOptions> = {
  provide: RELEVANCE_CONTENT_QUALITY_OPENAI_OPTIONS,
  useFactory: (mode: RelevanceContentQualityReviewerMode) =>
    resolveRelevanceContentQualityOpenAiOptions(process.env, {
      requireApiKey: mode === 'openai-responses',
    }),
  inject: [RELEVANCE_CONTENT_QUALITY_REVIEWER_MODE],
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

export const resolveRelevanceContentQualityReviewerMode = (
  env: NodeJS.ProcessEnv,
): RelevanceContentQualityReviewerMode => {
  const value = env.RELEVANCE_CONTENT_QUALITY_REVIEWER ?? 'auto';

  if (value === 'disabled' || value === 'openai-responses') {
    return value;
  }

  if (value === 'auto') {
    return hasOpenAiApiKeySource(env) ? 'openai-responses' : 'disabled';
  }

  throw new Error(
    'RELEVANCE_CONTENT_QUALITY_REVIEWER must be "auto", "disabled" or "openai-responses"',
  );
};

export const resolveRelevanceContentQualityOpenAiOptions = (
  env: NodeJS.ProcessEnv,
  options: { readonly requireApiKey: boolean } = { requireApiKey: false },
): OpenAiSourceContentQualityReviewerOptions => {
  const apiKey = resolveOpenAiApiKey(env);

  if (options.requireApiKey && apiKey.length === 0) {
    throw new Error(
      'RELEVANCE_CONTENT_QUALITY_REVIEWER=openai-responses requires OPENAI_API_KEY or OPENAI_API_KEY_FILE',
    );
  }

  return {
    apiKey,
    endpointUrl: env.RELEVANCE_CONTENT_QUALITY_OPENAI_ENDPOINT,
    model: env.RELEVANCE_CONTENT_QUALITY_OPENAI_MODEL,
    timeoutMs: positiveInteger(env.RELEVANCE_CONTENT_QUALITY_OPENAI_TIMEOUT_MS),
    maxOutputTokens: positiveInteger(
      env.RELEVANCE_CONTENT_QUALITY_OPENAI_MAX_OUTPUT_TOKENS,
    ),
  };
};

const resolveOpenAiApiKey = (env: NodeJS.ProcessEnv): string => {
  const direct = env.OPENAI_API_KEY?.trim();

  if (direct !== undefined && direct.length > 0) {
    return direct;
  }

  const keyFile = env.OPENAI_API_KEY_FILE?.trim();

  if (keyFile === undefined || keyFile.length === 0) {
    return '';
  }

  return readFileSync(keyFile, 'utf8').trim();
};

const hasOpenAiApiKeySource = (env: NodeJS.ProcessEnv): boolean =>
  (env.OPENAI_API_KEY?.trim().length ?? 0) > 0 ||
  (env.OPENAI_API_KEY_FILE?.trim().length ?? 0) > 0;

const positiveInteger = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
