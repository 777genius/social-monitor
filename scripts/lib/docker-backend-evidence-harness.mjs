import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomInt } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const DEFAULT_DOCKER_PREFLIGHT_TIMEOUT_MS = 5_000;
const DEFAULT_DOCKER_SOCKET_PING_TIMEOUT_MS = 3_000;
const MAX_DOCKER_SOCKET_PING_TIMEOUT_MS = 30_000;
const DEFAULT_DOCKER_VOLUME_PROBE_TIMEOUT_MS = 20_000;
const DEFAULT_MIN_FREE_BYTES = 8 * 1024 ** 3;
const DEFAULT_DOCKER_VOLUME_PROBE_BYTES = 256 * 1024 ** 2;
const DOCKER_VOLUME_PROBE_IMAGE = 'postgres:18.4-alpine';
const DOCKER_EVIDENCE_STORAGE_MODE_ENV = 'DOCKER_BACKEND_EVIDENCE_STORAGE_MODE';
const DOCKER_EVIDENCE_STORAGE_DOCKER_VOLUME_MODE = 'docker-volume';
const DOCKER_EVIDENCE_STORAGE_HOST_BIND_MODE = 'host-bind';
const DOCKER_EVIDENCE_HOST_STORAGE_DIR_ENV = 'DOCKER_BACKEND_EVIDENCE_HOST_STORAGE_DIR';

