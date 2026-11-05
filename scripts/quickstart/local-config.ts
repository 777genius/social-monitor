import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { productionAgentRuntimeModel } from '../../apps/agent-runtime/src/subscription-runtime-purpose-model-policy';
import { resolveReaderValueScoringProvider } from '../../libs/relevance/interfaces/rest/reader-value-scoring-provider-tokens';
import type { ReaderValueScoringProvider } from '../../libs/relevance/infrastructure/reader-value/reader-value-provider-config';

export type AiConnection = {
  readonly mode: 'codex' | 'external';
  readonly model: string;
  readonly address: string;
  readonly serviceToken: string;
  readonly scoringApiKey: string;
  readonly scoringProvider?: ReaderValueScoringProvider;
};

export type PublicDefaults = {
  readonly SOCIAL_MONITOR_TENANT_ID: string;
  readonly SOCIAL_MONITOR_WORKSPACE_ID: string;
  readonly SOCIAL_MONITOR_USER_ID: string;
  readonly SOCIAL_MONITOR_TENANT_NAME: string;
  readonly SOCIAL_MONITOR_WORKSPACE_NAME: string;
  readonly SOCIAL_MONITOR_USER_LABEL: string;
};

export type LocalSettings = {
  readonly schemaVersion: 1;
  readonly connection: AiConnection;
  readonly databasePassword: string;
  readonly applicationPassword: string;
  readonly systemPassword: string;
  readonly migratorPassword: string;
  readonly brokerPassword: string;
  readonly encryptionKey: string;
  readonly runtimeEncryptionKey: string;
  readonly localRuntimeToken: string;
  readonly ownerToken: string;
  readonly ownerExpiresAt: number;
  readonly publicJwks: string;
};

export const localIssuer = 'http://social-monitor.local';
export const localAudience = 'social-monitor-selfhost';

export async function readPublicDefaults(repositoryRoot = process.cwd()): Promise<PublicDefaults> {
  const value: unknown = JSON.parse(await readFile(
    join(repositoryRoot, 'ops/quickstart/frontend-defines.json'), 'utf8',
  ));
  if (value === null || typeof value !== 'object') throw new Error('public_defaults_invalid');
  const record = value as Record<string, unknown>;
  for (const key of ['SOCIAL_MONITOR_TENANT_ID', 'SOCIAL_MONITOR_WORKSPACE_ID', 'SOCIAL_MONITOR_USER_ID']) {
    if (typeof record[key] !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(record[key])) {
      throw new Error('public_defaults_invalid');
    }
  }
  for (const key of ['SOCIAL_MONITOR_TENANT_NAME', 'SOCIAL_MONITOR_WORKSPACE_NAME', 'SOCIAL_MONITOR_USER_LABEL']) {
    if (typeof record[key] !== 'string' || record[key].length === 0) throw new Error('public_defaults_invalid');
  }
  return record as unknown as PublicDefaults;
}

export function validateConnection(connection: AiConnection): void {
  resolveReaderValueScoringProvider({ READER_VALUE_SCORING_PROVIDER: connection.scoringProvider });
  if (connection.mode !== 'codex' && connection.mode !== 'external') throw new Error('ai_mode_invalid');
  if (typeof connection.scoringApiKey !== 'string'
    || connection.scoringApiKey.length > 1024) throw new Error('scoring_key_invalid');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(connection.model)) throw new Error('ai_model_invalid');
  if (connection.mode === 'codex' && connection.model !== productionAgentRuntimeModel) {
    throw new Error('ai_model_not_supported_by_runtime_policy');
  }
  if (connection.mode === 'external') {
    const match = /^([A-Za-z0-9.-]+|\[[0-9a-f:]+\]):([0-9]{1,5})$/iu.exec(connection.address);
    if (match === null || Number(match[2]) < 1 || Number(match[2]) > 65535) throw new Error('ai_address_invalid');
    if (connection.serviceToken.length === 0) throw new Error('ai_service_token_required');
  }
  if ([connection.model, connection.address, connection.serviceToken, connection.scoringApiKey].some((value) => /[\r\n\0]/u.test(value))) {
    throw new Error('environment_value_invalid');
  }
}

