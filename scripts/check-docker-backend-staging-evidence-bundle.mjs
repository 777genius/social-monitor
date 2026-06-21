import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { validateEvidenceEnvFilePath, writeEvidenceEnvFile } from './lib/evidence-env-file.mjs';

const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const captureScriptPath = 'scripts/capture-docker-backend-staging-evidence-bundle.mjs';
const importScriptPath = 'scripts/import-docker-backend-staging-evidence-bundle.mjs';
const dockerHarnessPath = 'scripts/lib/docker-backend-evidence-harness.mjs';
const checkScriptName = 'check:docker-backend-staging-evidence-bundle';
const checkCommand = `npm run ${checkScriptName}`;
const expectedBundleFormat = 'docker-backend-staging-evidence-bundle-v1';
const expectedArtifactIds = new Map([
  ['durable-runtime-selector', { env: 'DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH', format: 'durable-runtime-selector-artifact-v1' }],
  ['rabbitmq-staging-drill-output', {
    env: 'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
    format: 'staging-reliability-artifact-v1',
    expectedArtifactId: 'rabbitmq-staging-drill-output',
    minSignalCount: 1,
  }],
  ['postgres-restore-drill-output', {
    env: 'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
    format: 'staging-reliability-artifact-v1',
    expectedArtifactId: 'postgres-restore-drill-output',
    minSignalCount: 1,
  }],
  ['durable-backend-e2e-output', {
    env: 'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
    format: 'staging-reliability-artifact-v1',
    expectedArtifactId: 'durable-backend-e2e-output',
    minSignalCount: 1,
  }],
  ['source-credential-rotation', { env: 'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH', format: 'source-credential-rotation-redacted-v1', minOperationCount: 1 }],
  ['webhook-secret-rotation', { env: 'WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH', format: 'webhook-secret-rotation-redacted-v1', minOperationCount: 1 }],
  ['security-final-sweep', { env: 'SECURITY_FINAL_SWEEP_ARTIFACT_PATH', format: 'security-final-sweep-staging-artifact-v1', minSurfaceCount: 4, minSourceExportCount: 3 }],
  ['release-deploy-smoke', { env: 'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH', format: 'release-deploy-smoke-artifact-v1', minSmokeCount: 4 }],
]);
const requiredEnvKeys = [
  'API_BASE_URL',
  'BACKEND_IMAGE_DIGEST',
  'BACKEND_GIT_COMMIT_SHA',
  'DATABASE_URL',
  'RABBITMQ_URL',
  'RABBITMQ_MANAGEMENT_URL',
  'STAGING_ENVIRONMENT_ID',
  'STAGING_OPERATOR',
  'STAGING_SECRET_STORE_ID',
  ...[...expectedArtifactIds.values()].map((artifact) => artifact.env),
  'LOG_EXPORT_PATH',
  'METRICS_EXPORT_PATH',
  'PUBLIC_ERROR_EXPORT_PATH',
  'BACKEND_STAGING_EVIDENCE_BUNDLE_PATH',
];
const forbiddenBundleFragments = [
  'postgresql://',
  'postgres://',
  'amqp://',
  'redis://',
  'client_secret',
  'access_token',
  'refresh_token',
  'private_key',
  'BEGIN PRIVATE KEY',
  'social_monitor_local_password',
];
const violations = [];
const bundlePath = process.env.BACKEND_STAGING_EVIDENCE_BUNDLE_PATH;

validateStaticWiring();
validateCaptureOutputPathGuards();
validateSelfTestBundle();

