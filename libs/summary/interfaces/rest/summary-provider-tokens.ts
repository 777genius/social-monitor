import type { Provider } from "@nestjs/common";
import { assertRuntimeProfileAllowsMode } from "@social-monitor/platform-config";
import {
  parseRabbitMqDeadLetterExchange,
  parseRabbitMqDeliveryLimit,
  parseRabbitMqQueueType,
  type RabbitMqQueuePublisherOptions,
} from "@social-monitor/platform-queue/adapters/rabbitmq";

import {
  resolveOpenAiResponsesReaderSummaryModelOptions,
  type OpenAiResponsesReaderSummaryModelAdapterOptions,
} from "../../adapters/model/openai-responses-reader-summary-model.adapter";
import {
  EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE,
  type AutoSummaryCandidateRepositoryPort,
  type ReaderSummaryArtifactRepositoryPort,
  type ReaderSummaryContextProviderPort,
  type READER_SUMMARY_COVERAGE_COUNTER,
  type ReaderSummaryCoverageCounterPort,
  type ReaderSummaryEvidenceSelectorPort,
  type ReaderSummaryJobRepositoryPort,
  type ReaderSummaryJobQueuePort,
  type ReaderSummaryPolicyRepositoryPort,
  type ReaderSummaryPreviewMediaEnricherPort,
  type ReaderSummaryPublicationPort,
  type SummaryArtifactRepositoryPort,
  type SummaryEventPublisherPort,
  type SummaryEvidenceSelectorPort,
  type SummaryFeedbackRepositoryPort,
  type SummaryJobQueuePort,
  type SummaryJobRepositoryPort,
  type SummaryMemoryPort,
  type SummaryPolicyRepositoryPort,
  type UserSummaryPreferenceReaderPort,
  type YoutubeVideoSummaryProviderPort,
} from "../../ports";

export type SummaryPersistenceMode = "in-memory" | "prisma";
export type SummaryJobQueueMode = "in-memory" | "rabbitmq";
export type SummaryModelProviderMode =
  "deterministic" | "openai-responses" | "agent-runtime";
export type ReaderSummaryModelProviderMode =
  "deterministic" | "openai-responses" | "agent-runtime";
export type ReaderSummaryTopicLabelerMode = "deterministic" | "agent-runtime";
export type SummaryMemoryMode = "disabled" | "memo-stack";
export type SummaryYoutubeVideoSummaryProviderMode =
  "disabled" | "deterministic" | "google-gemini";

