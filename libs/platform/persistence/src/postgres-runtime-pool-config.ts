import {
  POSTGRES_RUNTIME_POOL_LIMITS,
  type PostgresRuntimeProcessId,
} from './postgres-runtime-pool-budget';

export const POSTGRES_RUNTIME_PROCESS_ENV = 'POSTGRES_RUNTIME_PROCESS';
export const POSTGRES_RUNTIME_POOL_MIN_ENV = 'POSTGRES_RUNTIME_POOL_MIN';
export const POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS = 5_000;
export const POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS = 10_000;
export const POSTGRES_RUNTIME_APPLICATION_NAME_PREFIX =
  'social-monitor/runtime/';

const MIN_CONNECTION_TIMEOUT_MS = 100;
const MAX_CONNECTION_TIMEOUT_MS = 30_000;
const MIN_IDLE_TIMEOUT_MS = 1_000;
const MAX_IDLE_TIMEOUT_MS = 60_000;
const RESERVED_DATABASE_URL_PARAMETERS = new Set([
  'application_name',
  'fallback_application_name',
  'options',
]);

export type PostgresRuntimePoolConfig = {
  readonly processId: PostgresRuntimeProcessId;
  readonly connectionString: string;
  readonly min: 0;
  readonly max: 1 | 2;
  readonly connectionTimeoutMillis: number;
  readonly idleTimeoutMillis: number;
};

export function bindPostgresRuntimeProcessIdentity(
  env: NodeJS.ProcessEnv,
  expectedProcessId: PostgresRuntimeProcessId,
): void {
  const configuredProcessId = env[POSTGRES_RUNTIME_PROCESS_ENV];
  if (configuredProcessId === undefined) {
    throw new Error(
      `${POSTGRES_RUNTIME_PROCESS_ENV} must be explicitly configured as ${expectedProcessId} for this entrypoint`,
    );
  }
  if (configuredProcessId !== expectedProcessId) {
    throw new Error(
      `${POSTGRES_RUNTIME_PROCESS_ENV} must be ${expectedProcessId} for this entrypoint`,
    );
  }
}

export function resolvePostgresRuntimePoolConfig(
  env: NodeJS.ProcessEnv,
): PostgresRuntimePoolConfig {
  const processId = readProcessId(env[POSTGRES_RUNTIME_PROCESS_ENV]);
  const processMaximum = POSTGRES_RUNTIME_POOL_LIMITS[processId];
  return validatePostgresRuntimePoolConfig({
    processId,
    connectionString: env.DATABASE_URL ?? '',
    min: readExactZero(env, POSTGRES_RUNTIME_POOL_MIN_ENV),
    max: readExactInteger(env, 'POSTGRES_RUNTIME_POOL_MAX', processMaximum),
    connectionTimeoutMillis: readBoundedInteger(
      env,
      'POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS',
      POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS,
      MIN_CONNECTION_TIMEOUT_MS,
      MAX_CONNECTION_TIMEOUT_MS,
    ),
    idleTimeoutMillis: readBoundedInteger(
      env,
      'POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS',
      POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS,
      MIN_IDLE_TIMEOUT_MS,
      MAX_IDLE_TIMEOUT_MS,
    ),
  });
}

export function defaultPostgresRuntimePoolConfig(
  connectionString: string,
  processId: PostgresRuntimeProcessId,
): PostgresRuntimePoolConfig {
  return validatePostgresRuntimePoolConfig({
    processId,
    connectionString,
    min: 0,
    max: POSTGRES_RUNTIME_POOL_LIMITS[processId],
    connectionTimeoutMillis:
      POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS,
  });
}