if (bundlePath !== undefined && bundlePath.trim().length > 0) {
  validateBundleFile(bundlePath, { realMode: true });
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log(bundlePath ? 'Docker backend staging evidence bundle OK' : 'Docker backend staging evidence bundle contract OK');

function validateStaticWiring() {
  const packageJson = readJson(packagePath);
  const backendSafe = readJson(backendSafePath);
  const baseline = readJson(baselinePath);
  const releaseContract = readJson(releaseContractPath);
  const captureSource = readFileSync(captureScriptPath, 'utf8');
  const importSource = readFileSync(importScriptPath, 'utf8');
  const dockerHarnessSource = readFileSync(dockerHarnessPath, 'utf8');
  const packageScripts = packageJson.scripts ?? {};
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));

  if (packageScripts[checkScriptName] !== 'node scripts/check-docker-backend-staging-evidence-bundle.mjs') {
    violations.push(`${packagePath}: ${checkScriptName} must run scripts/check-docker-backend-staging-evidence-bundle.mjs`);
  }
  if (packageScripts['capture:docker-backend-staging-evidence-bundle'] !== 'node scripts/capture-docker-backend-staging-evidence-bundle.mjs') {
    violations.push(`${packagePath}: capture:docker-backend-staging-evidence-bundle must run ${captureScriptPath}`);
  }
  if (packageScripts['beta:evidence:import-docker-bundle'] !== 'node scripts/import-docker-backend-staging-evidence-bundle.mjs') {
    violations.push(`${packagePath}: beta:evidence:import-docker-bundle must run ${importScriptPath}`);
  }
  if (!backendScripts.has(checkScriptName)) {
    violations.push(`${backendSafePath}: backendScripts must include ${checkScriptName}`);
  }
  if (!baselineScripts.has(checkScriptName)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${checkScriptName}`);
  }
  if (!releaseGateCommands.has(checkCommand)) {
    violations.push(`${releaseContractPath}: requiredGates must include ${checkCommand}`);
  }
  for (const envName of requiredEnvKeys) {
    if (!captureSource.includes(envName)) {
      violations.push(`${captureScriptPath}: bundle capture must write ${envName}`);
    }
  }
  for (const [artifactId, definition] of expectedArtifactIds) {
    if (!captureSource.includes(artifactId)) {
      violations.push(`${captureScriptPath}: bundle capture must summarize ${artifactId}`);
    }
    if (!captureSource.includes(definition.env)) {
      violations.push(`${captureScriptPath}: bundle capture must include ${definition.env}`);
    }
  }
  if (!captureSource.includes('writeEvidenceEnvFile')) {
    violations.push(`${captureScriptPath}: bundle capture must use writeEvidenceEnvFile`);
  }
  for (const marker of ['validateEvidenceEnvFilePath', 'validateEvidenceJsonFilePath']) {
    if (!captureSource.includes(marker)) {
      violations.push(`${captureScriptPath}: bundle capture must use ${marker}`);
    }
  }
  if (!captureSource.includes('mode: 0o600')) {
    violations.push(`${captureScriptPath}: bundle capture must write bundle evidence with private file permissions`);
  }
  if (!captureSource.includes('chmodSync')) {
    violations.push(`${captureScriptPath}: bundle capture must chmod bundle evidence after repeated writes`);
  }
  if (!captureSource.includes("check:docker-backend-staging-evidence-bundle")) {
    violations.push(`${captureScriptPath}: bundle capture must self-validate the generated Docker bundle`);
  }
  for (const marker of [
    'BACKEND_STAGING_EVIDENCE_BUNDLE_PATH',
    'EXTERNAL_BETA_EVIDENCE_ENV_PATH',
    'readPrivateEvidenceJsonFile',
    'writeEvidenceEnvFile',
    'check:docker-backend-staging-evidence-bundle',
    'DATABASE_URL',
    'RABBITMQ_URL',
    'This import intentionally does not invent DATABASE_URL, RABBITMQ_URL',
  ]) {
    if (!importSource.includes(marker)) {
      violations.push(`${importScriptPath}: Docker bundle import must include ${marker}`);
    }
  }
  for (const marker of [
    'probeDockerApiSocket',
    '/_ping',
    'Docker API socket check failed',
    'DOCKER_BACKEND_EVIDENCE_SOCKET_PING_TIMEOUT_MS',
    'MAX_DOCKER_SOCKET_PING_TIMEOUT_MS',
    'boundedPositiveIntegerEnv',
    'DOCKER_HOST',
    'unix://',
  ]) {
    if (!dockerHarnessSource.includes(marker)) {
      violations.push(`${dockerHarnessPath}: Docker evidence preflight must include ${marker}`);
    }
  }
  for (const marker of [
    'probeDockerVolumeWritable',
    'DOCKER_BACKEND_EVIDENCE_VOLUME_PROBE_BYTES',
    'docker volume create',
    'Docker volume write probe failed',
    'probeDockerPostgresInitdbWritable',
    'Docker Postgres initdb probe failed',
    'gosu postgres initdb',
    'after Docker image build',
    '--no-build',
    'before Postgres initdb could run',
    'postgres:18.4-alpine',
  ]) {
    if (!dockerHarnessSource.includes(marker)) {
      violations.push(`${dockerHarnessPath}: Docker evidence volume storage preflight must include ${marker}`);
    }
  }
  for (const marker of [
    'DOCKER_BACKEND_EVIDENCE_STORAGE_MODE',
    'DOCKER_BACKEND_EVIDENCE_HOST_STORAGE_DIR',
    'host-bind',
    'probeDockerHostBindPostgresInitdbWritable',
    'serviceVolumes',
  ]) {
    if (!dockerHarnessSource.includes(marker)) {
      violations.push(`${dockerHarnessPath}: Docker evidence host-bind storage fallback must include ${marker}`);
    }
  }
}

function validateCaptureOutputPathGuards() {
  const outputPathEnvNames = [
    'DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH',
    'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
    'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
    'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
    'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH',
    'WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH',
    'SECURITY_FINAL_SWEEP_ARTIFACT_PATH',
    'LOG_EXPORT_PATH',
    'METRICS_EXPORT_PATH',
    'PUBLIC_ERROR_EXPORT_PATH',
    'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH',
    'BACKEND_STAGING_EVIDENCE_BUNDLE_PATH',
  ];

  for (const envName of outputPathEnvNames) {
    const workspacePath = resolve(`${envName.toLowerCase().replaceAll('_', '-')}-workspace-output.json`);
    const result = runCaptureExpectingFailure({
      [envName]: workspacePath,
      BACKEND_STAGING_EVIDENCE_ENV_PATH: '/tmp/social-monitor-backend-staging-evidence.env',
    });

    if (result.exitCode === 0) {
      violations.push(`${captureScriptPath}: capture must reject workspace ${envName}`);
    } else if (!result.output.includes(`${envName} must not write release evidence into the git workspace`)) {
      violations.push(`${captureScriptPath}: workspace ${envName} rejection must explain evidence path policy`);
    }
    if (existsSync(workspacePath)) {
      violations.push(`${captureScriptPath}: workspace ${envName} rejection must not create ${workspacePath}`);
    }
  }
}

function runCaptureExpectingFailure(env) {
  try {
    execFileSync(process.execPath, [captureScriptPath], {
      env: {
        ...process.env,
        ...env,
      },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function validateSelfTestBundle() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'docker-backend-evidence-bundle-'));
  try {
    const bundle = buildSyntheticBundle(tempDirectory);
    validateBundle(bundle.path, { realMode: false });

    const leakingBundle = JSON.parse(JSON.stringify(bundle.document));
    leakingBundle.redaction.databaseUrlsIncluded = true;
    leakingBundle.artifacts = leakingBundle.artifacts.filter((artifact) => artifact.artifactId !== 'release-deploy-smoke');
    expectInvalid(leakingBundle, tempDirectory, [
      'redaction.databaseUrlsIncluded must be false',
      'missing artifact release-deploy-smoke',
    ]);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateBundleFile(path, options) {
  validateBundle(path, options);
}

function validateBundle(path, options) {
  validateArtifactPath(path, 'bundle path', { allowWorkspace: false });
  validatePrivateFileMode(path, 'bundle path');
  const bundle = readJson(path);
  validateBundleDocument(bundle, path, options);
}

function validateBundleDocument(bundle, path, options) {
  const label = options.realMode ? path : 'self-test bundle';
  if (bundle.schemaVersion !== 1) {
    violations.push(`${label}: schemaVersion must be 1`);
  }
  if (bundle.format !== expectedBundleFormat) {
    violations.push(`${label}: format must be ${expectedBundleFormat}`);
  }
  if (bundle.scope !== 'backend-only') {
    violations.push(`${label}: scope must be backend-only`);
  }
  if (bundle.frontendPolicy !== 'deferred_contract_only') {
    violations.push(`${label}: frontendPolicy must keep frontend deferred`);
  }
  for (const field of ['environmentId', 'imageDigest', 'commitSha', 'apiBaseUrl', 'operator', 'generatedAt']) {
    if (!nonEmptyString(bundle[field])) {
      violations.push(`${label}: ${field} must be a non-empty string`);
    }
  }
  if (!String(bundle.imageDigest ?? '').startsWith('sha256:')) {
    violations.push(`${label}: imageDigest must be an immutable sha256 image reference`);
  }
  if (!/^[0-9a-f]{40}$/.test(String(bundle.commitSha ?? ''))) {
    violations.push(`${label}: commitSha must be a full 40 character git sha`);
  } else if (options.realMode === true && bundle.commitSha !== currentGitCommitSha()) {
    violations.push(`${label}: commitSha must match current git HEAD`);
  }
  validateTimestamp(bundle.generatedAt, `${label}: generatedAt`);
  validateProvenance(bundle.provenance, label);
  validateBundleRedaction(bundle.redaction, label);
  validateEnvFile(bundle.envFilePath, label);
  validateForbiddenBundleFragments(bundle, label);
  validateArtifactSummaries(bundle.artifacts, label);
}

function validateProvenance(provenance, label) {
  if (!isRecord(provenance)) {
    violations.push(`${label}: provenance must be an object`);
    return;
  }
  if (provenance.evidenceKind !== 'docker_staging_bundle') {
    violations.push(`${label}: provenance.evidenceKind must be docker_staging_bundle`);
  }
  if (provenance.runner !== captureScriptPath) {
    violations.push(`${label}: provenance.runner must be ${captureScriptPath}`);
  }
  if (provenance.fixtureOnly !== false) {
    violations.push(`${label}: provenance.fixtureOnly must be false`);
  }
}

function validateBundleRedaction(redaction, label) {
  if (!isRecord(redaction)) {
    violations.push(`${label}: redaction must be an object`);
    return;
  }
  for (const field of ['secretsIncluded', 'rawProviderPayloadsIncluded', 'databaseUrlsIncluded', 'brokerUrlsIncluded']) {
    if (redaction[field] !== false) {
      violations.push(`${label}: redaction.${field} must be false`);
    }
  }
}

function validateEnvFile(envFilePath, label) {
  try {
    validateEvidenceEnvFilePath(envFilePath);
  } catch (error) {
    violations.push(`${label}: envFilePath ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!fileExists(envFilePath)) {
    violations.push(`${label}: envFilePath must exist`);
    return;
  }

  const mode = statSync(envFilePath).mode & 0o077;
  if (mode !== 0) {
    violations.push(`${label}: envFilePath must use 0600-style permissions`);
  }

  const content = readFileSync(envFilePath, 'utf8');
  for (const envKey of requiredEnvKeys) {
    const assignment = new RegExp(`^${escapeRegex(envKey)}=`, 'm');
    if (!assignment.test(content)) {
      violations.push(`${label}: env file missing ${envKey}`);
    }
  }
  for (const forbiddenEnvKey of ['GITHUB_ACCESS_TOKEN', 'REDDIT_ACCESS_TOKEN', 'REDDIT_CLIENT_SECRET', 'REDDIT_REFRESH_TOKEN']) {
    const assignment = new RegExp(`^${escapeRegex(forbiddenEnvKey)}=`, 'm');
    if (assignment.test(content)) {
      violations.push(`${label}: docker staging env file must not include live provider secret ${forbiddenEnvKey}`);
    }
  }
}

