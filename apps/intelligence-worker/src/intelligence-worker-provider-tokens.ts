import { assertRuntimeProfileAllowsMode } from "@social-monitor/platform-config";
import {
  parseRabbitMqDeadLetterExchange,
  parseRabbitMqDeliveryLimit,
  parseRabbitMqQueueType,
  type RabbitMqQueueType,
} from "@social-monitor/platform-queue/adapters/rabbitmq";

export * from "./periodic-reader-summary-scheduler-options";

export type IntelligenceSummaryJobLoopOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
  readonly tenantId?: string;
  readonly workspaceId?: string;
};
export type IntelligenceReaderSummaryJobLoopOptions =
  IntelligenceSummaryJobLoopOptions;
export type IntelligenceSummaryQueueReaderMode = "in-memory" | "rabbitmq";
export type IntelligenceRabbitMqSummaryQueueReaderOptions = {
  readonly queue: string;
  readonly deadLetterExchange?: string;
  readonly queueType: RabbitMqQueueType;
  readonly deliveryLimit: number;
};
export type IntelligenceRabbitMqReaderSummaryQueueReaderOptions =
  IntelligenceRabbitMqSummaryQueueReaderOptions;
export type IntelligenceSummaryQueueDrainLoopOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
};
export type IntelligenceReaderSummaryQueueDrainLoopOptions =
  IntelligenceSummaryQueueDrainLoopOptions;
export type IntelligenceAutoSummarySchedulerOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly minFeedAgeMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
  readonly tenantId?: string;
  readonly workspaceId?: string;
};
export type IntelligenceRelevanceMemoryProjectionLoopOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
  readonly tenantId?: string;
  readonly workspaceId?: string;
};

export const INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS = Symbol(
  "INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS",
);
export const INTELLIGENCE_READER_SUMMARY_JOB_LOOP_OPTIONS = Symbol(
  "INTELLIGENCE_READER_SUMMARY_JOB_LOOP_OPTIONS",
);
export const INTELLIGENCE_SUMMARY_QUEUE_READER_MODE = Symbol(
  "INTELLIGENCE_SUMMARY_QUEUE_READER_MODE",
);
export const INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS = Symbol(
  "INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS",
);
export const INTELLIGENCE_RABBITMQ_READER_SUMMARY_QUEUE_READER_OPTIONS = Symbol(
  "INTELLIGENCE_RABBITMQ_READER_SUMMARY_QUEUE_READER_OPTIONS",
);
export const INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS = Symbol(
  "INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS",
);
export const INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS = Symbol(
  "INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS",
);
export const INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_OPTIONS = Symbol(
  "INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_OPTIONS",
);
export const INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP_OPTIONS = Symbol(
  "INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP_OPTIONS",
);

export const resolveIntelligenceSummaryJobLoopOptions = (
  env: NodeJS.ProcessEnv,
): IntelligenceSummaryJobLoopOptions => {
  const defaultMode =
    env.NODE_ENV === "test" ||
    env.INTELLIGENCE_SUMMARY_QUEUE_READER === "rabbitmq"
      ? "disabled"
      : "enabled";
  const loopMode = env.INTELLIGENCE_SUMMARY_JOB_LOOP ?? defaultMode;

  if (loopMode !== "enabled" && loopMode !== "disabled") {
    throw new Error(
      'INTELLIGENCE_SUMMARY_JOB_LOOP must be "enabled" or "disabled"',
    );
  }

  const tenant = emptyToUndefined(env.INTELLIGENCE_SUMMARY_JOB_LOOP_TENANT_ID);
  const workspace = emptyToUndefined(
    env.INTELLIGENCE_SUMMARY_JOB_LOOP_WORKSPACE_ID,
  );

  if ((tenant === undefined) !== (workspace === undefined)) {
    throw new Error(
      "INTELLIGENCE_SUMMARY_JOB_LOOP_TENANT_ID and INTELLIGENCE_SUMMARY_JOB_LOOP_WORKSPACE_ID must be set together",
    );
  }

  return {
    enabled: loopMode === "enabled",
    intervalMs: parseBoundedInteger(
      env.INTELLIGENCE_SUMMARY_JOB_LOOP_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    ),
    limit: parseBoundedInteger(
      env.INTELLIGENCE_SUMMARY_JOB_LOOP_LIMIT,
      20,
      1,
      100,
    ),
    runOnStart: parseBoolean(
      env.INTELLIGENCE_SUMMARY_JOB_LOOP_RUN_ON_START,
      true,
    ),
    tenantId: tenant,
    workspaceId: workspace,
  };
};