export function validatePostgresRuntimePoolConfig(
  config: PostgresRuntimePoolConfig,
): PostgresRuntimePoolConfig {
  assertPostgresUrl(config.connectionString);
  const processMaximum = POSTGRES_RUNTIME_POOL_LIMITS[config.processId];
  if (processMaximum === undefined) {
    throw new Error('POSTGRES_RUNTIME_PROCESS is not a recognized process');
  }
  assertExactInteger(POSTGRES_RUNTIME_POOL_MIN_ENV, config.min, 0);
  assertExactInteger('POSTGRES_RUNTIME_POOL_MAX', config.max, processMaximum);
  assertBoundedInteger(
    'POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS',
    config.connectionTimeoutMillis,
    MIN_CONNECTION_TIMEOUT_MS,
    MAX_CONNECTION_TIMEOUT_MS,
  );
  assertBoundedInteger(
    'POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS',
    config.idleTimeoutMillis,
    MIN_IDLE_TIMEOUT_MS,
    MAX_IDLE_TIMEOUT_MS,
  );

  return Object.freeze({ ...config });
}

export function toPostgresPoolConfig(
  config: PostgresRuntimePoolConfig,
): {
  readonly application_name: string;
  readonly connectionString: string;
  readonly min: 0;
  readonly max: 1 | 2;
  readonly connectionTimeoutMillis: number;
  readonly idleTimeoutMillis: number;
} {
  return {
    application_name: `${POSTGRES_RUNTIME_APPLICATION_NAME_PREFIX}${config.processId}`,
    connectionString: config.connectionString,
    min: config.min,
    max: config.max,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
  };
}

export function samePostgresRuntimePoolConfig(
  left: PostgresRuntimePoolConfig,
  right: PostgresRuntimePoolConfig,
): boolean {
  return (
    left.processId === right.processId &&
    left.connectionString === right.connectionString &&
    left.min === right.min &&
    left.max === right.max &&
    left.connectionTimeoutMillis === right.connectionTimeoutMillis &&
    left.idleTimeoutMillis === right.idleTimeoutMillis
  );
}

function assertPostgresUrl(connectionString: string): void {
  if (
    connectionString.length === 0 ||
    connectionString !== connectionString.trim()
  ) {
    throw new Error(
      'DATABASE_URL is required and must not have surrounding whitespace',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the postgres or postgresql scheme');
  }
  if (parsed.hostname.length === 0 || parsed.pathname === '/') {
    throw new Error('DATABASE_URL must include a host and database name');
  }
  if (parsed.hash.length > 0) {
    throw new Error('DATABASE_URL must not contain a fragment');
  }
  const reservedParameter = [...parsed.searchParams.keys()].find((name) =>
    RESERVED_DATABASE_URL_PARAMETERS.has(name.toLowerCase()),
  );
  if (reservedParameter !== undefined) {
    throw new Error(
      `DATABASE_URL must not set reserved PostgreSQL runtime parameter ${reservedParameter.toLowerCase()}`,
    );
  }
}

function readProcessId(value: string | undefined): PostgresRuntimeProcessId {
  if (
    value === undefined ||
    !Object.prototype.hasOwnProperty.call(POSTGRES_RUNTIME_POOL_LIMITS, value)
  ) {
    throw new Error(
      `${POSTGRES_RUNTIME_PROCESS_ENV} must identify a budgeted PostgreSQL process`,
    );
  }
  return value as PostgresRuntimeProcessId;
}

function readExactInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  expected: 1 | 2,
): 1 | 2 {
  const raw = env[name];
  if (raw === undefined) {
    throw new Error(`${name} must be explicitly configured`);
  }
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) {
    throw new Error(`${name} must be a base-10 integer`);
  }

  const parsed = Number(raw);
  assertExactInteger(name, parsed, expected);
  return expected;
}

function readExactZero(env: NodeJS.ProcessEnv, name: string): 0 {
  const raw = env[name];
  if (raw === undefined) {
    throw new Error(`${name} must be explicitly configured`);
  }
  if (raw !== '0') {
    throw new Error(`${name} must be exactly 0`);
  }
  return 0;
}

function readBoundedInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name];
  if (raw === undefined) {
    return fallback;
  }
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) {
    throw new Error(`${name} must be a base-10 integer`);
  }

  const parsed = Number(raw);
  assertBoundedInteger(name, parsed, minimum, maximum);
  return parsed;
}

function assertExactInteger(
  name: string,
  value: number,
  expected: number,
): void {
  if (!Number.isSafeInteger(value) || value !== expected) {
    throw new Error(`${name} must be exactly ${expected} for this process`);
  }
}

function assertBoundedInteger(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
}
