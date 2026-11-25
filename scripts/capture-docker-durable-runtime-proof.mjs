import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { dirname, join } from 'node:path';
import { URL } from 'node:url';

import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const serviceMap = new Map([
  ['api-gateway', 'api'],
  ['ingestion-worker', 'ingestion-worker'],
  ['intelligence-worker', 'intelligence-worker'],
  ['delivery-service', 'delivery-service'],
  ['event-relay', 'event-relay'],
]);

const serviceSelectorNames = new Map([
  [
    'api-gateway',
    [
      'MONITORING_PERSISTENCE',
      'MONITORING_SCAN_QUEUE',
      'FEED_PERSISTENCE',
      'RELEVANCE_PERSISTENCE',
      'SUMMARY_PERSISTENCE',
      'SUMMARY_JOB_QUEUE_MODE',
      'DELIVERY_PERSISTENCE',
      'DELIVERY_ENABLED_CHANNELS',
      'DELIVERY_WEBHOOK_PROVIDER',
      'IDENTITY_PERSISTENCE',
      'USAGE_PERSISTENCE',
    ],
  ],
  [
    'ingestion-worker',
    [
      'INGESTION_SUPPORT_PERSISTENCE',
      'INGESTION_WORKER_PERSISTENCE',
      'INGESTION_SCAN_QUEUE_READER',
      'INGESTION_SCAN_QUEUE_DRAIN_LOOP',
      'INGESTION_SCAN_REPORTER',
      'MONITORING_PERSISTENCE',
      'FEED_PERSISTENCE',
    ],
  ],
  [
    'intelligence-worker',
    [
      'SUMMARY_PERSISTENCE',
      'SUMMARY_JOB_QUEUE_MODE',
      'INTELLIGENCE_SUMMARY_QUEUE_READER',
      'INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP',
      'INTELLIGENCE_SUMMARY_JOB_LOOP',
    ],
  ],
  [
    'delivery-service',
    [
      'DELIVERY_PERSISTENCE',
      'DELIVERY_ENABLED_CHANNELS',
      'DELIVERY_WEBHOOK_PROVIDER',
      'DELIVERY_ATTEMPT_DISPATCH_TARGET',
      'DELIVERY_ATTEMPT_DISPATCH_QUEUE',
      'DELIVERY_ATTEMPT_QUEUE_READER',
      'DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP',
      'DELIVERY_SUMMARY_READY_EVENT_READER',
      'DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP',
    ],
  ],
  ['event-relay', ['EVENT_RELAY_LOOP']],
]);