export const SUMMARY_PERSISTENCE_MODE = Symbol("SUMMARY_PERSISTENCE_MODE");
export const SUMMARY_JOB_QUEUE_MODE = Symbol("SUMMARY_JOB_QUEUE_MODE");
export const SUMMARY_MODEL_PROVIDER_MODE = Symbol(
  "SUMMARY_MODEL_PROVIDER_MODE",
);
export const READER_SUMMARY_MODEL_PROVIDER_MODE = Symbol(
  "READER_SUMMARY_MODEL_PROVIDER_MODE",
);
export const READER_SUMMARY_TOPIC_LABELER_MODE = Symbol(
  "READER_SUMMARY_TOPIC_LABELER_MODE",
);
export const READER_SUMMARY_OPENAI_RESPONSES_MODEL_OPTIONS = Symbol(
  "READER_SUMMARY_OPENAI_RESPONSES_MODEL_OPTIONS",
);
export const SUMMARY_MEMORY_MODE = Symbol("SUMMARY_MEMORY_MODE");
export const SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER_MODE = Symbol(
  "SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER_MODE",
);
export const SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS = Symbol(
  "SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS",
);
export const SUMMARY_RABBITMQ_QUEUE_CHANNEL = Symbol(
  "SUMMARY_RABBITMQ_QUEUE_CHANNEL",
);
export const SUMMARY_PRISMA_CLIENT = Symbol("SUMMARY_PRISMA_CLIENT");
export const SUMMARY_JOB_REPOSITORY = Symbol("SUMMARY_JOB_REPOSITORY");
export const SUMMARY_JOB_QUEUE = Symbol("SUMMARY_JOB_QUEUE");
export const SUMMARY_EVIDENCE_SELECTOR = Symbol("SUMMARY_EVIDENCE_SELECTOR");
export const SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER = Symbol(
  "SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER",
);
export const SUMMARY_ARTIFACT_REPOSITORY = Symbol(
  "SUMMARY_ARTIFACT_REPOSITORY",
);
export const SUMMARY_FEEDBACK_REPOSITORY = Symbol(
  "SUMMARY_FEEDBACK_REPOSITORY",
);
export const SUMMARY_POLICY_REPOSITORY = Symbol("SUMMARY_POLICY_REPOSITORY");
export const SUMMARY_EVENT_PUBLISHER = Symbol("SUMMARY_EVENT_PUBLISHER");
export const SUMMARY_MEMORY = Symbol("SUMMARY_MEMORY");
export const SUMMARY_USER_SUMMARY_PREFERENCE_READER = Symbol(
  "SUMMARY_USER_SUMMARY_PREFERENCE_READER",
);
export const SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY = Symbol(
  "SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY",
);
export const READER_SUMMARY_JOB_REPOSITORY = Symbol(
  "READER_SUMMARY_JOB_REPOSITORY",
);
export const READER_SUMMARY_JOB_QUEUE = Symbol("READER_SUMMARY_JOB_QUEUE");
export const READER_SUMMARY_EVIDENCE_SELECTOR = Symbol(
  "READER_SUMMARY_EVIDENCE_SELECTOR",
);
export const READER_SUMMARY_ARTIFACT_REPOSITORY = Symbol(
  "READER_SUMMARY_ARTIFACT_REPOSITORY",
);
export const READER_SUMMARY_POLICY_REPOSITORY = Symbol(
  "READER_SUMMARY_POLICY_REPOSITORY",
);
export const READER_SUMMARY_PUBLICATION = Symbol(
  "READER_SUMMARY_PUBLICATION",
);
export const READER_SUMMARY_CONTEXT_PROVIDER = Symbol(
  "READER_SUMMARY_CONTEXT_PROVIDER",
);
export const READER_SUMMARY_PREVIEW_MEDIA_ENRICHER = Symbol(
  "READER_SUMMARY_PREVIEW_MEDIA_ENRICHER",
);

export type SummaryProviderTokenMap = {
  readonly [SUMMARY_PERSISTENCE_MODE]: SummaryPersistenceMode;
  readonly [SUMMARY_JOB_QUEUE_MODE]: SummaryJobQueueMode;
  readonly [SUMMARY_MODEL_PROVIDER_MODE]: SummaryModelProviderMode;
  readonly [READER_SUMMARY_MODEL_PROVIDER_MODE]: ReaderSummaryModelProviderMode;
  readonly [READER_SUMMARY_TOPIC_LABELER_MODE]: ReaderSummaryTopicLabelerMode;
  readonly [READER_SUMMARY_OPENAI_RESPONSES_MODEL_OPTIONS]: OpenAiResponsesReaderSummaryModelAdapterOptions;
  readonly [SUMMARY_MEMORY_MODE]: SummaryMemoryMode;
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
  readonly [SUMMARY_MEMORY]: SummaryMemoryPort;
  readonly [SUMMARY_USER_SUMMARY_PREFERENCE_READER]: UserSummaryPreferenceReaderPort;
  readonly [SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY]: AutoSummaryCandidateRepositoryPort;
  readonly [READER_SUMMARY_JOB_REPOSITORY]: ReaderSummaryJobRepositoryPort;
  readonly [READER_SUMMARY_JOB_QUEUE]: ReaderSummaryJobQueuePort;
  readonly [READER_SUMMARY_EVIDENCE_SELECTOR]: ReaderSummaryEvidenceSelectorPort;
  readonly [READER_SUMMARY_ARTIFACT_REPOSITORY]: ReaderSummaryArtifactRepositoryPort;
  readonly [READER_SUMMARY_POLICY_REPOSITORY]: ReaderSummaryPolicyRepositoryPort;
  readonly [READER_SUMMARY_PUBLICATION]: ReaderSummaryPublicationPort;
  readonly [READER_SUMMARY_CONTEXT_PROVIDER]: ReaderSummaryContextProviderPort;
  readonly [READER_SUMMARY_COVERAGE_COUNTER]: ReaderSummaryCoverageCounterPort;
  readonly [READER_SUMMARY_PREVIEW_MEDIA_ENRICHER]: ReaderSummaryPreviewMediaEnricherPort;
};

