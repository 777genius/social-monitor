export type IntelligencePeriodicReaderSummarySchedulerOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
  readonly readyAtUtc: {
    readonly hour: number;
    readonly minute: number;
  };
  readonly tenantId?: string;
  readonly workspaceId?: string;
};

export const INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_OPTIONS = Symbol(
  "INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_OPTIONS",
);

export const resolveIntelligencePeriodicReaderSummarySchedulerOptions = (
  env: NodeJS.ProcessEnv,
): IntelligencePeriodicReaderSummarySchedulerOptions => {
  const loopMode =
    env.INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER ?? "disabled";

  if (loopMode !== "enabled" && loopMode !== "disabled") {
    throw new Error(
      'INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER must be "enabled" or "disabled"',
    );
  }

  const tenant = emptyToUndefined(
    env.INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_TENANT_ID,
  );
  const workspace = emptyToUndefined(
    env.INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_WORKSPACE_ID,
  );

  if ((tenant === undefined) !== (workspace === undefined)) {
    throw new Error(
      "INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_TENANT_ID and INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_WORKSPACE_ID must be set together",
    );
  }

  return {
    enabled: loopMode === "enabled",
    intervalMs: parseBoundedInteger(
      env.INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    ),
    limit: parseBoundedInteger(
      env.INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_LIMIT,
      20,
      1,
      100,
    ),
    runOnStart: parseBoolean(
      env.INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_RUN_ON_START,
      true,
    ),
    readyAtUtc: parseUtcTimeOfDay(
      env.INTELLIGENCE_PERIODIC_READER_SUMMARY_READY_AT_UTC,
      "06:00",
      "INTELLIGENCE_PERIODIC_READER_SUMMARY_READY_AT_UTC",
    ),
    tenantId: tenant,
    workspaceId: workspace,
  };
};

const emptyToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
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

const parseUtcTimeOfDay = (
  value: string | undefined,
  fallback: string,
  settingName: string,
): { readonly hour: number; readonly minute: number } => {
  const raw = value ?? fallback;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);

  if (match === null) {
    throw new Error(`${settingName} must use HH:mm UTC format`);
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
};