const apiBaseUrl = process.env.API_BASE_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? '3000'}`;
const outputPath =
  process.env.DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH ??
  `/tmp/social-monitor-durable-runtime-selector-${Date.now()}.json`;
const artifactTarget = validateEvidenceJsonFilePath(outputPath, 'DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH');
const envFilePath =
  process.env.DURABLE_RUNTIME_SELECTOR_ENV_PATH ??
  join(dirname(artifactTarget), 'durable-runtime-selector.env');
const envFileTarget = validateEvidenceEnvFilePath(envFilePath);
const environmentId = process.env.STAGING_ENVIRONMENT_ID ?? 'docker-alpha-1';
const operator = process.env.STAGING_OPERATOR ?? 'backend-ops-1';
const imageDigest = process.env.BACKEND_IMAGE_DIGEST ?? inspectImageDigest('social-monitor-local-api');

const ready = await fetchReady(apiBaseUrl);
const sampledAt = ready.checkedAt ?? new Date().toISOString();
const services = [];

for (const [serviceId, composeService] of serviceMap.entries()) {
  const env = readContainerEnv(composeService);
  const sharedSelectors = selectSharedSelectors(env);
  const serviceSelectors = selectServiceSelectors(env, serviceSelectorNames.get(serviceId) ?? []);
  const running = isComposeServiceRunning(composeService);

  services.push({
    serviceId,
    runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
    sharedSelectors,
    serviceSelectors,
    forbiddenSelectorValuesFound: findForbiddenSelectorValues({
      ...sharedSelectors,
      ...serviceSelectors,
    }),
    healthCheck: {
      status: running ? 'passed' : 'failed',
      checkedAt: sampledAt,
    },
  });
}

const artifact = {
  schemaVersion: 1,
  artifactFormat: 'durable-runtime-selector-artifact-v1',
  scope: 'backend-only',
  frontendPolicy: 'deferred_contract_only',
  provenance: {
    evidenceKind: 'staging_runtime_selector',
    collectionMethod: 'Docker Compose beta backend runtime selector capture.',
    runner: 'scripts/capture-docker-durable-runtime-proof.mjs',
    fixtureOnly: false,
  },
  environment: {
    environmentId,
    imageDigest,
    apiBaseUrl,
    sampledAt,
    operator,
  },
  services,
  rollup: {
    allServicesDurable: services.every((service) => service.healthCheck.status === 'passed'),
    forbiddenSelectorsFound: services.some((service) => service.forbiddenSelectorValuesFound.length > 0),
    runtimeProfile: ready.runtime?.runtimeProfile ?? 'unknown',
  },
};

assertReadyPayloadMatchesArtifact(ready, artifact);
mkdirSync(dirname(artifactTarget), { recursive: true });
writeFileSync(artifactTarget, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
chmodSync(artifactTarget, 0o600);
writeEvidenceEnvFile(envFileTarget, [
  ['DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH', artifactTarget],
  ['API_BASE_URL', apiBaseUrl],
  ['STAGING_ENVIRONMENT_ID', environmentId],
  ['BACKEND_IMAGE_DIGEST', imageDigest],
  ['STAGING_OPERATOR', operator],
], {
  usageLines: [
    'Usage:',
    `set -a; . ${shellQuote(envFileTarget)}; set +a`,
    'npm run beta:evidence:validate -- --jobs durable-runtime-proof',
  ],
});
console.log(`DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH=${artifactTarget}`);
console.log(`DURABLE_RUNTIME_SELECTOR_ENV_PATH=${envFileTarget}`);

async function fetchReady(baseUrl) {
  const { statusCode, body } = await getJson(new URL('/ready', baseUrl));
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`GET /ready failed with HTTP ${statusCode}`);
  }
  if (body.status !== 'ok') {
    throw new Error('GET /ready did not report ok status');
  }

  return body;
}

function getJson(url) {
  const client = url.protocol === 'https:' ? httpsGet : httpGet;

  return new Promise((resolve, reject) => {
    const request = client(url, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        raw += chunk;
      });
      response.on('end', () => {
        try {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: JSON.parse(raw),
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    request.setTimeout(10_000, () => {
      request.destroy(new Error(`GET ${url.href} timed out`));
    });
  });
}

function readContainerEnv(composeService) {
  const containerId = composeServiceContainerId(composeService);

  if (containerId.length === 0) {
    throw new Error(`compose service ${composeService} is not created`);
  }

  const raw = execFileSync('docker', ['inspect', containerId, '--format', '{{json .Config.Env}}'], {
    encoding: 'utf8',
  });
  const entries = JSON.parse(raw);
  const env = {};

  for (const entry of entries) {
    const separator = entry.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    env[entry.slice(0, separator)] = entry.slice(separator + 1);
  }

  return env;
}

function selectSharedSelectors(env) {
  return {
    SOCIAL_MONITOR_RUNTIME_PROFILE: requireEnv(env, 'SOCIAL_MONITOR_RUNTIME_PROFILE'),
    DATABASE_URL_KIND: classifyUrlKind(requireEnv(env, 'DATABASE_URL'), 'postgresql'),
    RABBITMQ_URL_KIND: classifyUrlKind(requireEnv(env, 'RABBITMQ_URL'), 'amqp'),
    RABBITMQ_QUEUE_TYPE: requireEnv(env, 'RABBITMQ_QUEUE_TYPE'),
    RABBITMQ_QUEUE_DELIVERY_LIMIT: requireEnv(env, 'RABBITMQ_QUEUE_DELIVERY_LIMIT'),
    SOCIAL_MONITOR_USER_AUTH_MODE: requireEnv(env, 'SOCIAL_MONITOR_USER_AUTH_MODE'),
  };
}

function selectServiceSelectors(env, names) {
  const selected = {};
  for (const name of names) {
    selected[name] = requireEnv(env, name);
  }

  return selected;
}

function requireEnv(env, name) {
  const value = env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is missing from docker runtime env`);
  }

  return value;
}

function classifyUrlKind(value, expectedKind) {
  const parsed = new URL(value);
  const kind = parsed.protocol.replace(':', '');

  if (kind !== expectedKind) {
    throw new Error(`expected ${expectedKind} URL kind but found ${kind}`);
  }

  return kind;
}

function isComposeServiceRunning(composeService) {
  const runningServices = dockerStdout(['compose', 'ps', '--services', '--status', 'running'])
    .split('\n')
    .map((service) => service.trim())
    .filter(Boolean);

  if (runningServices.includes(composeService)) {
    return true;
  }

  const projectName = process.env.COMPOSE_PROJECT_NAME?.trim();
  if (projectName === undefined || projectName.length === 0) {
    return false;
  }

  return dockerStdout([
    'ps',
    '-q',
    '--filter',
    `label=com.docker.compose.project=${projectName}`,
    '--filter',
    `label=com.docker.compose.service=${composeService}`,
    '--filter',
    'status=running',
  ]).trim().length > 0;
}

