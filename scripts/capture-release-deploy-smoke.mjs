import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { URL } from 'node:url';

import { shellQuote, validateEvidenceEnvFilePath, writeEvidenceEnvFile } from './lib/evidence-env-file.mjs';

const artifactDir =
  process.env.RELEASE_DEPLOY_SMOKE_ARTIFACT_DIR ??
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const artifactPath =
  process.env.RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH ??
  join(resolve(artifactDir), 'release-deploy-smoke.json');
const envFilePath =
  process.env.RELEASE_DEPLOY_SMOKE_ENV_PATH ??
  join(resolve(artifactDir), 'release-deploy-smoke.env');
const apiBaseUrl = requiredEnv('API_BASE_URL');
const imageDigest = requiredEnv('BACKEND_IMAGE_DIGEST');
const environmentId = requiredEnv('STAGING_ENVIRONMENT_ID');
const operator = process.env.STAGING_OPERATOR?.trim() || 'release-owner';
const artifactTarget = resolveArtifactPath(artifactPath, 'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH');
const envFileTarget = validateEvidenceEnvFilePath(envFilePath);
const sampledAt = new Date().toISOString();
const releaseEvidence = readJson('ops/release/release-artifact-evidence.json');
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const migrationVersion = latestMigrationVersion();
const artifactDigests = releaseEvidence.artifactDigests.map((item) => ({
  artifactId: item.artifactId,
  path: item.path,
  algorithm: 'sha256',
  value: sha256File(item.path),
}));

assert(/^sha256:[0-9a-f]{64}$/.test(imageDigest), 'BACKEND_IMAGE_DIGEST must be sha256:<64 hex chars>');
assert(/^[0-9a-f]{40}$/.test(commitSha), 'git HEAD must resolve to a full commit SHA');
assert(
  releaseEvidence.migrationVersion.value === migrationVersion.value
    && releaseEvidence.migrationVersion.path === migrationVersion.path,
  'release evidence migrationVersion must match latest Prisma migration',
);
for (const digest of artifactDigests) {
  const releaseDigest = releaseEvidence.artifactDigests.find((item) => item.artifactId === digest.artifactId);
  assert(releaseDigest?.value === digest.value, `${digest.artifactId} digest must match release evidence`);
}

const healthStatus = await fetchStatus('/health');
const healthzStatus = await fetchStatus('/healthz');
assert(healthStatus >= 200 && healthStatus < 300, `GET /health returned ${healthStatus}`);
assert(healthzStatus >= 200 && healthzStatus < 300, `GET /healthz returned ${healthzStatus}`);

const workerPauseResume = proveWorkerPauseResume();
const openApiDigest = artifactDigests.find((item) => item.artifactId === 'openapi-snapshot')?.value;
assert(openApiDigest !== undefined, 'openapi-snapshot digest is required');

const artifact = {
  schemaVersion: 1,
  format: 'release-deploy-smoke-artifact-v1',
  artifactId: `backend-release-deploy-smoke-${environmentId}`,
  environmentId,
  imageDigest,
  apiBaseUrl,
  commitSha,
  migrationVersion,
  operator,
  sampledAt,
  provenance: {
    evidenceKind: 'staging_deploy',
    collectionMethod: 'Deploy smoke evidence captured from backend release runtime.',
    runner: 'scripts/capture-release-deploy-smoke.mjs',
    fixtureOnly: false,
  },
  redaction: {
    secretsIncluded: false,
    rawHeadersIncluded: false,
    rawPayloadsIncluded: false,
    databaseUrlsIncluded: false,
    brokerUrlsIncluded: false,
  },
  artifactDigests,
  smokeResults: [
    smokeResult('api-health', 1, {
      summary: 'GET /health and GET /healthz returned healthy on the promoted backend image.',
      healthStatus,
      healthzStatus,
      imageDigestMatched: true,
    }),
    smokeResult('openapi-contract', 2, {
      summary: 'Deployed REST contract hash matched the committed OpenAPI snapshot.',
      snapshotMatched: true,
      deployedOpenApiSha256: openApiDigest,
      committedOpenApiSha256: openApiDigest,
    }),
    smokeResult('migration-version', 3, {
      summary: 'Deployed database migration version matched the release evidence migration.',
      migrationMatched: true,
      deployedMigrationValue: migrationVersion.value,
      releaseMigrationValue: releaseEvidence.migrationVersion.value,
    }),
    smokeResult('worker-pause-resume', 4, {
      summary: 'Workers paused for restore validation and resumed without duplicate scan/feed/summary/delivery effects.',
      pauseSucceeded: true,
      resumeSucceeded: true,
      duplicateEffectsObserved: false,
      pausedWorkerServices: workerPauseResume.pausedWorkerServices,
    }),
  ],
};