export const resolveIntelligenceReaderSummaryJobLoopOptions = (
  env: NodeJS.ProcessEnv,
): IntelligenceReaderSummaryJobLoopOptions => {
  const defaultMode =
    env.NODE_ENV === "test" ||
    env.INTELLIGENCE_SUMMARY_QUEUE_READER === "rabbitmq"
      ? "disabled"
      : "enabled";
  const loopMode = env.INTELLIGENCE_READER_SUMMARY_JOB_LOOP ?? defaultMode;

  if (loopMode !== "enabled" && loopMode !== "disabled") {
    throw new Error(
      'INTELLIGENCE_READER_SUMMARY_JOB_LOOP must be "enabled" or "disabled"',
    );
  }

  const tenant = emptyToUndefined(
    env.INTELLIGENCE_READER_SUMMARY_JOB_LOOP_TENANT_ID,
  );
  const workspace = emptyToUndefined(
    env.INTELLIGENCE_READER_SUMMARY_JOB_LOOP_WORKSPACE_ID,
  );

  if ((tenant === undefined) !== (workspace === undefined)) {
    throw new Error(
      "INTELLIGENCE_READER_SUMMARY_JOB_LOOP_TENANT_ID and INTELLIGENCE_READER_SUMMARY_JOB_LOOP_WORKSPACE_ID must be set together",
    );
  }

  return {
    enabled: loopMode === "enabled",
    intervalMs: parseBoundedInteger(
      env.INTELLIGENCE_READER_SUMMARY_JOB_LOOP_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    ),
    limit: parseBoundedInteger(
      env.INTELLIGENCE_READER_SUMMARY_JOB_LOOP_LIMIT,
      20,
      1,
      100,
    ),
    runOnStart: parseBoolean(
      env.INTELLIGENCE_READER_SUMMARY_JOB_LOOP_RUN_ON_START,
      true,
    ),
    tenantId: tenant,
    workspaceId: workspace,
  };
};

export const resolveIntelligenceSummaryQueueReaderMode = (
  env: NodeJS.ProcessEnv,
): IntelligenceSummaryQueueReaderMode => {
  const value = env.INTELLIGENCE_SUMMARY_QUEUE_READER ?? "in-memory";

  if (value === "in-memory") {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: "INTELLIGENCE_SUMMARY_QUEUE_READER",
      selectedMode: value,
      durableModes: ["rabbitmq"],
    });

    return "in-memory";
  }

  if (value === "rabbitmq") {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: "INTELLIGENCE_SUMMARY_QUEUE_READER",
      selectedMode: value,
      durableModes: ["rabbitmq"],
    });

    if ((env.RABBITMQ_URL ?? "").trim().length === 0) {
      throw new Error(
        "INTELLIGENCE_SUMMARY_QUEUE_READER=rabbitmq requires RABBITMQ_URL",
      );
    }

    return "rabbitmq";
  }

  throw new Error(
    'INTELLIGENCE_SUMMARY_QUEUE_READER must be "in-memory" or "rabbitmq"',
  );
};

export const resolveIntelligenceRabbitMqSummaryQueueReaderOptions = (
  env: NodeJS.ProcessEnv,
): IntelligenceRabbitMqSummaryQueueReaderOptions => ({
  queue: nonEmptyOrFallback(env.RABBITMQ_SUMMARY_QUEUE, "jobs.summary.execute"),
  deadLetterExchange: parseRabbitMqDeadLetterExchange(
    env.RABBITMQ_DEAD_LETTER_EXCHANGE,
    {
      runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
      settingName: "INTELLIGENCE_SUMMARY_QUEUE_READER=rabbitmq",
    },
  ),
  queueType: parseRabbitMqQueueType(env.RABBITMQ_QUEUE_TYPE),
  deliveryLimit: parseRabbitMqDeliveryLimit(env.RABBITMQ_QUEUE_DELIVERY_LIMIT),
});

export const resolveIntelligenceRabbitMqReaderSummaryQueueReaderOptions = (
  env: NodeJS.ProcessEnv,
): IntelligenceRabbitMqReaderSummaryQueueReaderOptions => ({
  queue: nonEmptyOrFallback(
    env.RABBITMQ_READER_SUMMARY_QUEUE ?? env.RABBITMQ_BRIEFING_QUEUE,
    "jobs.reader-summary.execute",
  ),
  deadLetterExchange: parseRabbitMqDeadLetterExchange(
    env.RABBITMQ_DEAD_LETTER_EXCHANGE,
    {
      runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
      settingName: "INTELLIGENCE_SUMMARY_QUEUE_READER=rabbitmq",
    },
  ),
  queueType: parseRabbitMqQueueType(env.RABBITMQ_QUEUE_TYPE),
  deliveryLimit: parseRabbitMqDeliveryLimit(env.RABBITMQ_QUEUE_DELIVERY_LIMIT),
});