export const summaryPersistenceModeProvider: Provider<SummaryPersistenceMode> =
  {
    provide: SUMMARY_PERSISTENCE_MODE,
    useFactory: () => resolveSummaryPersistenceMode(process.env),
  };

export const summaryJobQueueModeProvider: Provider<SummaryJobQueueMode> = {
  provide: SUMMARY_JOB_QUEUE_MODE,
  useFactory: () => resolveSummaryJobQueueMode(process.env),
};

export const summaryModelProviderModeProvider: Provider<SummaryModelProviderMode> =
  {
    provide: SUMMARY_MODEL_PROVIDER_MODE,
    useFactory: () => resolveSummaryModelProviderMode(process.env),
  };

export const readerSummaryModelProviderModeProvider: Provider<ReaderSummaryModelProviderMode> =
  {
    provide: READER_SUMMARY_MODEL_PROVIDER_MODE,
    useFactory: () => resolveReaderSummaryModelProviderMode(process.env),
  };

export const readerSummaryTopicLabelerModeProvider: Provider<ReaderSummaryTopicLabelerMode> =
  {
    provide: READER_SUMMARY_TOPIC_LABELER_MODE,
    useFactory: (readerSummaryMode: ReaderSummaryModelProviderMode) =>
      resolveReaderSummaryTopicLabelerMode(process.env, readerSummaryMode),
    inject: [READER_SUMMARY_MODEL_PROVIDER_MODE],
  };

export const readerSummaryOpenAiResponsesModelOptionsProvider: Provider<OpenAiResponsesReaderSummaryModelAdapterOptions> =
  {
    provide: READER_SUMMARY_OPENAI_RESPONSES_MODEL_OPTIONS,
    useFactory: (mode: ReaderSummaryModelProviderMode) =>
      resolveOpenAiResponsesReaderSummaryModelOptions(process.env, {
        requireApiKey: mode === "openai-responses",
      }),
    inject: [READER_SUMMARY_MODEL_PROVIDER_MODE],
  };

export const summaryMemoryModeProvider: Provider<SummaryMemoryMode> = {
  provide: SUMMARY_MEMORY_MODE,
  useFactory: () => resolveSummaryMemoryMode(process.env),
};

export const summaryYoutubeVideoSummaryProviderModeProvider: Provider<SummaryYoutubeVideoSummaryProviderMode> =
  {
    provide: SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER_MODE,
    useFactory: () =>
      resolveSummaryYoutubeVideoSummaryProviderMode(process.env),
  };

export const summaryRabbitMqJobQueueOptionsProvider: Provider<RabbitMqQueuePublisherOptions> =
  {
    provide: SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS,
    useFactory: () => resolveSummaryRabbitMqJobQueueOptions(process.env),
  };

export const resolveSummaryPersistenceMode = (
  env: NodeJS.ProcessEnv,
): SummaryPersistenceMode => {
  const value = env.SUMMARY_PERSISTENCE ?? "in-memory";

  if (value === "in-memory") {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: "SUMMARY_PERSISTENCE",
      selectedMode: value,
      durableModes: ["prisma"],
    });

    return "in-memory";
  }

  if (value === "prisma") {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: "SUMMARY_PERSISTENCE",
      selectedMode: value,
      durableModes: ["prisma"],
    });

    if ((env.DATABASE_URL ?? "").trim().length === 0) {
      throw new Error("SUMMARY_PERSISTENCE=prisma requires DATABASE_URL");
    }

    return "prisma";
  }

  throw new Error('SUMMARY_PERSISTENCE must be "in-memory" or "prisma"');
};

