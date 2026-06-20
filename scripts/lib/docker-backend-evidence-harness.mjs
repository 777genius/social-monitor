import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomInt } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

export async function withDockerBackendEvidenceStack(options, callback) {
  const runId = Date.now().toString(36);
  const projectName = process.env[options.projectEnvName] ?? `${options.projectPrefix}-${runId}`;
  const tempDir = mkdtempSync(join(tmpdir(), `${options.projectPrefix}-`));
  const overridePath = join(tempDir, 'compose.override.yml');
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
    docker([...composeBaseArgs, 'up', '--build', '-d'], { stdio: 'inherit' });
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

function buildComposeOverride(values) {
  const commonEnvironment = [
    ['SOCIAL_MONITOR_OIDC_ISSUER', values.issuer],
    ['SOCIAL_MONITOR_OIDC_AUDIENCE', values.audience],
    ['SOCIAL_MONITOR_OIDC_JWKS_JSON', values.jwksJson],
    ['SOURCE_CONFIG_ENCRYPTION_KEY', values.sourceConfigEncryptionKey],
    ['DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY', values.webhookSecretEncryptionKey],
  ];
  const fastLoopEnvironment = [
    ...commonEnvironment,
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
    serviceEnvironment('api', commonEnvironment),
    serviceEnvironment('ingestion-worker', fastLoopEnvironment),
    serviceEnvironment('intelligence-worker', fastLoopEnvironment),
    serviceEnvironment('delivery-service', fastLoopEnvironment),
    serviceEnvironment('event-relay', fastLoopEnvironment),
    '',
  ].join('\n');
}

function serviceEnvironment(service, entries) {
  return [
    `  ${service}:`,
    '    environment:',
    ...entries.map(([name, value]) => `      ${name}: ${JSON.stringify(value)}`),
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

function randomPort() {
  return randomInt(20_000, 49_000);
}