function validateForbiddenBundleFragments(bundle, label) {
  const serialized = JSON.stringify(bundle);
  for (const fragment of forbiddenBundleFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${label}: bundle summary must not include sensitive fragment ${fragment}`);
    }
  }
}

function validateArtifactSummaries(artifacts, label) {
  if (!Array.isArray(artifacts)) {
    violations.push(`${label}: artifacts must be an array`);
    return;
  }
  const observed = new Map();
  for (const artifact of artifacts) {
    if (!isRecord(artifact)) {
      violations.push(`${label}: every artifact summary must be an object`);
      continue;
    }
    if (observed.has(artifact.artifactId)) {
      violations.push(`${label}: duplicate artifact ${artifact.artifactId}`);
    }
    observed.set(artifact.artifactId, artifact);
    validateArtifactSummary(artifact, label);
  }
  for (const artifactId of expectedArtifactIds.keys()) {
    if (!observed.has(artifactId)) {
      violations.push(`${label}: missing artifact ${artifactId}`);
    }
  }
}

function validateArtifactSummary(summary, label) {
  const definition = expectedArtifactIds.get(summary.artifactId);
  if (definition === undefined) {
    violations.push(`${label}: unsupported artifact ${String(summary.artifactId)}`);
    return;
  }
  validateArtifactPath(summary.path, `${label}: ${summary.artifactId}.path`, { allowWorkspace: false });
  if (!fileExists(summary.path)) {
    violations.push(`${label}: ${summary.artifactId}.path must exist`);
    return;
  }
  validatePrivateFileMode(summary.path, `${label}: ${summary.artifactId}.path`);
  const artifact = readJson(summary.path);
  const actualFormat = artifact.format ?? artifact.artifactFormat;
  if (summary.format !== actualFormat) {
    violations.push(`${label}: ${summary.artifactId}.format must match artifact file format`);
  }
  if (summary.format !== definition.format) {
    violations.push(`${label}: ${summary.artifactId}.format must be ${definition.format}`);
  }
  if (artifact.artifactId !== undefined && definition.expectedArtifactId !== undefined && artifact.artifactId !== definition.expectedArtifactId) {
    violations.push(`${label}: ${summary.artifactId}.artifactId must match ${definition.expectedArtifactId}`);
  }
  validateCounts(summary, artifact, definition, label);
  validateArtifactRedaction(artifact, `${label}: ${summary.artifactId}`);
  if (summary.artifactId === 'durable-runtime-selector') {
    validateDurableRuntimeArtifact(artifact, label);
  }
}

function validatePrivateFileMode(path, label) {
  if (!fileExists(path)) {
    return;
  }
  const mode = statSync(path).mode & 0o077;
  if (mode !== 0) {
    violations.push(`${label}: evidence file must use 0600-style permissions`);
  }
}

function validateCounts(summary, artifact, definition, label) {
  const signalResults = Array.isArray(artifact.signalResults) ? artifact.signalResults : [];
  const operations = Array.isArray(artifact.operations) ? artifact.operations : [];
  const surfaces = Array.isArray(artifact.surfaces) ? artifact.surfaces : [];
  const sourceExports = Array.isArray(artifact.sourceExports) ? artifact.sourceExports : [];
  const smokeResults = Array.isArray(artifact.smokeResults) ? artifact.smokeResults : [];
  const countPairs = [
    ['signalCount', signalResults.length, definition.minSignalCount ?? 0],
    ['operationCount', operations.length, definition.minOperationCount ?? 0],
    ['surfaceCount', surfaces.length, definition.minSurfaceCount ?? 0],
    ['sourceExportCount', sourceExports.length, definition.minSourceExportCount ?? 0],
    ['smokeCount', smokeResults.length, definition.minSmokeCount ?? 0],
  ];

  for (const [field, actualCount, minimum] of countPairs) {
    if (summary[field] !== actualCount) {
      violations.push(`${label}: ${summary.artifactId}.${field} must match artifact file`);
    }
    if (actualCount < minimum) {
      violations.push(`${label}: ${summary.artifactId}.${field} must be at least ${minimum}`);
    }
  }
}

function validateArtifactRedaction(artifact, label) {
  if (!isRecord(artifact.redaction)) {
    return;
  }
  for (const [field, value] of Object.entries(artifact.redaction)) {
    if (field.endsWith('Included') && value !== false) {
      violations.push(`${label}: redaction.${field} must be false`);
    }
  }
}

function validateDurableRuntimeArtifact(artifact, label) {
  const services = new Set((artifact.services ?? []).map((service) => service.serviceId));
  for (const serviceId of ['api-gateway', 'ingestion-worker', 'intelligence-worker', 'delivery-service', 'event-relay']) {
    if (!services.has(serviceId)) {
      violations.push(`${label}: durable-runtime-selector missing service ${serviceId}`);
    }
  }
  if (artifact.rollup?.allServicesDurable !== true) {
    violations.push(`${label}: durable-runtime-selector rollup.allServicesDurable must be true`);
  }
  if (artifact.rollup?.forbiddenSelectorsFound !== false) {
    violations.push(`${label}: durable-runtime-selector rollup.forbiddenSelectorsFound must be false`);
  }
}

function buildSyntheticBundle(tempDirectory) {
  const artifactPaths = new Map();
  const now = '2026-06-18T00:00:00.000Z';
  for (const [artifactId, definition] of expectedArtifactIds) {
    const artifactPath = join(tempDirectory, `${artifactId}.json`);
    artifactPaths.set(artifactId, artifactPath);
    writeFileSync(artifactPath, `${JSON.stringify(syntheticArtifact(artifactId, definition, now), null, 2)}\n`, { mode: 0o600 });
  }

  const envFilePath = join(tempDirectory, 'backend-staging-evidence.env');
  const bundlePath = join(tempDirectory, 'backend-staging-evidence-bundle.json');
  writeEvidenceEnvFile(envFilePath, requiredEnvKeys.map((envKey) => [envKey, syntheticEnvValue(envKey, bundlePath, envFilePath, artifactPaths)]));

  const document = {
    schemaVersion: 1,
    format: expectedBundleFormat,
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    environmentId: 'docker-self-test',
    imageDigest: `sha256:${'1'.repeat(64)}`,
    commitSha: '1'.repeat(40),
    apiBaseUrl: 'http://127.0.0.1:3100',
    operator: 'backend-ops-self-test',
    envFilePath,
    generatedAt: now,
    provenance: {
      evidenceKind: 'docker_staging_bundle',
      collectionMethod: 'Isolated Docker Compose backend evidence bundle capture.',
      runner: captureScriptPath,
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      databaseUrlsIncluded: false,
      brokerUrlsIncluded: false,
    },
    artifacts: [...expectedArtifactIds.keys()].map((artifactId) => artifactSummary(artifactId, artifactPaths.get(artifactId))),
  };
  writeFileSync(bundlePath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  return { path: bundlePath, document };
}

function syntheticArtifact(artifactId, definition, observedAt) {
  const base = {
    schemaVersion: 1,
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    provenance: {
      evidenceKind: 'docker_self_test',
      collectionMethod: 'Synthetic self-test artifact for bundle validator.',
      runner: 'scripts/check-docker-backend-staging-evidence-bundle.mjs',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      databaseUrlsIncluded: false,
      brokerUrlsIncluded: false,
    },
  };
  if (artifactId === 'durable-runtime-selector') {
    return {
      ...base,
      artifactFormat: definition.format,
      environment: {
        environmentId: 'docker-self-test',
        imageDigest: `sha256:${'1'.repeat(64)}`,
        apiBaseUrl: 'http://127.0.0.1:3100',
        sampledAt: observedAt,
        operator: 'backend-ops-self-test',
      },
      services: ['api-gateway', 'ingestion-worker', 'intelligence-worker', 'delivery-service', 'event-relay'].map((serviceId) => ({
        serviceId,
        runtimeProfile: 'beta',
        forbiddenSelectorValuesFound: [],
      })),
      rollup: {
        allServicesDurable: true,
        forbiddenSelectorsFound: false,
        runtimeProfile: 'beta',
      },
    };
  }
  if (artifactId === 'source-credential-rotation' || artifactId === 'webhook-secret-rotation') {
    return {
      ...base,
      artifactFormat: definition.format,
      operations: [
        {
          operationId: `${artifactId}-self-test`,
          status: 'passed',
          observedAt,
        },
      ],
    };
  }
  if (artifactId === 'security-final-sweep') {
    return {
      ...base,
      artifactFormat: definition.format,
      surfaces: ['logs', 'metrics', 'public-errors', 'audit-metadata'].map((surfaceId) => ({
        surfaceId,
        sampleCount: 1,
        scanStatus: 'passed',
        redactedOnly: true,
      })),
      sourceExports: ['logs', 'metrics', 'public-errors'].map((surfaceId) => ({
        surfaceId,
        path: `/tmp/${surfaceId}.json`,
        redactedOnly: true,
        sanitized: true,
      })),
    };
  }
  if (artifactId === 'release-deploy-smoke') {
    return {
      ...base,
      format: definition.format,
      artifactId,
      smokeResults: ['api-health', 'openapi-contract', 'migration-version', 'worker-pause-resume'].map((smokeId) => ({
        smokeId,
        status: 'passed',
        observedAt,
      })),
    };
  }
  return {
    ...base,
    format: definition.format,
    artifactId,
    signalResults: [
      {
        signalId: `${artifactId}-self-test`,
        status: 'passed',
        observedAt,
        evidence: {
          summary: 'redacted self-test evidence',
        },
      },
    ],
  };
}

function artifactSummary(artifactId, path) {
  const artifact = readJson(path);
  const signalResults = Array.isArray(artifact.signalResults) ? artifact.signalResults : [];
  const operations = Array.isArray(artifact.operations) ? artifact.operations : [];
  const surfaces = Array.isArray(artifact.surfaces) ? artifact.surfaces : [];
  const sourceExports = Array.isArray(artifact.sourceExports) ? artifact.sourceExports : [];
  const smokeResults = Array.isArray(artifact.smokeResults) ? artifact.smokeResults : [];

  return {
    artifactId,
    path,
    format: artifact.format ?? artifact.artifactFormat,
    signalIds: signalResults.map((signal) => signal.signalId).filter(nonEmptyString),
    signalCount: signalResults.length,
    operationIds: operations.map((operation) => operation.operationId).filter(nonEmptyString),
    operationCount: operations.length,
    surfaceIds: surfaces.map((surface) => surface.surfaceId).filter(nonEmptyString),
    surfaceCount: surfaces.length,
    sourceExportCount: sourceExports.length,
    smokeIds: smokeResults.map((smoke) => smoke.smokeId).filter(nonEmptyString),
    smokeCount: smokeResults.length,
  };
}

function syntheticEnvValue(envKey, bundlePath, envFilePath, artifactPaths) {
  const artifactEntry = [...expectedArtifactIds.entries()].find(([, definition]) => definition.env === envKey);
  if (artifactEntry !== undefined) {
    return artifactPaths.get(artifactEntry[0]);
  }
  const values = {
    API_BASE_URL: 'http://127.0.0.1:3100',
    BACKEND_IMAGE_DIGEST: `sha256:${'1'.repeat(64)}`,
    BACKEND_GIT_COMMIT_SHA: '1'.repeat(40),
    DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/social_monitor',
    RABBITMQ_URL: 'amqp://user:password@127.0.0.1:5672',
    RABBITMQ_MANAGEMENT_URL: 'http://127.0.0.1:15672',
    STAGING_ENVIRONMENT_ID: 'docker-self-test',
    STAGING_OPERATOR: 'backend-ops-self-test',
    STAGING_SECRET_STORE_ID: 'docker-self-test-secret-store',
    LOG_EXPORT_PATH: join(resolve(envFilePath, '..'), 'logs.json'),
    METRICS_EXPORT_PATH: join(resolve(envFilePath, '..'), 'metrics.json'),
    PUBLIC_ERROR_EXPORT_PATH: join(resolve(envFilePath, '..'), 'public-errors.json'),
    BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
  };
  return values[envKey] ?? `missing-${envKey}`;
}

function expectInvalid(document, tempDirectory, expectedMessages) {
  const beforeCount = violations.length;
  const path = join(tempDirectory, 'invalid-bundle.json');
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  validateBundleDocument(document, 'invalid self-test bundle', { realMode: false });
  const newViolations = violations.slice(beforeCount);
  for (const expected of expectedMessages) {
    if (!newViolations.some((violation) => violation.includes(expected))) {
      violations.push(`self-test negative case must reject ${expected}`);
    }
  }
  violations.length = beforeCount;
}

function validateArtifactPath(path, label, options) {
  if (!nonEmptyString(path)) {
    violations.push(`${label}: path must be a non-empty string`);
    return;
  }
  if (!isAbsolute(path)) {
    violations.push(`${label}: path must be absolute`);
  }
  if (!path.endsWith('.json')) {
    violations.push(`${label}: path must end with .json`);
  }
  if (isFixtureLikePath(path)) {
    violations.push(`${label}: path must not point to fixture or example paths`);
  }
  if (options.allowWorkspace !== true && isInsideWorkspace(path)) {
    violations.push(`${label}: path must not be inside the git workspace`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function currentGitCommitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function fileExists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function validateTimestamp(value, label) {
  if (!nonEmptyString(value) || Number.isNaN(Date.parse(value))) {
    violations.push(`${label} must be an ISO timestamp`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isInsideWorkspace(path) {
  const workspace = resolve(process.cwd());
  const relativePath = relative(workspace, resolve(path));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isFixtureLikePath(path) {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  return normalized.includes('/fixtures/')
    || normalized.includes('.example.')
    || normalized.includes('-examples')
    || normalized.includes('_examples');
}