export const resolveSummaryJobQueueMode = (
  env: NodeJS.ProcessEnv,
): SummaryJobQueueMode => {
  const value = env.SUMMARY_JOB_QUEUE_MODE ?? "in-memory";

  if (value === "in-memory") {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: "SUMMARY_JOB_QUEUE_MODE",
      selectedMode: value,
      durableModes: ["rabbitmq"],
    });

    return "in-memory";
  }

  if (value === "rabbitmq") {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: "SUMMARY_JOB_QUEUE_MODE",
      selectedMode: value,
      durableModes: ["rabbitmq"],
    });

    if ((env.RABBITMQ_URL ?? "").trim().length === 0) {
      throw new Error("SUMMARY_JOB_QUEUE_MODE=rabbitmq requires RABBITMQ_URL");
    }

    return "rabbitmq";
  }

  throw new Error('SUMMARY_JOB_QUEUE_MODE must be "in-memory" or "rabbitmq"');
};

export const resolveSummaryModelProviderMode = (
  env: NodeJS.ProcessEnv,
): SummaryModelProviderMode => {
  const value = env.SUMMARY_MODEL_PROVIDER ?? "deterministic";

  if (
    value === "deterministic" ||
    value === "openai-responses" ||
    value === "agent-runtime"
  ) {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: "SUMMARY_MODEL_PROVIDER",
      selectedMode: value,
      durableModes: ["openai-responses", "agent-runtime"],
    });

    return value;
  }

  throw new Error(
    'SUMMARY_MODEL_PROVIDER must be "deterministic", "openai-responses", or "agent-runtime"',
  );
};

export const resolveReaderSummaryModelProviderMode = (
  env: NodeJS.ProcessEnv,
): ReaderSummaryModelProviderMode => {
  const value = env.READER_SUMMARY_MODEL_PROVIDER ?? "agent-runtime";

  if (
    value === "deterministic" ||
    value === "openai-responses" ||
    value === "agent-runtime"
  ) {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: "READER_SUMMARY_MODEL_PROVIDER",
      selectedMode: value,
      durableModes: ["openai-responses", "agent-runtime"],
    });

    return value;
  }

  throw new Error(
    'READER_SUMMARY_MODEL_PROVIDER must be "deterministic", "openai-responses", or "agent-runtime"',
  );
};

export const resolveReaderSummaryTopicLabelerMode = (
  env: NodeJS.ProcessEnv,
  readerSummaryMode: ReaderSummaryModelProviderMode,
): ReaderSummaryTopicLabelerMode => {
  const value = env.READER_SUMMARY_TOPIC_LABELER ?? "agent-runtime";
  const selected =
    value === "auto"
      ? readerSummaryMode === "agent-runtime" ||
        (env.AGENT_RUNTIME_GRPC_ADDRESS ?? "").trim().length > 0
        ? "agent-runtime"
        : "deterministic"
      : value;

  if (selected === "deterministic" || selected === "agent-runtime") {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: "READER_SUMMARY_TOPIC_LABELER",
      selectedMode: selected,
      durableModes: ["agent-runtime"],
    });

    return selected;
  }

  throw new Error(
    'READER_SUMMARY_TOPIC_LABELER must be "auto", "deterministic", or "agent-runtime"',
  );
};

export const resolveSummaryMemoryMode = (
  env: NodeJS.ProcessEnv,
): SummaryMemoryMode => {
  const value = env.SUMMARY_MEMORY_MODE ?? "disabled";

  if (value === "disabled") {
    return "disabled";
  }

  if (value === "memo-stack") {
    if ((env.INFINITY_CONTEXT_URL ?? "").trim().length === 0) {
      throw new Error(
        "SUMMARY_MEMORY_MODE=memo-stack requires INFINITY_CONTEXT_URL",
      );
    }
    if ((env.INFINITY_CONTEXT_TOKEN ?? "").trim().length === 0) {
      throw new Error(
        "SUMMARY_MEMORY_MODE=memo-stack requires INFINITY_CONTEXT_TOKEN",
      );
    }
    return "memo-stack";
  }

  throw new Error('SUMMARY_MEMORY_MODE must be "disabled" or "memo-stack"');
};

