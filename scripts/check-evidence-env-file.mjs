import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  shellQuote,
  readPrivateEvidenceEnvEntries,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const tempDirectory = mkdtempSync(join(tmpdir(), 'evidence-env-file-'));
const violations = [];

try {
  validatePositiveWrite();
  validatePositiveJsonPath();
  validateWorkspacePathRejected();
  validateWorkspaceJsonPathRejected();
  validateFixturePathRejected();
  validateFixtureJsonPathRejected();
  validateRelativeJsonPathRejected();
  validatePrivateEnvRead();
  validateCurrentEvidencePackage();
  validateCurrentEvidencePackageRejectsStaleCommit();
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Evidence env file writer OK');

function validatePositiveWrite() {
  const envFilePath = join(tempDirectory, 'external-beta.env');
  writeEvidenceEnvFile(envFilePath, [
    ['API_BASE_URL', 'https://api.staging.social-monitor.invalid'],
    ['SINGLE_QUOTE_VALUE', "owner's-review"],
    ['EMPTY_VALUE_SKIPPED', ''],
  ], {
    usageLines: ['source in an operator shell only'],
  });

  const content = readFileSync(envFilePath, 'utf8');
  if (!content.includes("API_BASE_URL='https://api.staging.social-monitor.invalid'")) {
    violations.push('evidence env file must shell-quote simple values');
  }
  if (!content.includes(`SINGLE_QUOTE_VALUE=${shellQuote("owner's-review")}`)) {
    violations.push('evidence env file must escape single quotes safely');
  }
  if (content.includes('EMPTY_VALUE_SKIPPED=')) {
    violations.push('evidence env file must skip empty values');
  }
  if ((statSync(envFilePath).mode & 0o077) !== 0) {
    violations.push('evidence env file must be written with 0600-style permissions');
  }
}

function validateWorkspacePathRejected() {
  assertRejected(
    () => validateEvidenceEnvFilePath(`${process.cwd()}/workspace-output.env`),
    'workspace path',
    'must not be inside the git workspace',
  );
}

function validatePositiveJsonPath() {
  const jsonPath = join(tempDirectory, 'release-evidence.json');
  const resolved = validateEvidenceJsonFilePath(jsonPath, 'RELEASE_EVIDENCE_PATH');
  if (resolved !== jsonPath) {
    violations.push('evidence JSON path helper must return the resolved JSON path');
  }
}

function validateWorkspaceJsonPathRejected() {
  assertRejected(
    () => validateEvidenceJsonFilePath(`${process.cwd()}/workspace-output.json`, 'RELEASE_EVIDENCE_PATH'),
    'workspace JSON path',
    'must not write release evidence into the git workspace',
  );
}

function validateFixturePathRejected() {
  assertRejected(
    () => validateEvidenceEnvFilePath(join(tempDirectory, 'fixtures', 'output.env')),
    'fixture path',
    'must not point to fixture or example paths',
  );
}

function validateFixtureJsonPathRejected() {
  assertRejected(
    () => validateEvidenceJsonFilePath(join(tempDirectory, 'fixtures', 'output.json'), 'RELEASE_EVIDENCE_PATH'),
    'fixture JSON path',
    'must not point to fixture or example paths',
  );
}

function validateRelativeJsonPathRejected() {
  assertRejected(
    () => validateEvidenceJsonFilePath('relative-output.json', 'RELEASE_EVIDENCE_PATH'),
    'relative JSON path',
    'must be an absolute JSON file path',
  );
}

function validatePrivateEnvRead() {
  const envFilePath = join(tempDirectory, 'read-private.env');
  writeEvidenceEnvFile(envFilePath, [
    ['API_BASE_URL', 'https://api.staging.social-monitor.invalid'],
    ['EMPTY_VALUE_SKIPPED', ''],
  ]);
  const entries = new Map(readPrivateEvidenceEnvEntries(envFilePath, 'read private env fixture'));
  if (entries.get('API_BASE_URL') !== 'https://api.staging.social-monitor.invalid') {
    violations.push('private evidence env reader must parse generated env files');
  }
  if (entries.has('EMPTY_VALUE_SKIPPED')) {
    violations.push('private evidence env reader must skip empty env values');
  }

  chmodSync(envFilePath, 0o644);
  assertRejected(
    () => readPrivateEvidenceEnvEntries(envFilePath, 'public env fixture'),
    'public env fixture',
    'must use 0600-style private file permissions',
  );
}

function validateCurrentEvidencePackage() {
  const dockerEnvPath = join(tempDirectory, 'docker-import.env');
  const liveOpenEnvPath = join(tempDirectory, 'live-open.env');
  const outputEnvPath = join(tempDirectory, 'current-package.env');
  const outputReportPath = join(tempDirectory, 'current-package-report.json');
  const artifactPath = (name) => {
    const path = join(tempDirectory, `${name}.json`);
    writeFileSync(path, '{}\n', { mode: 0o600 });
    chmodSync(path, 0o600);
    return path;
  };
  const commitSha = 'a'.repeat(40);
  const imageDigest = `sha256:${'b'.repeat(64)}`;

  writeEvidenceEnvFile(dockerEnvPath, [
    ['API_BASE_URL', 'http://127.0.0.1:4000'],
    ['BACKEND_GIT_COMMIT_SHA', commitSha],
    ['BACKEND_IMAGE_DIGEST', imageDigest],
    ['DATABASE_URL', 'postgresql://credential-user:...@db.internal/social_monitor'],
    ['RABBITMQ_URL', 'amqp://credential-user:...@rabbit.internal'],
    ['STAGING_ENVIRONMENT_ID', 'dogfood-package-20260621'],
    ['STAGING_OPERATOR', 'codex'],
    ['STAGING_SECRET_STORE_ID', 'dogfood-secret-store-20260621'],
    ['DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH', artifactPath('durable-runtime-selector')],
    ['RABBITMQ_STAGING_DRILL_ARTIFACT_PATH', artifactPath('rabbitmq-staging-drill')],
    ['POSTGRES_RESTORE_DRILL_ARTIFACT_PATH', artifactPath('postgres-restore-drill')],
    ['DURABLE_BACKEND_E2E_ARTIFACT_PATH', artifactPath('durable-backend-e2e')],
    ['SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH', artifactPath('source-credential-rotation')],
    ['WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH', artifactPath('webhook-secret-rotation')],
    ['SECURITY_FINAL_SWEEP_ARTIFACT_PATH', artifactPath('security-final-sweep')],
    ['LOG_EXPORT_PATH', artifactPath('security-logs-export')],
    ['METRICS_EXPORT_PATH', artifactPath('security-metrics-export')],
    ['PUBLIC_ERROR_EXPORT_PATH', artifactPath('security-public-errors-export')],
    ['RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH', artifactPath('release-deploy-smoke')],
    ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH', artifactPath('backend-staging-evidence-bundle')],
  ]);
  writeEvidenceEnvFile(liveOpenEnvPath, [
    ['LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', artifactPath('live-open-connectors')],
    ['SOURCE_LIVE_ENVIRONMENT_ID', 'dogfood-public-network-20260621'],
    ['SOURCE_LIVE_OPERATOR', 'codex'],
    ['BACKEND_GIT_COMMIT_SHA', commitSha],
    ['BACKEND_IMAGE_DIGEST', imageDigest],
  ]);

  const output = execFileSync('node', ['scripts/package-current-external-beta-evidence.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCKER_BACKEND_STAGING_IMPORTED_ENV_PATH: dockerEnvPath,
      LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH: liveOpenEnvPath,
      EXTERNAL_BETA_CURRENT_ENV_PATH: outputEnvPath,
      EXTERNAL_BETA_CURRENT_REPORT_PATH: outputReportPath,
      EXTERNAL_BETA_CURRENT_PACKAGE_EXPECTED_COMMIT_SHA: commitSha,
    },
  });

  if (!output.includes('EXTERNAL_BETA_CURRENT_ENV_PATH=')) {
    violations.push('current evidence package script must print env handoff path');
  }
  const packagedEnv = readFileSync(outputEnvPath, 'utf8');
  if (!packagedEnv.includes('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH=')) {
    violations.push('current evidence package must merge live-open evidence env');
  }
  if (packagedEnv.includes('DATABASE_URL=') || packagedEnv.includes('RABBITMQ_URL=')) {
    violations.push('current evidence package must not write secret DB/RabbitMQ URL values');
  }
  const report = JSON.parse(readFileSync(outputReportPath, 'utf8'));
  if (report.artifactFormat !== 'external-beta-current-evidence-package-v1') {
    violations.push('current evidence package report must use the expected artifact format');
  }
  if (report.inputPolicy?.secretValuesIncluded !== false) {
    violations.push('current evidence package report must state that secret values are excluded');
  }
  if (report.commitPolicy?.expectedCommitSha !== commitSha || report.commitPolicy?.packagedCommitSha !== commitSha) {
    violations.push('current evidence package report must expose the expected and packaged commit SHA');
  }
  if (!Array.isArray(report.artifactIntegrity?.inputEnvFiles) || report.artifactIntegrity.inputEnvFiles.length !== 2) {
    violations.push('current evidence package report must include input env file integrity records');
  }
  if (!Array.isArray(report.artifactIntegrity?.packagedEvidenceArtifacts) || report.artifactIntegrity.packagedEvidenceArtifacts.length === 0) {
    violations.push('current evidence package report must include packaged evidence artifact integrity records');
  }
  const digestPattern = /^[0-9a-f]{64}$/;
  for (const record of [
    ...(report.artifactIntegrity?.inputEnvFiles ?? []),
    ...(report.artifactIntegrity?.packagedEvidenceArtifacts ?? []),
  ]) {
    if (!digestPattern.test(String(record.sha256 ?? '')) || !Number.isInteger(record.sizeBytes) || record.sizeBytes <= 0) {
      violations.push('current evidence package integrity records must include sha256 and positive sizeBytes');
      break;
    }
  }
  const artifactIntegrityEnvNames = new Set(
    (report.artifactIntegrity?.packagedEvidenceArtifacts ?? []).map((record) => record.envName),
  );
  if (!artifactIntegrityEnvNames.has('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH')) {
    violations.push('current evidence package report must hash live-open evidence artifact');
  }
  if (!report.inputPolicy?.secretEnvNamesWithheld?.includes('DATABASE_URL')) {
    violations.push('current evidence package report must list withheld DATABASE_URL');
  }
  if (!Array.isArray(report.remaining?.requiredEnv)) {
    violations.push('current evidence package report must include remaining required env names');
  }
}

