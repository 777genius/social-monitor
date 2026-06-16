export type IntelligenceSummaryJobLoopOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
  readonly tenantId?: string;
  readonly workspaceId?: string;
};

export const INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS = Symbol('INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS');

export const resolveIntelligenceSummaryJobLoopOptions = (
  env: NodeJS.ProcessEnv,
): IntelligenceSummaryJobLoopOptions => {
  const loopMode = env.INTELLIGENCE_SUMMARY_JOB_LOOP ?? (env.NODE_ENV === 'test' ? 'disabled' : 'enabled');

  if (loopMode !== 'enabled' && loopMode !== 'disabled') {
    throw new Error('INTELLIGENCE_SUMMARY_JOB_LOOP must be "enabled" or "disabled"');
  }

  const tenant = emptyToUndefined(env.INTELLIGENCE_SUMMARY_JOB_LOOP_TENANT_ID);
  const workspace = emptyToUndefined(env.INTELLIGENCE_SUMMARY_JOB_LOOP_WORKSPACE_ID);

  if ((tenant === undefined) !== (workspace === undefined)) {
    throw new Error(
      'INTELLIGENCE_SUMMARY_JOB_LOOP_TENANT_ID and INTELLIGENCE_SUMMARY_JOB_LOOP_WORKSPACE_ID must be set together',
    );
  }

  return {
    enabled: loopMode === 'enabled',
    intervalMs: parseBoundedInteger(env.INTELLIGENCE_SUMMARY_JOB_LOOP_INTERVAL_MS, 60_000, 1_000, 3_600_000),
    limit: parseBoundedInteger(env.INTELLIGENCE_SUMMARY_JOB_LOOP_LIMIT, 20, 1, 100),
    runOnStart: parseBoolean(env.INTELLIGENCE_SUMMARY_JOB_LOOP_RUN_ON_START, true),
    tenantId: tenant,
    workspaceId: workspace,
  };
};

const emptyToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
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
    throw new Error(`Expected integer environment value between ${min} and ${max}`);
  }

  return parsed;
};