export async function withDockerBackendEvidenceStack(options, callback) {
  const preflightCwd = options.preflightCwd ?? process.cwd();
  const storageMode = dockerEvidenceStorageMode();
  assertDockerEvidencePrerequisites({ cwd: preflightCwd, storageMode });

  const runId = Date.now().toString(36);
  const projectName = process.env[options.projectEnvName] ?? `${options.projectPrefix}-${runId}`;
  const tempDir = mkdtempSync(join(tmpdir(), `${options.projectPrefix}-`));
  const overridePath = join(tempDir, 'compose.override.yml');
  const hostStorageRoot = storageMode === DOCKER_EVIDENCE_STORAGE_HOST_BIND_MODE
    ? prepareHostBindStorageRoot({ tempDir, projectName })
    : undefined;
  const apiPort = process.env.API_PORT ?? String(randomPort());
  const postgresPort = process.env.POSTGRES_PORT ?? String(randomPort());
  const rabbitMqPort = process.env.RABBITMQ_PORT ?? String(randomPort());
  const rabbitMqManagementPort = process.env.RABBITMQ_MANAGEMENT_PORT ?? String(randomPort());
  const redisPort = process.env.REDIS_PORT ?? String(randomPort());
  const environmentId = process.env.STAGING_ENVIRONMENT_ID ?? 'docker-alpha-1';
  const operator = process.env.STAGING_OPERATOR ?? 'backend-ops-1';
  const issuer = process.env.SOCIAL_MONITOR_OIDC_ISSUER ?? 'https://auth.docker-alpha.internal/realms/main';
  const audience = process.env.SOCIAL_MONITOR_OIDC_AUDIENCE ?? 'social-monitor-api';
  const keyId = `docker-alpha-${runId}`;
  const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = keyPair.privateKey.export({ format: 'pem', type: 'pkcs8' });
  const publicJwk = {
    ...keyPair.publicKey.export({ format: 'jwk' }),
    kid: keyId,
    alg: 'RS256',
    use: 'sig',
  };
  const jwksJson = JSON.stringify({ keys: [publicJwk] });
  const sourceConfigEncryptionKey =
    process.env.SOURCE_CONFIG_ENCRYPTION_KEY ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const webhookSecretEncryptionKey =
    process.env.DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  writeFileSync(overridePath, buildComposeOverride({
    issuer,
    audience,
    jwksJson,
    sourceConfigEncryptionKey,
    webhookSecretEncryptionKey,
    hostStorageRoot,
  }), 'utf8');

  const composeFile = ['docker-compose.yml', overridePath].join(delimiter);
  const composeEnv = {
    ...process.env,
    API_PORT: apiPort,
    POSTGRES_PORT: postgresPort,
    RABBITMQ_PORT: rabbitMqPort,
    RABBITMQ_MANAGEMENT_PORT: rabbitMqManagementPort,
    REDIS_PORT: redisPort,
    SOURCE_CONFIG_ENCRYPTION_KEY: sourceConfigEncryptionKey,
    DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY: webhookSecretEncryptionKey,
    COMPOSE_PROJECT_NAME: projectName,
    COMPOSE_FILE: composeFile,
  };
  const composeBaseArgs = ['compose', '-p', projectName, '-f', 'docker-compose.yml', '-f', overridePath, '--profile', 'app'];

  const docker = (args, commandOptions = {}) => execFileSync('docker', args, {
    ...commandOptions,
    env: commandOptions.env ?? composeEnv,
  });

  try {
    try {
      docker([...composeBaseArgs, 'build', ...dockerComposeBuildCacheArgs()], { stdio: 'inherit' });
    } catch (error) {
      throw new Error(dockerComposeBuildFailureMessage(error, storageMode));
    }
    assertDockerStorageAvailable({
      cwd: preflightCwd,
      phase: 'after Docker image build',
      storageMode,
      hostStorageRoot,
    });
    docker([...composeBaseArgs, 'up', '--no-build', '-d'], { stdio: 'inherit' });
    const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
    waitForReady(apiBaseUrl);
    const imageDigest = inspectApiImageDigest({ docker, composeBaseArgs, composeEnv });
    const runnerEnv = {
      ...process.env,
      API_BASE_URL: apiBaseUrl,
      DATABASE_URL: `postgresql://social_monitor:social_monitor_local_password@127.0.0.1:${postgresPort}/social_monitor`,
      RABBITMQ_URL: `amqp://social_monitor:social_monitor_local_password@127.0.0.1:${rabbitMqPort}`,
      RABBITMQ_MANAGEMENT_URL: `http://127.0.0.1:${rabbitMqManagementPort}`,
      STAGING_ENVIRONMENT_ID: environmentId,
      STAGING_OPERATOR: operator,
      BACKEND_IMAGE_DIGEST: imageDigest,
      DURABLE_BACKEND_E2E_PRIVATE_KEY_PEM: String(privateKeyPem),
      DURABLE_BACKEND_E2E_JWT_KID: keyId,
      SOCIAL_MONITOR_OIDC_ISSUER: issuer,
      SOCIAL_MONITOR_OIDC_AUDIENCE: audience,
      DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY: webhookSecretEncryptionKey,
      SOURCE_CONFIG_ENCRYPTION_KEY: sourceConfigEncryptionKey,
      COMPOSE_PROJECT_NAME: projectName,
      COMPOSE_FILE: composeFile,
      API_PORT: apiPort,
      POSTGRES_PORT: postgresPort,
      RABBITMQ_PORT: rabbitMqPort,
      RABBITMQ_MANAGEMENT_PORT: rabbitMqManagementPort,
      REDIS_PORT: redisPort,
      DOCKER_BACKEND_EVIDENCE_STORAGE_MODE: storageMode,
    };

    await callback({
      projectName,
      apiBaseUrl,
      imageDigest,
      environmentId,
      operator,
      runnerEnv,
      composeEnv,
      composeBaseArgs,
      docker,
      waitForReady,
    });
  } finally {
    if (shouldKeepStack(options.keepEnvNames ?? [])) {
      console.log(`Keeping Docker Compose project ${projectName}`);
    } else {
      try {
        docker([...composeBaseArgs, 'down', '-v', '--remove-orphans'], { stdio: 'inherit' });
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function runNpmScript(scriptName, env) {
  execFileSync('npm', ['run', scriptName], {
    env,
    stdio: 'inherit',
  });
}

export function runNodeScript(scriptPath, env) {
  execFileSync(process.execPath, [scriptPath], {
    env,
    stdio: 'inherit',
  });
}

export function restartBackendServices(context, services = ['api', 'event-relay', 'ingestion-worker', 'intelligence-worker', 'delivery-service']) {
  context.docker([...context.composeBaseArgs, 'restart', ...services], { stdio: 'inherit' });
  context.waitForReady(context.apiBaseUrl);
}

export function assertDockerEvidencePrerequisites(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const storageMode = options.storageMode ?? dockerEvidenceStorageMode();
  const dockerTimeoutMs =
    options.dockerTimeoutMs ?? positiveIntegerEnv('DOCKER_BACKEND_EVIDENCE_DOCKER_TIMEOUT_MS', DEFAULT_DOCKER_PREFLIGHT_TIMEOUT_MS);
  const socketPingTimeoutMs =
    options.socketPingTimeoutMs ?? boundedPositiveIntegerEnv(
      'DOCKER_BACKEND_EVIDENCE_SOCKET_PING_TIMEOUT_MS',
      DEFAULT_DOCKER_SOCKET_PING_TIMEOUT_MS,
      MAX_DOCKER_SOCKET_PING_TIMEOUT_MS,
    );
  const minFreeBytes =
    options.minFreeBytes ?? positiveIntegerEnv('DOCKER_BACKEND_EVIDENCE_MIN_FREE_BYTES', DEFAULT_MIN_FREE_BYTES);
  const volumeProbeBytes =
    options.volumeProbeBytes ?? positiveIntegerEnv('DOCKER_BACKEND_EVIDENCE_VOLUME_PROBE_BYTES', DEFAULT_DOCKER_VOLUME_PROBE_BYTES);
  const volumeProbeTimeoutMs =
    options.volumeProbeTimeoutMs ?? positiveIntegerEnv(
      'DOCKER_BACKEND_EVIDENCE_VOLUME_PROBE_TIMEOUT_MS',
      DEFAULT_DOCKER_VOLUME_PROBE_TIMEOUT_MS,
    );
  const failures = [];
  const freeBytes = availableDiskBytes(cwd);

  if (freeBytes < minFreeBytes) {
    failures.push(
      `only ${formatBytes(freeBytes)} free at ${cwd}; need at least ${formatBytes(minFreeBytes)} for Docker backend evidence`,
    );
  }

  const socketProbe = probeDockerApiSocket({
    cwd,
    timeoutMs: socketPingTimeoutMs,
  });
  if (socketProbe !== undefined && !socketProbe.ok) {
    failures.push(`Docker API socket check failed: ${socketProbe.message}`);
  }

  if (failures.length === 0) {
    const dockerVersion = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
      cwd,
      encoding: 'utf8',
      timeout: dockerTimeoutMs,
    });

    if (dockerVersion.error) {
      failures.push(dockerVersion.error.code === 'ETIMEDOUT'
        ? `Docker daemon did not respond within ${dockerTimeoutMs}ms`
        : `Docker daemon check failed: ${dockerVersion.error.message}`);
    } else if (dockerVersion.status !== 0) {
      const stderr = dockerVersion.stderr.trim();
      failures.push(stderr.length > 0
        ? `Docker daemon check failed: ${stderr}`
        : `Docker daemon check exited with status ${dockerVersion.status ?? 'unknown'}`);
    }
  }

  if (failures.length === 0) {
    const storageFailure = dockerStorageFailure({
      cwd,
      bytes: volumeProbeBytes,
      timeoutMs: volumeProbeTimeoutMs,
      phase: 'before Docker image build',
      storageMode,
    });
    if (storageFailure !== undefined) {
      failures.push(storageFailure);
    }
  }

  if (failures.length > 0) {
    throw new Error([
      'Docker backend evidence preflight failed:',
      ...failures.map((failure) => `- ${failure}`),
      'Restart Docker Desktop, free disk space, prune unused Docker data, or set DOCKER_BACKEND_EVIDENCE_SOCKET_PING_TIMEOUT_MS / DOCKER_BACKEND_EVIDENCE_MIN_FREE_BYTES / DOCKER_BACKEND_EVIDENCE_VOLUME_PROBE_BYTES for a controlled override.',
    ].join('\n'));
  }
}

function assertDockerStorageAvailable({ cwd, phase, storageMode, hostStorageRoot }) {
  const volumeProbeBytes = positiveIntegerEnv(
    'DOCKER_BACKEND_EVIDENCE_VOLUME_PROBE_BYTES',
    DEFAULT_DOCKER_VOLUME_PROBE_BYTES,
  );
  const volumeProbeTimeoutMs = positiveIntegerEnv(
    'DOCKER_BACKEND_EVIDENCE_VOLUME_PROBE_TIMEOUT_MS',
    DEFAULT_DOCKER_VOLUME_PROBE_TIMEOUT_MS,
  );
  const storageFailure = dockerStorageFailure({
    cwd,
    bytes: volumeProbeBytes,
    timeoutMs: volumeProbeTimeoutMs,
    phase,
    storageMode,
    hostStorageRoot,
  });
  if (storageFailure !== undefined) {
    throw new Error([
      'Docker backend evidence storage check failed:',
      `- ${storageFailure}`,
      storageMode === DOCKER_EVIDENCE_STORAGE_HOST_BIND_MODE
        ? 'Free host disk space or choose another DOCKER_BACKEND_EVIDENCE_HOST_STORAGE_DIR before capturing backend staging evidence.'
        : 'Free Docker Desktop storage or prune unused Docker data before capturing backend staging evidence.',
    ].join('\n'));
  }
}

function dockerStorageFailure({ cwd, bytes, timeoutMs, phase, storageMode, hostStorageRoot }) {
  if (storageMode === DOCKER_EVIDENCE_STORAGE_HOST_BIND_MODE) {
    const hostBindProbe = probeDockerHostBindPostgresInitdbWritable({
      cwd,
      timeoutMs,
      hostStorageRoot,
    });
    if (!hostBindProbe.ok) {
      return `Docker host-bind Postgres initdb probe failed ${phase}: ${hostBindProbe.message}`;
    }

    return undefined;
  }

  const volumeProbe = probeDockerVolumeWritable({
    cwd,
    bytes,
    timeoutMs,
  });
  if (volumeProbe.ok) {
    const postgresProbe = probeDockerPostgresInitdbWritable({
      cwd,
      timeoutMs,
    });
    if (!postgresProbe.ok) {
      return `Docker Postgres initdb probe failed ${phase}: ${postgresProbe.message}`;
    }

    return undefined;
  }

  return `Docker volume write probe failed ${phase}: ${volumeProbe.message}`;
}

function probeDockerHostBindPostgresInitdbWritable({ cwd, timeoutMs, hostStorageRoot }) {
  const probeRoot = hostStorageRoot === undefined
    ? mkdtempSync(join(tmpdir(), 'social-monitor-backend-evidence-host-bind-preflight-'))
    : join(hostStorageRoot, `.preflight-${process.pid}-${Date.now().toString(36)}`);
  const postgresRoot = join(probeRoot, 'postgres');
  const containerName = `social-monitor-backend-evidence-host-bind-preflight-${process.pid}-${Date.now().toString(36)}`;
  const script = [
    'set -eu',
    'mkdir -p "$PGDATA"',
    'chown -R postgres:postgres /var/lib/postgresql',
    'gosu postgres initdb -D "$PGDATA" --data-checksums',
  ].join('\n');

  mkdirSync(postgresRoot, { recursive: true });

  try {
    const probe = spawnSync('docker', [
      'run',
      '--rm',
      '--name',
      containerName,
      '-v',
      `${postgresRoot}:/var/lib/postgresql`,
      '--entrypoint',
      'sh',
      DOCKER_VOLUME_PROBE_IMAGE,
      '-ec',
      script,
    ], {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    if (probe.error) {
      return {
        ok: false,
        message: probe.error.code === 'ETIMEDOUT'
          ? `Postgres initdb host-bind probe did not complete within ${timeoutMs}ms`
          : probe.error.message,
      };
    }
    if (probe.status !== 0) {
      return {
        ok: false,
        message: `${commandFailureMessage(probe, 'Postgres initdb host-bind probe')}. Host bind storage reported this before compose startup; free host disk space or choose another ${DOCKER_EVIDENCE_HOST_STORAGE_DIR_ENV}.`,
      };
    }

    return { ok: true };
  } finally {
    spawnSync('docker', ['rm', '-f', containerName], {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    rmSync(probeRoot, { recursive: true, force: true });
  }
}

function probeDockerVolumeWritable({ cwd, bytes, timeoutMs }) {
  const volumeName = `social-monitor-backend-evidence-preflight-${process.pid}-${Date.now().toString(36)}`;
  const probeMiB = Math.max(1, Math.ceil(bytes / 1024 ** 2));
  const script = [
    'set -eu',
    'mkdir -p /probe/preflight',
    `dd if=/dev/zero of=/probe/preflight/write-probe.bin bs=1M count=${probeMiB} conv=fsync`,
    'rm -f /probe/preflight/write-probe.bin',
    'rmdir /probe/preflight',
  ].join('\n');

  const cleanup = () => {
    spawnSync('docker', ['volume', 'rm', '-f', volumeName], {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
  };

  try {
    const created = spawnSync('docker', ['volume', 'create', volumeName], {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    if (created.error) {
      return {
        ok: false,
        message: created.error.code === 'ETIMEDOUT'
          ? `docker volume create did not respond within ${timeoutMs}ms`
          : created.error.message,
      };
    }
    if (created.status !== 0) {
      return {
        ok: false,
        message: commandFailureMessage(created, 'docker volume create'),
      };
    }

    const probe = spawnSync('docker', [
      'run',
      '--rm',
      '-v',
      `${volumeName}:/probe`,
      '--entrypoint',
      'sh',
      DOCKER_VOLUME_PROBE_IMAGE,
      '-ec',
      script,
    ], {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    if (probe.error) {
      return {
        ok: false,
        message: probe.error.code === 'ETIMEDOUT'
          ? `Docker volume write probe could not write ${formatBytes(bytes)} within ${timeoutMs}ms`
          : probe.error.message,
      };
    }
    if (probe.status !== 0) {
      return {
        ok: false,
        message: `${commandFailureMessage(probe, `Docker volume write probe could not write ${formatBytes(bytes)}`)}. Docker reported this before Postgres initdb could run; free Docker Desktop storage or prune unused Docker volumes/images.`,
      };
    }

    return { ok: true };
  } finally {
    cleanup();
  }
}

function probeDockerPostgresInitdbWritable({ cwd, timeoutMs }) {
  const volumeName = `social-monitor-backend-evidence-postgres-preflight-${process.pid}-${Date.now().toString(36)}`;
  const containerName = `${volumeName}-initdb`;
  const script = [
    'set -eu',
    'mkdir -p "$PGDATA"',
    'chown -R postgres:postgres /var/lib/postgresql',
    'gosu postgres initdb -D "$PGDATA" --data-checksums',
  ].join('\n');

  const cleanup = () => {
    spawnSync('docker', ['rm', '-f', containerName], {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    spawnSync('docker', ['volume', 'rm', '-f', volumeName], {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
  };

  try {
    const created = spawnSync('docker', ['volume', 'create', volumeName], {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    if (created.error) {
      return {
        ok: false,
        message: created.error.code === 'ETIMEDOUT'
          ? `docker volume create did not respond within ${timeoutMs}ms`
          : created.error.message,
      };
    }
    if (created.status !== 0) {
      return {
        ok: false,
        message: commandFailureMessage(created, 'docker volume create'),
      };
    }

    const probe = spawnSync('docker', [
      'run',
      '--rm',
      '--name',
      containerName,
      '-v',
      `${volumeName}:/var/lib/postgresql`,
      '--entrypoint',
      'sh',
      DOCKER_VOLUME_PROBE_IMAGE,
      '-ec',
      script,
    ], {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    if (probe.error) {
      return {
        ok: false,
        message: probe.error.code === 'ETIMEDOUT'
          ? `Postgres initdb probe did not complete within ${timeoutMs}ms`
          : probe.error.message,
      };
    }
    if (probe.status !== 0) {
      return {
        ok: false,
        message: `${commandFailureMessage(probe, 'Postgres initdb probe')}. Docker reported this before compose startup; free Docker Desktop storage or prune unused Docker volumes/images.`,
      };
    }

    return { ok: true };
  } finally {
    cleanup();
  }
}

function probeDockerApiSocket({ cwd, timeoutMs }) {
  const socketPath = dockerApiSocketPath();
  if (socketPath === undefined) {
    return undefined;
  }

  const probe = spawnSync(process.execPath, ['-e', dockerSocketPingScript(), socketPath, String(timeoutMs)], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs + 1_000,
  });

  if (probe.error) {
    return {
      ok: false,
      message: probe.error.code === 'ETIMEDOUT'
        ? `Docker API socket ${socketPath} did not respond within ${timeoutMs}ms`
        : probe.error.message,
    };
  }
  if (probe.status !== 0) {
    const stderr = probe.stderr.trim();
    return {
      ok: false,
      message: stderr.length > 0
        ? stderr
        : `Docker API socket probe exited with status ${probe.status ?? 'unknown'}`,
    };
  }

  let result;
  try {
    result = JSON.parse(probe.stdout);
  } catch {
    return {
      ok: false,
      message: `Docker API socket probe returned non-JSON output: ${probe.stdout.trim()}`,
    };
  }

  if (typeof result.error === 'string' && result.error.length > 0) {
    return {
      ok: false,
      message: result.error,
    };
  }
  if (result.statusCode !== 200) {
    const bodySummary = typeof result.body === 'string' && result.body.length > 0
      ? ` with body ${JSON.stringify(result.body)}`
      : '';
    return {
      ok: false,
      message: `GET /_ping returned HTTP ${result.statusCode ?? 'unknown'}${bodySummary}`,
    };
  }
  if (result.body !== 'OK') {
    return {
      ok: false,
      message: `GET /_ping returned ${JSON.stringify(result.body)}`,
    };
  }

  return { ok: true };
}

function dockerEvidenceStorageMode() {
  const raw = process.env[DOCKER_EVIDENCE_STORAGE_MODE_ENV]?.trim();
  if (raw === undefined || raw.length === 0) {
    return DOCKER_EVIDENCE_STORAGE_DOCKER_VOLUME_MODE;
  }
  if (raw === DOCKER_EVIDENCE_STORAGE_DOCKER_VOLUME_MODE || raw === DOCKER_EVIDENCE_STORAGE_HOST_BIND_MODE) {
    return raw;
  }

  throw new Error(`${DOCKER_EVIDENCE_STORAGE_MODE_ENV} must be ${DOCKER_EVIDENCE_STORAGE_DOCKER_VOLUME_MODE} or ${DOCKER_EVIDENCE_STORAGE_HOST_BIND_MODE}`);
}

function prepareHostBindStorageRoot({ tempDir, projectName }) {
  const baseRoot = process.env[DOCKER_EVIDENCE_HOST_STORAGE_DIR_ENV]?.trim();
  const root = resolve(baseRoot && baseRoot.length > 0
    ? join(baseRoot, projectName)
    : join(tempDir, 'host-storage', projectName));

  for (const service of ['postgres', 'redis', 'rabbitmq']) {
    mkdirSync(join(root, service), { recursive: true });
  }

  return root;
}

function dockerApiSocketPath() {
  const dockerHost = process.env.DOCKER_HOST?.trim();
  if (dockerHost?.startsWith('unix://')) {
    return dockerHost.slice('unix://'.length);
  }
  if (dockerHost !== undefined && dockerHost.length > 0) {
    return undefined;
  }

  return '/var/run/docker.sock';
}

function dockerSocketPingScript() {
  return `
    const http = require('node:http');
    const [socketPath, timeoutRaw] = process.argv.slice(1);
    const timeoutMs = Number(timeoutRaw);
    const request = http.request({
      socketPath,
      method: 'GET',
      path: '/_ping',
      timeout: timeoutMs,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 4096) body = body.slice(0, 4096);
      });
      response.on('end', () => {
        console.log(JSON.stringify({
          statusCode: response.statusCode ?? 0,
          body: body.trim(),
        }));
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(\`Docker API socket \${socketPath} did not respond within \${timeoutMs}ms\`));
    });
    request.on('error', (error) => {
      console.log(JSON.stringify({ error: error.message }));
    });
    request.end();
  `;
}

function buildComposeOverride(values) {
  const commonEnvironment = [
    ['SOCIAL_MONITOR_OIDC_ISSUER', values.issuer],
    ['SOCIAL_MONITOR_OIDC_AUDIENCE', values.audience],
    ['SOCIAL_MONITOR_OIDC_JWKS_JSON', values.jwksJson],
    ['SOURCE_CONFIG_ENCRYPTION_KEY', values.sourceConfigEncryptionKey],
    ['DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY', values.webhookSecretEncryptionKey],
    ['SUBSCRIPTIONS_PERSISTENCE', 'prisma'],
    ['REDDIT_APP_CLIENT_ID', process.env.REDDIT_APP_CLIENT_ID],
    ['REDDIT_APP_CLIENT_SECRET', process.env.REDDIT_APP_CLIENT_SECRET],
    ['REDDIT_APP_USER_AGENT', process.env.REDDIT_APP_USER_AGENT],
  ];
  const fastLoopEnvironment = [
    ...commonEnvironment,
    ['INGESTION_SCAN_SCHEDULER_INTERVAL_MS', '1000'],
    ['INGESTION_SCAN_QUEUE_DRAIN_INTERVAL_MS', '500'],
    ['INTELLIGENCE_SUMMARY_QUEUE_DRAIN_INTERVAL_MS', '500'],
    ['DELIVERY_ATTEMPT_QUEUE_DRAIN_INTERVAL_MS', '500'],
    ['DELIVERY_SUMMARY_READY_EVENT_DRAIN_INTERVAL_MS', '500'],
    ['DELIVERY_DIGEST_SCHEDULER_INTERVAL_MS', '1000'],
    ['DELIVERY_ATTEMPT_DISPATCH_INTERVAL_MS', '1000'],
    ['EVENT_RELAY_INTERVAL_MS', '500'],
  ];

  return [
    'services:',
    ...hostBindStorageServiceSections(values.hostStorageRoot),
    serviceEnvironment('api', commonEnvironment),
    serviceEnvironment('ingestion-worker', fastLoopEnvironment),
    serviceEnvironment('intelligence-worker', fastLoopEnvironment),
    serviceEnvironment('delivery-service', fastLoopEnvironment),
    serviceEnvironment('event-relay', fastLoopEnvironment),
    '',
  ].join('\n');
}

function hostBindStorageServiceSections(hostStorageRoot) {
  if (hostStorageRoot === undefined) {
    return [];
  }

  return [
    serviceVolumes('postgres', [[join(hostStorageRoot, 'postgres'), '/var/lib/postgresql']]),
    serviceVolumes('redis', [[join(hostStorageRoot, 'redis'), '/data']]),
    serviceVolumes('rabbitmq', [[join(hostStorageRoot, 'rabbitmq'), '/var/lib/rabbitmq']]),
  ];
}

function serviceVolumes(service, entries) {
  return [
    `  ${service}:`,
    '    volumes:',
    ...entries.flatMap(([source, target]) => [
      '      - type: bind',
      `        source: ${JSON.stringify(source)}`,
      `        target: ${JSON.stringify(target)}`,
    ]),
  ].join('\n');
}

function serviceEnvironment(service, entries) {
  const normalizedEntries = entries.filter(([, value]) => typeof value === 'string' && value.trim().length > 0);

  return [
    `  ${service}:`,
    '    environment:',
    ...normalizedEntries.map(([name, value]) => `      ${name}: ${JSON.stringify(value)}`),
  ].join('\n');
}

function waitForReady(apiBaseUrl) {
  const deadline = Date.now() + 180_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = execFileSync(process.execPath, ['-e', `
        try {
          const response = await fetch(${JSON.stringify(`${apiBaseUrl}/ready`)});
          const body = await response.json();
          if (!response.ok || body.status !== 'ok') process.exit(1);
        } catch {
          process.exit(1);
        }
      `], { encoding: 'utf8' });
      void response;
      return;
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
    }
  }

  throw lastError ?? new Error('API /ready did not become healthy');
}

function inspectApiImageDigest({ docker, composeBaseArgs, composeEnv }) {
  const containerId = docker([...composeBaseArgs, 'ps', '-q', 'api'], {
    env: composeEnv,
    encoding: 'utf8',
  }).trim();
  if (containerId.length === 0) {
    throw new Error('api container id not found');
  }

  return docker(['inspect', containerId, '--format', '{{.Image}}'], {
    env: composeEnv,
    encoding: 'utf8',
  }).trim();
}

function shouldKeepStack(keepEnvNames) {
  if (process.env.KEEP_DOCKER_BACKEND_EVIDENCE_STACK === '1') {
    return true;
  }

  return keepEnvNames.some((name) => process.env[name] === '1');
}

function dockerComposeBuildCacheArgs() {
  return boolEnv('DOCKER_BACKEND_EVIDENCE_NO_CACHE') ? ['--no-cache'] : [];
}

function boolEnv(name) {
  const value = process.env[name]?.trim().toLowerCase();

  return value === '1' || value === 'true' || value === 'yes';
}

function dockerComposeBuildFailureMessage(error, storageMode) {
  const reason = error instanceof Error ? error.message : String(error);
  return [
    'Docker backend evidence image build failed.',
    `Storage mode: ${storageMode}.`,
    'If the build output above contains ENOSPC or "No space left on device", Docker Desktop image/build-layer storage is full.',
    'Host-bind mode only moves Postgres/RabbitMQ/Redis service data to host storage; it cannot move Docker image layers or npm ci layers out of Docker Desktop storage.',
    dockerSystemDfSnapshot(),
    `Original failure: ${reason}`,
  ].join('\n');
}

function dockerSystemDfSnapshot() {
  const result = spawnSync('docker', ['system', 'df'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: DEFAULT_DOCKER_PREFLIGHT_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    return `Docker storage snapshot unavailable: ${result.error.message}`;
  }
  if (result.status !== 0) {
    return `Docker storage snapshot unavailable: docker system df exited with status ${result.status ?? 'unknown'}`;
  }

  return [
    'Docker storage snapshot:',
    result.stdout.trim(),
  ].join('\n');
}

function randomPort() {
  return randomInt(20_000, 49_000);
}

function availableDiskBytes(cwd) {
  const stats = statfsSync(cwd);
  return Number(stats.bavail) * Number(stats.bsize);
}

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function boundedPositiveIntegerEnv(name, fallback, max) {
  const value = positiveIntegerEnv(name, fallback);
  if (value > max) {
    throw new Error(`${name} must be <= ${max}`);
  }

  return value;
}

function commandFailureMessage(result, label) {
  const stderr = result.stderr?.trim() ?? '';
  const stdout = result.stdout?.trim() ?? '';
  if (stderr.length > 0) {
    return `${label} failed: ${stderr}`;
  }
  if (stdout.length > 0) {
    return `${label} failed: ${stdout}`;
  }
  return `${label} exited with status ${result.status ?? 'unknown'}`;
}

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
