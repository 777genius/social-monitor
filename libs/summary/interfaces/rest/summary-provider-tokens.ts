import type { Provider } from '@nestjs/common';
import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';
import {
  parseRabbitMqDeadLetterExchange,
  parseRabbitMqDeliveryLimit,
  parseRabbitMqQueueType,
  type RabbitMqQueuePublisherOptions,
} from '@social-monitor/platform-queue/adapters/rabbitmq';

import type {
  AutoSummaryCandidateRepositoryPort,
  SummaryArtifactRepositoryPort,
  SummaryEventPublisherPort,
  SummaryEvidenceSelectorPort,
  SummaryFeedbackRepositoryPort,
  SummaryJobQueuePort,
  SummaryJobRepositoryPort,
  SummaryPolicyRepositoryPort,
  UserSummaryPreferenceReaderPort,
  YoutubeVideoSummaryProviderPort,
} from '../../ports';

export type SummaryPersistenceMode = 'in-memory' | 'prisma';
export type SummaryJobQueueMode = 'in-memory' | 'rabbitmq';
export type SummaryModelProviderMode = 'deterministic' | 'openai-responses';
export type SummaryYoutubeVideoSummaryProviderMode = 'disabled' | 'deterministic' | 'google-gemini';

export const SUMMARY_PERSISTENCE_MODE = Symbol('SUMMARY_PERSISTENCE_MODE');
export const SUMMARY_JOB_QUEUE_MODE = Symbol('SUMMARY_JOB_QUEUE_MODE');
export const SUMMARY_MODEL_PROVIDER_MODE = Symbol('SUMMARY_MODEL_PROVIDER_MODE');
export const SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER_MODE = Symbol('SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER_MODE');
export const SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS = Symbol('SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS');
export const SUMMARY_RABBITMQ_QUEUE_CHANNEL = Symbol('SUMMARY_RABBITMQ_QUEUE_CHANNEL');
export const SUMMARY_PRISMA_CLIENT = Symbol('SUMMARY_PRISMA_CLIENT');
export const SUMMARY_JOB_REPOSITORY = Symbol('SUMMARY_JOB_REPOSITORY');
export const SUMMARY_JOB_QUEUE = Symbol('SUMMARY_JOB_QUEUE');
export const SUMMARY_EVIDENCE_SELECTOR = Symbol('SUMMARY_EVIDENCE_SELECTOR');
export const SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER = Symbol('SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER');
export const SUMMARY_ARTIFACT_REPOSITORY = Symbol('SUMMARY_ARTIFACT_REPOSITORY');
export const SUMMARY_FEEDBACK_REPOSITORY = Symbol('SUMMARY_FEEDBACK_REPOSITORY');
export const SUMMARY_POLICY_REPOSITORY = Symbol('SUMMARY_POLICY_REPOSITORY');
export const SUMMARY_EVENT_PUBLISHER = Symbol('SUMMARY_EVENT_PUBLISHER');
export const SUMMARY_USER_SUMMARY_PREFERENCE_READER = Symbol('SUMMARY_USER_SUMMARY_PREFERENCE_READER');
export const SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY = Symbol('SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY');

export type SummaryProviderTokenMap = {
  readonly [SUMMARY_PERSISTENCE_MODE]: SummaryPersistenceMode;
  readonly [SUMMARY_JOB_QUEUE_MODE]: SummaryJobQueueMode;
  readonly [SUMMARY_MODEL_PROVIDER_MODE]: SummaryModelProviderMode;
  readonly [SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER_MODE]: SummaryYoutubeVideoSummaryProviderMode;
  readonly [SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS]: RabbitMqQueuePublisherOptions;
  readonly [SUMMARY_RABBITMQ_QUEUE_CHANNEL]: unknown;
  readonly [SUMMARY_PRISMA_CLIENT]: unknown;
  readonly [SUMMARY_JOB_REPOSITORY]: SummaryJobRepositoryPort;
  readonly [SUMMARY_JOB_QUEUE]: SummaryJobQueuePort;
  readonly [SUMMARY_EVIDENCE_SELECTOR]: SummaryEvidenceSelectorPort;
  readonly [SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER]: YoutubeVideoSummaryProviderPort;
  readonly [SUMMARY_ARTIFACT_REPOSITORY]: SummaryArtifactRepositoryPort;
  readonly [SUMMARY_FEEDBACK_REPOSITORY]: SummaryFeedbackRepositoryPort;
  readonly [SUMMARY_POLICY_REPOSITORY]: SummaryPolicyRepositoryPort;
  readonly [SUMMARY_EVENT_PUBLISHER]: SummaryEventPublisherPort;
  readonly [SUMMARY_USER_SUMMARY_PREFERENCE_READER]: UserSummaryPreferenceReaderPort;
  readonly [SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY]: AutoSummaryCandidateRepositoryPort;
};

export const summaryPersistenceModeProvider: Provider<SummaryPersistenceMode> = {
  provide: SUMMARY_PERSISTENCE_MODE,
  useFactory: () => resolveSummaryPersistenceMode(process.env),
};

export const summaryJobQueueModeProvider: Provider<SummaryJobQueueMode> = {
  provide: SUMMARY_JOB_QUEUE_MODE,
  useFactory: () => resolveSummaryJobQueueMode(process.env),
};