export const resolveSummaryYoutubeVideoSummaryProviderMode = (
  env: NodeJS.ProcessEnv,
): SummaryYoutubeVideoSummaryProviderMode => {
  const value = env.SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER ?? "disabled";

  if (
    value === "disabled" ||
    value === "deterministic" ||
    value === "google-gemini"
  ) {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: "SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER",
      selectedMode: value,
      durableModes: ["disabled", "google-gemini"],
    });

    return value;
  }

  throw new Error(
    'SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER must be "disabled", "deterministic", or "google-gemini"',
  );
};

export const resolveSummaryRabbitMqJobQueueOptions = (
  env: NodeJS.ProcessEnv,
): RabbitMqQueuePublisherOptions => ({
  exchange: nonEmptyOrFallback(
    env.RABBITMQ_COMMAND_EXCHANGE,
    "social-monitor.commands",
  ),
  exchangeType: "direct",
  durable: true,
  persistent: true,
  defaultQueuePrefix: "jobs",
  routes: {
    "summary.job.execute": {
      queue: nonEmptyOrFallback(
        env.RABBITMQ_SUMMARY_QUEUE,
        "jobs.summary.execute",
      ),
      routingKey: "summary.job.execute",
      durable: true,
      deadLetterExchange: parseRabbitMqDeadLetterExchange(
        env.RABBITMQ_DEAD_LETTER_EXCHANGE,
        {
          runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
          settingName: "SUMMARY_JOB_QUEUE_MODE=rabbitmq",
        },
      ),
      queueType: parseRabbitMqQueueType(env.RABBITMQ_QUEUE_TYPE),
      deliveryLimit: parseRabbitMqDeliveryLimit(
        env.RABBITMQ_QUEUE_DELIVERY_LIMIT,
      ),
    },
    [EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE]: {
      queue: nonEmptyOrFallback(
        env.RABBITMQ_READER_SUMMARY_QUEUE,
        "jobs.reader-summary.execute",
      ),
      routingKey: EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE,
      durable: true,
      deadLetterExchange: parseRabbitMqDeadLetterExchange(
        env.RABBITMQ_DEAD_LETTER_EXCHANGE,
        {
          runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
          settingName: "SUMMARY_JOB_QUEUE_MODE=rabbitmq",
        },
      ),
      queueType: parseRabbitMqQueueType(env.RABBITMQ_QUEUE_TYPE),
      deliveryLimit: parseRabbitMqDeliveryLimit(
        env.RABBITMQ_QUEUE_DELIVERY_LIMIT,
      ),
    },
  },
});

export const resolveSummaryJobQuotaPerHour = (env: NodeJS.ProcessEnv): number =>
  parsePositiveInteger(env.SUMMARY_JOB_QUOTA_PER_HOUR, 60);

export const resolveSummaryYoutubeVideoSummaryMaxItems = (
  env: NodeJS.ProcessEnv,
): number =>
  parsePositiveInteger(env.SUMMARY_YOUTUBE_VIDEO_SUMMARY_MAX_ITEMS, 3);

export const resolveSummaryYoutubeVideoSummaryMaxPreviewCharacters = (
  env: NodeJS.ProcessEnv,
): number =>
  parsePositiveInteger(
    env.SUMMARY_YOUTUBE_VIDEO_SUMMARY_MAX_PREVIEW_CHARACTERS,
    4_000,
  );

export const resolveSummaryGeminiYoutubeVideoSummaryTimeoutMs = (
  env: NodeJS.ProcessEnv,
): number =>
  parsePositiveInteger(env.GEMINI_YOUTUBE_VIDEO_SUMMARY_TIMEOUT_MS, 120_000);

const nonEmptyOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