function ownerSession(defaults: PublicDefaults, now: Date) {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = randomUUID();
  const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' };
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + 365 * 86_400;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode({
    iss: localIssuer, aud: localAudience, sub: defaults.SOCIAL_MONITOR_USER_ID,
    tenant_id: defaults.SOCIAL_MONITOR_TENANT_ID,
    workspace_id: defaults.SOCIAL_MONITOR_WORKSPACE_ID,
    workspace_roles: ['owner'], iat: issuedAt, exp: expiresAt,
  })}`;
  return {
    ownerToken: `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), pair.privateKey).toString('base64url')}`,
    ownerExpiresAt: expiresAt,
    publicJwks: JSON.stringify({ keys: [jwk] }),
  };
}

export function createLocalSettings(
  connection: AiConnection,
  defaults: PublicDefaults,
  now: Date,
): LocalSettings {
  validateConnection(connection);
  return {
    schemaVersion: 1, connection,
    databasePassword: randomBytes(24).toString('hex'),
    applicationPassword: randomBytes(24).toString('hex'),
    systemPassword: randomBytes(24).toString('hex'),
    migratorPassword: randomBytes(24).toString('hex'),
    brokerPassword: randomBytes(24).toString('hex'),
    encryptionKey: randomBytes(32).toString('base64url'),
    runtimeEncryptionKey: randomBytes(32).toString('hex'),
    localRuntimeToken: randomBytes(32).toString('hex'),
    ...ownerSession(defaults, now),
  };
}

export function rawEnvironment(values: Readonly<Record<string, string>>): string {
  return Object.entries(values).map(([key, value]) => {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key)) {
      throw new Error('environment_key_invalid');
    }
    if (typeof value !== 'string' || /[\r\n\0]/u.test(value)) throw new Error('environment_value_invalid');
    return `${key}=${value}\n`;
  }).join('');
}

function credentialUrl(base: string, username: string, password: string): string {
  const url = new URL(base);
  url.username = username;
  url.password = password;
  return url.toString();
}

export function backendEnvironment(settings: LocalSettings): Record<string, string> {
  const local = settings.connection.mode === 'codex';
  return {
    NODE_ENV: 'development', SOCIAL_MONITOR_RUNTIME_PROFILE: 'local-dev',
    PORT: '3000', DATABASE_URL: credentialUrl('postgresql://postgres:5432/social_monitor', 'social_monitor_app', settings.applicationPassword),
    REDIS_URL: 'redis://redis:6379/0', KAFKA_BROKERS: 'kafka:9092',
    RABBITMQ_URL: credentialUrl('amqp://rabbitmq:5672', 'social_monitor', settings.brokerPassword),
    RABBITMQ_QUEUE_TYPE: 'quorum', RABBITMQ_QUEUE_DELIVERY_LIMIT: '20',
    RABBITMQ_DEAD_LETTER_EXCHANGE: 'social-monitor.commands.dlx',
    SOCIAL_MONITOR_METRICS_MODE: 'in-memory',
    TRUSTED_WORKSPACE_ROLE_HEADER: 'disabled', SOCIAL_MONITOR_USER_AUTH_MODE: 'oidc-jwt',
    SOCIAL_MONITOR_OIDC_ISSUER: localIssuer, SOCIAL_MONITOR_OIDC_AUDIENCE: localAudience,
    SOCIAL_MONITOR_OIDC_JWKS_JSON: settings.publicJwks,
    SOCIAL_MONITOR_OIDC_TENANT_ID_CLAIM: 'tenant_id',
    SOCIAL_MONITOR_OIDC_WORKSPACE_ID_CLAIM: 'workspace_id',
    SOCIAL_MONITOR_OIDC_WORKSPACE_ROLES_CLAIM: 'workspace_roles',
    MONITORING_PERSISTENCE: 'prisma', MONITORING_SCAN_QUEUE: 'rabbitmq',
    FEED_PERSISTENCE: 'prisma', RELEVANCE_PERSISTENCE: 'prisma',
    SUMMARY_PERSISTENCE: 'prisma', SUMMARY_JOB_QUEUE_MODE: 'rabbitmq',
    IDENTITY_PERSISTENCE: 'prisma', USAGE_PERSISTENCE: 'prisma',
    INGESTION_SUPPORT_PERSISTENCE: 'prisma', INGESTION_WORKER_PERSISTENCE: 'prisma',
    INGESTION_SCAN_QUEUE_READER: 'rabbitmq', INGESTION_SCAN_REPORTER: 'monitoring',
    INGESTION_SCAN_QUEUE_DRAIN_LOOP: 'enabled', INGESTION_SCAN_SCHEDULER_LOOP: 'enabled',
    INGESTION_SCAN_SCHEDULER_INTERVAL_MS: '10000',
    INTELLIGENCE_SUMMARY_QUEUE_READER: 'rabbitmq', INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP: 'enabled',
    INTELLIGENCE_READER_SUMMARY_JOB_LOOP: 'enabled',
    INTELLIGENCE_READER_SUMMARY_JOB_LOOP_INTERVAL_MS: '10000',
    INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER: 'enabled',
    READER_VALUE_MODE: 'jev_primary_v3', READER_VALUE_SCORING_LOOP: 'enabled',
    READER_VALUE_SCORING_PROVIDER: resolveReaderValueScoringProvider({ READER_VALUE_SCORING_PROVIDER: settings.connection.scoringProvider }),
    READER_VALUE_RETENTION_HOLD_WORKSPACE_IDS: '[]',
    SUMMARY_MODEL_PROVIDER: 'agent-runtime', READER_SUMMARY_MODEL_PROVIDER: 'agent-runtime',
    READER_SUMMARY_TOPIC_LABELER: 'agent-runtime', SUMMARY_MEMORY_MODE: 'disabled',
    DELIVERY_PERSISTENCE: 'prisma', SUBSCRIPTIONS_PERSISTENCE: 'prisma',
    DELIVERY_ENABLED_CHANNELS: 'webhook', DELIVERY_WEBHOOK_PROVIDER: 'http',
    DELIVERY_ATTEMPT_DISPATCH_TARGET: 'queue', DELIVERY_ATTEMPT_DISPATCH_QUEUE: 'rabbitmq',
    DELIVERY_ATTEMPT_QUEUE_READER: 'rabbitmq', DELIVERY_SUMMARY_READY_EVENT_READER: 'rabbitmq',
    EVENT_RELAY_LOOP: 'enabled',
    SOURCE_CONFIG_ENCRYPTION_KEY: settings.encryptionKey, SOURCE_CONFIG_ENCRYPTION_KEY_ID: 'selfhost-v1',
    SOURCE_CREDENTIAL_SECRET_ENCRYPTION_KEY: settings.encryptionKey,
    DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY: settings.encryptionKey,
    AGENT_RUNTIME_GRPC_ADDRESS: local ? 'agent-runtime:50052' : settings.connection.address,
    AGENT_RUNTIME_SERVICE_TOKEN: local ? settings.localRuntimeToken : settings.connection.serviceToken,
    AGENT_RUNTIME_PROVIDER: 'codex', AGENT_RUNTIME_GRPC_BIND: '0.0.0.0:50052',
    AGENT_RUNTIME_CLI_PATH: 'apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs',
    AGENT_RUNTIME_STATE_ROOT: '/var/lib/subscription-runtime',
    AGENT_RUNTIME_CODEX_AUTH_JSON_PATH: '/run/secrets/codex-auth.json',
    ...(local ? {
      AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT: '/run/selfhost-auth',
      AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST: 'pool.json',
      AGENT_RUNTIME_CODEX_AUTH_JSON_PATH: '/run/selfhost-auth/account/auth.json',
    } : {}),
    SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY: settings.runtimeEncryptionKey,
    AGENT_RUNTIME_MODEL: settings.connection.model,
    AGENT_RUNTIME_READER_SUMMARY_MODEL: settings.connection.model,
    AGENT_RUNTIME_REASONING_EFFORT: 'high', AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT: 'high',
    AGENT_RUNTIME_TIMEOUT_MS: '600000', AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS: '600000',
    AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_TIMEOUT_MS: '600000',
  };
}

async function assertPrivateDirectory(directory: string): Promise<void> {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
    || (process.getuid !== undefined && info.uid !== process.getuid())) {
    throw new Error('state_directory_must_be_private_and_owned');
  }
}

export async function atomicPrivateFile(path: string, content: string, replace: boolean): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(content); await file.sync(); }
  finally { await file.close(); }
  try {
    if (replace) {
      try { if ((await lstat(path)).isSymbolicLink()) throw new Error('config_symlink_refused'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await rename(temporary, path);
    } else {
      await link(temporary, path);
    }
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function materializeLocalConfiguration(input: {
  readonly directory: string;
  readonly defaults: PublicDefaults;
  readonly connection?: AiConnection;
  readonly now: Date;
}): Promise<LocalSettings> {
  const directory = resolve(input.directory);
  await assertPrivateDirectory(directory);
  const settingsPath = join(directory, 'settings.json');
  let settings: LocalSettings;
  let replace = false;
  try {
    const file = await open(settingsPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 65_536) throw new Error('settings_must_be_private');
      settings = JSON.parse(await file.readFile('utf8')) as LocalSettings;
    } finally { await file.close(); }
    if (settings.schemaVersion !== 1 || !Number.isSafeInteger(settings.ownerExpiresAt)
      || !/^[0-9a-f]{48}$/u.test(settings.databasePassword ?? '')
      || !/^[0-9a-f]{48}$/u.test(settings.applicationPassword ?? '')
      || !/^[0-9a-f]{48}$/u.test(settings.systemPassword ?? '')
      || !/^[0-9a-f]{48}$/u.test(settings.migratorPassword ?? '')
      || !/^[0-9a-f]{48}$/u.test(settings.brokerPassword ?? '')
      || !/^[A-Za-z0-9_-]{43}$/u.test(settings.encryptionKey ?? '')
      || !/^[0-9a-f]{64}$/u.test(settings.runtimeEncryptionKey ?? '')
      || !/^[0-9a-f]{64}$/u.test(settings.localRuntimeToken ?? '')
      || typeof settings.ownerToken !== 'string' || typeof settings.publicJwks !== 'string') {
      throw new Error('settings_invalid');
    }
    validateConnection(settings.connection);
    replace = true;
    if (input.connection !== undefined) {
      validateConnection(input.connection);
      settings = { ...settings, connection: input.connection };
    }
    if (settings.ownerExpiresAt < Math.floor(input.now.getTime() / 1000) + 86_400) {
      settings = { ...settings, ...ownerSession(input.defaults, input.now) };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (input.connection === undefined) throw new Error('ai_connection_required');
    settings = createLocalSettings(input.connection, input.defaults, input.now);
  }
  await atomicPrivateFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, replace);
  await atomicPrivateFile(join(directory, 'backend.env'), rawEnvironment(backendEnvironment(settings)), true);
  await atomicPrivateFile(join(directory, 'scoring.env'), rawEnvironment({
    [settings.connection.scoringProvider === 'openai-decisions' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY']: settings.connection.scoringApiKey,
  }), true);
  await atomicPrivateFile(join(directory, 'system.env'), rawEnvironment({
    DATABASE_URL: credentialUrl('postgresql://postgres:5432/social_monitor', 'social_monitor_system_app', settings.systemPassword),
  }), true);
  await atomicPrivateFile(join(directory, 'migration.env'), rawEnvironment({
    DATABASE_URL: credentialUrl('postgresql://postgres:5432/social_monitor', 'social_monitor', settings.databasePassword),
    SELFHOST_APPLICATION_PASSWORD: settings.applicationPassword,
    SELFHOST_SYSTEM_PASSWORD: settings.systemPassword,
    SELFHOST_MIGRATOR_PASSWORD: settings.migratorPassword,
  }), true);
  await atomicPrivateFile(join(directory, 'owner.env'), rawEnvironment({ SELFHOST_BEARER_TOKEN: settings.ownerToken }), true);
  await atomicPrivateFile(join(directory, 'compose.env'), rawEnvironment({
    SELFHOST_DATABASE_PASSWORD: settings.databasePassword,
    SELFHOST_BROKER_PASSWORD: settings.brokerPassword,
    SELFHOST_AI_MODE: settings.connection.mode,
    SELFHOST_AI_ENABLED: settings.connection.scoringApiKey.trim().length > 0 ? 'true' : 'false',
  }), true);
  for (const name of ['agent-runtime', 'codex-auth', 'codex-pool', 'codex-pool/account']) {
    const path = join(directory, name);
    await mkdir(path, { mode: 0o700, recursive: true });
    await assertPrivateDirectory(path);
  }
  await atomicPrivateFile(join(directory, 'codex-pool/pool.json'), JSON.stringify({
    schemaVersion: 1, snapshotId: 'selfhost-local-owner-v1',
    accounts: [{ id: 'local-owner', relativePath: 'account/auth.json' }],
  }), true);
  // A Docker mount target only. Actual credentials are mounted read-only from
  // the user's auth file; setup never reads or copies them.
  const target = await open(join(directory, 'codex-pool/account/auth.json'),
    constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  await target.close();
  return settings;
}