function composeServiceContainerId(composeService) {
  const fromCompose = dockerStdout(['compose', 'ps', '-q', composeService]).trim();
  if (fromCompose.length > 0) {
    return fromCompose;
  }

  const projectName = process.env.COMPOSE_PROJECT_NAME?.trim();
  if (projectName === undefined || projectName.length === 0) {
    return '';
  }

  return dockerStdout([
    'ps',
    '-aq',
    '--filter',
    `label=com.docker.compose.project=${projectName}`,
    '--filter',
    `label=com.docker.compose.service=${composeService}`,
  ])
    .split('\n')
    .map((containerId) => containerId.trim())
    .filter(Boolean)[0] ?? '';
}

function dockerStdout(args) {
  return execFileSync('docker', args, { encoding: 'utf8' });
}

function findForbiddenSelectorValues(selectors) {
  const forbidden = [];

  for (const [selector, value] of Object.entries(selectors)) {
    const normalized = value.toLowerCase();
    if (normalized === 'in-memory' || normalized === 'noop') {
      forbidden.push(`${selector}=${value}`);
    }
    if (selector === 'SOCIAL_MONITOR_USER_AUTH_MODE' && normalized === 'disabled') {
      forbidden.push(`${selector}=${value}`);
    }
    if (selector === 'EVENT_RELAY_LOOP' && normalized === 'disabled') {
      forbidden.push(`${selector}=${value}`);
    }
    if (selector === 'DELIVERY_SUMMARY_READY_EVENT_READER' && normalized === 'disabled') {
      forbidden.push(`${selector}=${value}`);
    }
    if (selector === 'DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP' && normalized === 'disabled') {
      forbidden.push(`${selector}=${value}`);
    }
  }

  return forbidden;
}

function inspectImageDigest(imageName) {
  return execFileSync('docker', ['image', 'inspect', imageName, '--format', '{{.Id}}'], {
    encoding: 'utf8',
  }).trim();
}

function assertReadyPayloadMatchesArtifact(ready, artifact) {
  const runtime = ready.runtime;
  if (runtime?.runtimeProfile !== 'beta') {
    throw new Error('ready runtimeProfile must be beta');
  }
  if (runtime.nodeEnv !== 'staging') {
    throw new Error('ready nodeEnv must be staging');
  }
  assertEqual(runtime.persistence.monitoring, 'prisma', 'ready monitoring persistence');
  assertEqual(runtime.persistence.feed, 'prisma', 'ready feed persistence');
  assertEqual(runtime.persistence.ingestionSupport, 'prisma', 'ready ingestion support persistence');
  assertEqual(runtime.persistence.summary, 'prisma', 'ready summary persistence');
  assertEqual(runtime.persistence.delivery, 'prisma', 'ready delivery persistence');
  assertEqual(runtime.persistence.identity, 'prisma', 'ready identity persistence');
  assertEqual(runtime.persistence.usage, 'prisma', 'ready usage persistence');
  assertEqual(runtime.queues.monitoringScanPublisher, 'rabbitmq', 'ready monitoring scan publisher');
  assertEqual(runtime.queues.ingestionScanReader, 'rabbitmq', 'ready ingestion scan reader');
  assertEqual(runtime.queues.summaryJobPublisher, 'rabbitmq', 'ready summary job publisher');
  assertEqual(runtime.queues.intelligenceSummaryReader, 'rabbitmq', 'ready intelligence summary reader');
  assertEqual(runtime.queues.deliveryAttemptPublisher, 'rabbitmq', 'ready delivery attempt publisher');
  assertEqual(runtime.queues.deliveryAttemptReader, 'rabbitmq', 'ready delivery attempt reader');
  assertEqual(runtime.queues.deliverySummaryReadyEventReader, 'rabbitmq', 'ready delivery summary ready event reader');
  assertEqual(runtime.workerLoops.deliverySummaryReadyEventDrain, 'enabled', 'ready delivery summary ready event drain');
  assertEqual(runtime.providers.deliveryWebhook, 'http', 'ready delivery webhook provider');
  assertEqual(runtime.providers.deliveryEnabledChannels, 'webhook', 'ready delivery enabled channels');

  const failedServices = artifact.services.filter((service) => service.healthCheck.status !== 'passed');
  if (failedServices.length > 0) {
    const serviceList = failedServices
      .map((service) => `${service.serviceId}:${service.healthCheck.status}`)
      .join(', ');
    throw new Error(`all docker backend services must be running; failed=${serviceList}`);
  }
  if (artifact.rollup.forbiddenSelectorsFound) {
    throw new Error('docker runtime selector capture found forbidden selector values');
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${expected}, received ${actual}`);
  }
}