function validateCurrentEvidencePackageRejectsStaleCommit() {
  const dockerEnvPath = join(tempDirectory, 'stale-docker-import.env');
  const outputEnvPath = join(tempDirectory, 'stale-current-package.env');
  const outputReportPath = join(tempDirectory, 'stale-current-package-report.json');
  const staleCommitSha = 'c'.repeat(40);
  const expectedCommitSha = 'd'.repeat(40);

  writeEvidenceEnvFile(dockerEnvPath, [
    ['BACKEND_GIT_COMMIT_SHA', staleCommitSha],
  ]);

  assertRejected(
    () => execFileSync('node', ['scripts/package-current-external-beta-evidence.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DOCKER_BACKEND_STAGING_IMPORTED_ENV_PATH: dockerEnvPath,
        LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH: join(tempDirectory, 'missing-live-open.env'),
        EXTERNAL_BETA_CURRENT_ENV_PATH: outputEnvPath,
        EXTERNAL_BETA_CURRENT_REPORT_PATH: outputReportPath,
        EXTERNAL_BETA_CURRENT_PACKAGE_EXPECTED_COMMIT_SHA: expectedCommitSha,
      },
    }),
    'stale current evidence package commit',
    'stale BACKEND_GIT_COMMIT_SHA',
  );
}

function assertRejected(fn, label, expectedMessage) {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      violations.push(`expected ${label} rejection to include "${expectedMessage}"`);
    }
    return;
  }

  violations.push(`expected ${label} to be rejected`);
}