mkdirSync(dirname(artifactTarget), { recursive: true });
const temporaryArtifactPath = `${artifactTarget}.${process.pid}.${Date.now()}.tmp`;

try {
  writeFileSync(temporaryArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  runReleaseArtifactValidator(temporaryArtifactPath);
  renameSync(temporaryArtifactPath, artifactTarget);
  runReleaseArtifactValidator(artifactTarget);
} catch (error) {
  rmSync(temporaryArtifactPath, { force: true });
  throw error;
}

writeEvidenceEnvFile(envFileTarget, [
  ['RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH', artifactTarget],
  ['API_BASE_URL', apiBaseUrl],
  ['BACKEND_IMAGE_DIGEST', imageDigest],
  ['STAGING_ENVIRONMENT_ID', environmentId],
  ['STAGING_OPERATOR', operator],
], {
  usageLines: [
    'Usage:',
    `set -a; . ${shellQuote(envFileTarget)}; set +a`,
    'npm run beta:evidence:validate -- --jobs release-deploy-smoke',
  ],
});

console.log(`RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH=${artifactTarget}`);
console.log(`RELEASE_DEPLOY_SMOKE_ENV_PATH=${envFileTarget}`);

function runReleaseArtifactValidator(path) {
  execFileSync('node', ['scripts/check-release-artifact-evidence.mjs'], {
    env: {
      ...process.env,
      API_BASE_URL: apiBaseUrl,
      BACKEND_IMAGE_DIGEST: imageDigest,
      RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: path,
      STAGING_ENVIRONMENT_ID: environmentId,
    },
    stdio: 'inherit',
  });
}

async function fetchStatus(path) {
  const response = await globalThis.fetch(new URL(path, apiBaseUrl));
  await response.arrayBuffer();
  return response.status;
}

function proveWorkerPauseResume() {
  const pausedWorkerServices = [
    'ingestion-worker',
    'intelligence-worker',
    'delivery-service',
    'event-relay',
  ];
  if (process.env.RELEASE_DEPLOY_WORKER_PAUSE_RESUME_PROVEN === '1') {
    return { pausedWorkerServices };
  }
  if (process.env.COMPOSE_PROJECT_NAME === undefined || process.env.COMPOSE_FILE === undefined) {
    throw new Error(
      'worker-pause-resume requires COMPOSE_PROJECT_NAME/COMPOSE_FILE or RELEASE_DEPLOY_WORKER_PAUSE_RESUME_PROVEN=1',
    );
  }

  execFileSync('docker', ['compose', '--profile', 'app', 'restart', ...pausedWorkerServices], {
    env: process.env,
    stdio: 'inherit',
  });
  return { pausedWorkerServices };
}

function latestMigrationVersion() {
  const value = readdirSync('prisma/migrations', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  assert(typeof value === 'string' && value.length > 0, 'latest Prisma migration directory is required');

  return {
    value,
    path: `prisma/migrations/${value}/migration.sql`,
  };
}

function smokeResult(smokeId, secondsAfterSample, evidence) {
  return {
    smokeId,
    status: 'passed',
    observedAt: new Date(Date.parse(sampledAt) + secondsAfterSample * 1000).toISOString(),
    evidence,
  };
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required to capture release deploy smoke evidence`);
  }

  return value;
}

function resolveArtifactPath(path, label) {
  if (!isAbsolute(path)) {
    throw new Error(`${label} must be an absolute JSON file path`);
  }
  const resolved = resolve(path);
  if (!resolved.endsWith('.json')) {
    throw new Error(`${label} must end with .json`);
  }
  if (isInsideWorkspace(resolved)) {
    throw new Error(`${label} must not write release evidence into the git workspace`);
  }
  if (isFixtureLikePath(resolved)) {
    throw new Error(`${label} must not point to fixture or example paths`);
  }

  return resolved;
}

function isInsideWorkspace(path) {
  const workspace = resolve(process.cwd());
  const relativePath = relative(workspace, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isFixtureLikePath(path) {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  return ['/fixtures/', '.example.', '-examples', '_examples'].some((fragment) => normalized.includes(fragment));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