export const resolveIntelligenceSummaryQueueDrainLoopOptions = (
  env: NodeJS.ProcessEnv,
): IntelligenceSummaryQueueDrainLoopOptions => {
  const defaultMode =
    env.INTELLIGENCE_SUMMARY_QUEUE_READER === "rabbitmq"
      ? "enabled"
      : "disabled";
  const loopMode =
    env.INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP ??
    (env.NODE_ENV === "test" ? "disabled" : defaultMode);

  if (loopMode !== "enabled" && loopMode !== "disabled") {
    throw new Error(
      'INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP must be "enabled" or "disabled"',
    );
  }

  return {
    enabled: loopMode === "enabled",
    intervalMs: parseBoundedInteger(
      env.INTELLIGENCE_SUMMARY_QUEUE_DRAIN_INTERVAL_MS,
      5_000,
      500,
      3_600_000,
    ),
    limit: parseBoundedInteger(
      env.INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LIMIT,
      20,
      1,
      100,
    ),
    runOnStart: parseBoolean(
      env.INTELLIGENCE_SUMMARY_QUEUE_DRAIN_RUN_ON_START,
      true,
    ),
  };
};

export const resolveIntelligenceReaderSummaryQueueDrainLoopOptions = (
  env: NodeJS.ProcessEnv,
): IntelligenceReaderSummaryQueueDrainLoopOptions => {
  const defaultMode =
    env.INTELLIGENCE_SUMMARY_QUEUE_READER === "rabbitmq"
      ? "enabled"
      : "disabled";
  const loopMode =
    env.INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP ??
    (env.NODE_ENV === "test" ? "disabled" : defaultMode);

  if (loopMode !== "enabled" && loopMode !== "disabled") {
    throw new Error(
      'INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP must be "enabled" or "disabled"',
    );
  }

  return {
    enabled: loopMode === "enabled",
    intervalMs: parseBoundedInteger(
      env.INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_INTERVAL_MS,
      5_000,
      500,
      3_600_000,
    ),
    limit: parseBoundedInteger(
      env.INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LIMIT,
      20,
      1,
      100,
    ),
    runOnStart: parseBoolean(
      env.INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_RUN_ON_START,
      true,
    ),
  };
};

export const resolveIntelligenceAutoSummarySchedulerOptions = (
  env: NodeJS.ProcessEnv,
): IntelligenceAutoSummarySchedulerOptions => {
  const loopMode = env.INTELLIGENCE_AUTO_SUMMARY_SCHEDULER ?? "disabled";

  if (loopMode !== "enabled" && loopMode !== "disabled") {
    throw new Error(
      'INTELLIGENCE_AUTO_SUMMARY_SCHEDULER must be "enabled" or "disabled"',
    );
  }

  const tenant = emptyToUndefined(
    env.INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_TENANT_ID,
  );
  const workspace = emptyToUndefined(
    env.INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_WORKSPACE_ID,
  );

  if ((tenant === undefined) !== (workspace === undefined)) {
    throw new Error(
      "INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_TENANT_ID and INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_WORKSPACE_ID must be set together",
    );
  }

  return {
    enabled: loopMode === "enabled",
    intervalMs: parseBoundedInteger(
      env.INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    ),
    minFeedAgeMs: parseBoundedInteger(
      env.INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_MIN_FEED_AGE_MS,
      30_000,
      0,
      3_600_000,
    ),
    limit: parseBoundedInteger(
      env.INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_LIMIT,
      20,
      1,
      100,
    ),
    runOnStart: parseBoolean(
      env.INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_RUN_ON_START,
      true,
    ),
    tenantId: tenant,
    workspaceId: workspace,
  };
};

export const resolveIntelligenceRelevanceMemoryProjectionLoopOptions = (
  env: NodeJS.ProcessEnv,
): IntelligenceRelevanceMemoryProjectionLoopOptions => {
  const defaultMode =
    env.RELEVANCE_MEMORY_PROJECTION_MODE === "memo-stack"
      ? "enabled"
      : "disabled";
  const loopMode =
    env.INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP ??
    (env.NODE_ENV === "test" ? "disabled" : defaultMode);

  if (loopMode !== "enabled" && loopMode !== "disabled") {
    throw new Error(
      'INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP must be "enabled" or "disabled"',
    );
  }

  const tenant = emptyToUndefined(
    env.INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_TENANT_ID,
  );
  const workspace = emptyToUndefined(
    env.INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_WORKSPACE_ID,
  );

  if ((tenant === undefined) !== (workspace === undefined)) {
    throw new Error(
      "INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_TENANT_ID and INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_WORKSPACE_ID must be set together",
    );
  }

  return {
    enabled: loopMode === "enabled",
    intervalMs: parseBoundedInteger(
      env.INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_INTERVAL_MS,
      30_000,
      1_000,
      3_600_000,
    ),
    limit: parseBoundedInteger(
      env.INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LIMIT,
      20,
      1,
      100,
    ),
    runOnStart: parseBoolean(
      env.INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_RUN_ON_START,
      true,
    ),
    tenantId: tenant,
    workspaceId: workspace,
  };
};

const emptyToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const nonEmptyOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const parseBoolean = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (value === undefined) {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error('Boolean environment values must be "true" or "false"');
};

const parseBoundedInteger = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `Expected integer environment value between ${min} and ${max}`,
    );
  }

  return parsed;
};