export const summaryModelProviderModeProvider: Provider<SummaryModelProviderMode> = {
  provide: SUMMARY_MODEL_PROVIDER_MODE,
  useFactory: () => resolveSummaryModelProviderMode(process.env),
};

export const summaryYoutubeVideoSummaryProviderModeProvider: Provider<SummaryYoutubeVideoSummaryProviderMode> = {
  provide: SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER_MODE,
  useFactory: () => resolveSummaryYoutubeVideoSummaryProviderMode(process.env),
};

export const summaryRabbitMqJobQueueOptionsProvider: Provider<RabbitMqQueuePublisherOptions> = {
  provide: SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS,
  useFactory: () => resolveSummaryRabbitMqJobQueueOptions(process.env),
};

export const resolveSummaryPersistenceMode = (env: NodeJS.ProcessEnv): SummaryPersistenceMode => {
  const value = env.SUMMARY_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'SUMMARY_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    return 'in-memory';
  }

  if (value === 'prisma') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'SUMMARY_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('SUMMARY_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('SUMMARY_PERSISTENCE must be "in-memory" or "prisma"');
};

export const resolveSummaryJobQueueMode = (env: NodeJS.ProcessEnv): SummaryJobQueueMode => {
  const value = env.SUMMARY_JOB_QUEUE_MODE ?? 'in-memory';

  if (value === 'in-memory') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'SUMMARY_JOB_QUEUE_MODE',
      selectedMode: value,
      durableModes: ['rabbitmq'],
    });

    return 'in-memory';
  }

  if (value === 'rabbitmq') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'SUMMARY_JOB_QUEUE_MODE',
      selectedMode: value,
      durableModes: ['rabbitmq'],
    });

    if ((env.RABBITMQ_URL ?? '').trim().length === 0) {
      throw new Error('SUMMARY_JOB_QUEUE_MODE=rabbitmq requires RABBITMQ_URL');
    }

    return 'rabbitmq';
  }

  throw new Error('SUMMARY_JOB_QUEUE_MODE must be "in-memory" or "rabbitmq"');
};

export const resolveSummaryModelProviderMode = (env: NodeJS.ProcessEnv): SummaryModelProviderMode => {
  const value = env.SUMMARY_MODEL_PROVIDER ?? 'deterministic';

  if (value === 'deterministic' || value === 'openai-responses') {
    return value;
  }

  throw new Error('SUMMARY_MODEL_PROVIDER must be "deterministic" or "openai-responses"');
};

export const resolveSummaryYoutubeVideoSummaryProviderMode = (
  env: NodeJS.ProcessEnv,
): SummaryYoutubeVideoSummaryProviderMode => {
  const value = env.SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER ?? 'disabled';

  if (value === 'disabled' || value === 'deterministic' || value === 'google-gemini') {
    return value;
  }

  throw new Error('SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER must be "disabled", "deterministic", or "google-gemini"');
};

export const resolveSummaryRabbitMqJobQueueOptions = (
  env: NodeJS.ProcessEnv,
): RabbitMqQueuePublisherOptions => ({
  exchange: nonEmptyOrFallback(env.RABBITMQ_COMMAND_EXCHANGE, 'social-monitor.commands'),
  exchangeType: 'direct',
  durable: true,
  persistent: true,
  defaultQueuePrefix: 'jobs',
  routes: {
    'summary.job.execute': {
      queue: nonEmptyOrFallback(env.RABBITMQ_SUMMARY_QUEUE, 'jobs.summary.execute'),
      routingKey: 'summary.job.execute',
      durable: true,
      deadLetterExchange: parseRabbitMqDeadLetterExchange(env.RABBITMQ_DEAD_LETTER_EXCHANGE, {
        runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
        settingName: 'SUMMARY_JOB_QUEUE_MODE=rabbitmq',
      }),
      queueType: parseRabbitMqQueueType(env.RABBITMQ_QUEUE_TYPE),
      deliveryLimit: parseRabbitMqDeliveryLimit(env.RABBITMQ_QUEUE_DELIVERY_LIMIT),
    },
  },
});

export const resolveSummaryJobQuotaPerHour = (env: NodeJS.ProcessEnv): number =>
  parsePositiveInteger(env.SUMMARY_JOB_QUOTA_PER_HOUR, 60);

export const resolveSummaryYoutubeVideoSummaryMaxItems = (env: NodeJS.ProcessEnv): number =>
  parsePositiveInteger(env.SUMMARY_YOUTUBE_VIDEO_SUMMARY_MAX_ITEMS, 3);

export const resolveSummaryYoutubeVideoSummaryMaxPreviewCharacters = (env: NodeJS.ProcessEnv): number =>
  parsePositiveInteger(env.SUMMARY_YOUTUBE_VIDEO_SUMMARY_MAX_PREVIEW_CHARACTERS, 4_000);

export const resolveSummaryGeminiYoutubeVideoSummaryTimeoutMs = (env: NodeJS.ProcessEnv): number =>
  parsePositiveInteger(env.GEMINI_YOUTUBE_VIDEO_SUMMARY_TIMEOUT_MS, 120_000);

const nonEmptyOrFallback = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
};
