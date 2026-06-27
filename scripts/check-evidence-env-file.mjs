import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
  validateCurrentEvidencePackageSkipsStaleDefaultEvidence();
  validateCurrentEvidencePackageRejectsEmptyInputs();
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
  const githubRepoRadarEnvPath = join(tempDirectory, 'live-github-repo-radar.env');
  const githubTrendingPageEnvPath = join(tempDirectory, 'live-github-trending-page.env');
  const relevanceMemoryEnvPath = join(tempDirectory, 'relevance-memory-runtime-canary.env');
  const securityFinalSweepEnvPath = join(tempDirectory, 'security-final-sweep.env');
  const redditEnvPath = join(tempDirectory, 'live-reddit-oauth.env');
  const summaryFeedbackEnvPath = join(tempDirectory, 'summary-feedback-samples.env');
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
  const securityFinalSweepArtifactPath = artifactPath('security-final-sweep');
  const securityLogsExportPath = artifactPath('security-logs-export');
  const securityMetricsExportPath = artifactPath('security-metrics-export');
  const securityPublicErrorsExportPath = artifactPath('security-public-errors-export');

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
    ['SECURITY_FINAL_SWEEP_ARTIFACT_PATH', securityFinalSweepArtifactPath],
    ['LOG_EXPORT_PATH', securityLogsExportPath],
    ['METRICS_EXPORT_PATH', securityMetricsExportPath],
    ['PUBLIC_ERROR_EXPORT_PATH', securityPublicErrorsExportPath],
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
  writeEvidenceEnvFile(githubRepoRadarEnvPath, [
    ['GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH', artifactPath('github-repo-radar-live')],
    ['GITHUB_REPO_RADAR_PRISMA_LIVE_E2E', '1'],
    ['GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID', 'social-monitor-prod-bq'],
    ['SOURCE_LIVE_ENVIRONMENT_ID', 'dogfood-public-network-20260621'],
    ['SOURCE_LIVE_OPERATOR', 'codex'],
    ['BACKEND_GIT_COMMIT_SHA', commitSha],
    ['BACKEND_IMAGE_DIGEST', imageDigest],
  ]);
  writeEvidenceEnvFile(githubTrendingPageEnvPath, [
    ['GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH', artifactPath('github-trending-page-live')],
    ['SOURCE_LIVE_ENVIRONMENT_ID', 'dogfood-public-network-20260621'],
    ['SOURCE_LIVE_OPERATOR', 'codex'],
    ['BACKEND_GIT_COMMIT_SHA', commitSha],
    ['BACKEND_IMAGE_DIGEST', imageDigest],
  ]);
  writeEvidenceEnvFile(relevanceMemoryEnvPath, [
    ['BACKEND_GIT_COMMIT_SHA', commitSha],
    ['DATABASE_URL', 'postgresql://credential-user:...@db.internal/social_monitor'],
    ['INFINITY_CONTEXT_TOKEN', 'memo-stack-token-value-1234567890'],
    ['INFINITY_CONTEXT_URL', 'https://memory.staging.social-monitor.invalid'],
    ['RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH', artifactPath('relevance-memory-runtime-canary')],
    ['RELEVANCE_MEMORY_RUNTIME_CANARY_PERSISTENCE', 'prisma'],
  ]);
  writeEvidenceEnvFile(securityFinalSweepEnvPath, [
    ['SECURITY_FINAL_SWEEP_ARTIFACT_PATH', securityFinalSweepArtifactPath],
    ['LOG_EXPORT_PATH', securityLogsExportPath],
    ['METRICS_EXPORT_PATH', securityMetricsExportPath],
    ['PUBLIC_ERROR_EXPORT_PATH', securityPublicErrorsExportPath],
    ['BACKEND_GIT_COMMIT_SHA', commitSha],
  ]);
  writeEvidenceEnvFile(summaryFeedbackEnvPath, [
    ['SUMMARY_REAL_FEEDBACK_SAMPLES_PATH', artifactPath('summary-real-feedback-samples')],
    ['BACKEND_GIT_COMMIT_SHA', commitSha],
  ]);

  const output = execFileSync('node', ['scripts/package-current-external-beta-evidence.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCKER_BACKEND_STAGING_IMPORTED_ENV_PATH: dockerEnvPath,
      LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH: liveOpenEnvPath,
      GITHUB_REPO_RADAR_LIVE_EVIDENCE_ENV_PATH: githubRepoRadarEnvPath,
      GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_ENV_PATH: githubTrendingPageEnvPath,
      RELEVANCE_MEMORY_RUNTIME_CANARY_ENV_PATH: relevanceMemoryEnvPath,
      SECURITY_FINAL_SWEEP_ENV_PATH: securityFinalSweepEnvPath,
      REDDIT_LIVE_EVIDENCE_ENV_PATH: redditEnvPath,
      SUMMARY_FEEDBACK_SAMPLES_ENV_PATH: summaryFeedbackEnvPath,
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
  if (!packagedEnv.includes('GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH=')) {
    violations.push('current evidence package must merge GitHub Repo Radar evidence env');
  }
  if (!packagedEnv.includes('GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH=')) {
    violations.push('current evidence package must merge GitHub Trending Page evidence env');
  }
  if (!packagedEnv.includes('RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH=')) {
    violations.push('current evidence package must merge relevance memory canary evidence env');
  }
  if (!packagedEnv.includes('RELEVANCE_MEMORY_RUNTIME_CANARY_PERSISTENCE=')) {
    violations.push('current evidence package must merge relevance memory canary persistence mode');
  }
  if (!packagedEnv.includes('SECURITY_FINAL_SWEEP_ARTIFACT_PATH=')) {
    violations.push('current evidence package must merge security final sweep evidence env');
  }
  if (!packagedEnv.includes('SUMMARY_REAL_FEEDBACK_SAMPLES_PATH=')) {
    violations.push('current evidence package must merge summary feedback sample evidence env');
  }
  if (packagedEnv.includes('DATABASE_URL=') || packagedEnv.includes('RABBITMQ_URL=') || packagedEnv.includes('INFINITY_CONTEXT_TOKEN=')) {
    violations.push('current evidence package must not write secret DB/RabbitMQ/memo token values');
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
  if (!Array.isArray(report.artifactIntegrity?.inputEnvFiles) || report.artifactIntegrity.inputEnvFiles.length !== 7) {
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
  if (!artifactIntegrityEnvNames.has('GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH')) {
    violations.push('current evidence package report must hash GitHub Repo Radar evidence artifact');
  }
  if (!artifactIntegrityEnvNames.has('GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH')) {
    violations.push('current evidence package report must hash GitHub Trending Page evidence artifact');
  }
  if (!artifactIntegrityEnvNames.has('RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH')) {
    violations.push('current evidence package report must hash relevance memory canary evidence artifact');
  }
  if (!artifactIntegrityEnvNames.has('SECURITY_FINAL_SWEEP_ARTIFACT_PATH')) {
    violations.push('current evidence package report must hash security final sweep evidence artifact');
  }
  if (!artifactIntegrityEnvNames.has('SUMMARY_REAL_FEEDBACK_SAMPLES_PATH')) {
    violations.push('current evidence package report must hash summary feedback sample evidence artifact');
  }
  if (!report.inputPolicy?.secretEnvNamesWithheld?.includes('DATABASE_URL')) {
    violations.push('current evidence package report must list withheld DATABASE_URL');
  }
  if (!report.inputPolicy?.secretEnvNamesWithheld?.includes('INFINITY_CONTEXT_TOKEN')) {
    violations.push('current evidence package report must list withheld INFINITY_CONTEXT_TOKEN');
  }
  if (!Array.isArray(report.remaining?.requiredEnv)) {
    violations.push('current evidence package report must include remaining required env names');
  }
  if (!Number.isInteger(report.readiness?.activeExternalEvidenceBlockerJobCount)) {
    violations.push('current evidence package report must include active external evidence blocker count');
  }
  if (!Array.isArray(report.remaining?.activeBlockerJobs)) {
    violations.push('current evidence package report must include active blocker jobs');
  }
  const requiredAlternativeGroups = report.remaining?.requiredAlternativeGroups ?? [];
  if (!Array.isArray(requiredAlternativeGroups)) {
    violations.push('current evidence package report must include remaining required alternative groups');
  } else {
    const redditRefreshAlternative = requiredAlternativeGroups.find((group) => (
      group.jobId === 'live-reddit-oauth'
      && group.label === 'reddit_refresh_token_flow'
    ));
    if (redditRefreshAlternative === undefined) {
      violations.push('current evidence package report must expose Reddit refresh-token alternative when Reddit evidence is missing');
    } else if (!redditRefreshAlternative.missingEnv?.includes('REDDIT_REFRESH_TOKEN')) {
      violations.push('current evidence package report must mark missing Reddit refresh token in the refresh-token alternative');
    }
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
        REDDIT_LIVE_EVIDENCE_ENV_PATH: join(tempDirectory, 'missing-live-reddit.env'),
        EXTERNAL_BETA_CURRENT_ENV_PATH: outputEnvPath,
        EXTERNAL_BETA_CURRENT_REPORT_PATH: outputReportPath,
        EXTERNAL_BETA_CURRENT_PACKAGE_EXPECTED_COMMIT_SHA: expectedCommitSha,
      },
    }),
    'stale current evidence package commit',
    'stale BACKEND_GIT_COMMIT_SHA',
  );
}

function validateCurrentEvidencePackageSkipsStaleDefaultEvidence() {
  const artifactDir = join(tempDirectory, 'stale-default-package');
  mkdirSync(artifactDir, { recursive: true });
  const dockerEnvPath = join(artifactDir, 'docker-import.env');
  const outputEnvPath = join(artifactDir, 'current-package.env');
  const outputReportPath = join(artifactDir, 'current-package-report.json');
  const liveOpenDefaultEnvPath = join(artifactDir, 'live-open-connectors.env');
  const githubRepoRadarDefaultEnvPath = join(artifactDir, 'live-github-repo-radar.env');
  const githubTrendingPageDefaultEnvPath = join(artifactDir, 'live-github-trending-page.env');
  const relevanceMemoryDefaultEnvPath = join(artifactDir, 'relevance-memory-runtime-canary.env');
  const securityFinalSweepDefaultEnvPath = join(artifactDir, 'security-final-sweep.env');
  const redditDefaultEnvPath = join(artifactDir, 'live-reddit-oauth.env');
  const summaryFeedbackDefaultEnvPath = join(artifactDir, 'summary-feedback-samples.env');
  const artifactPath = (name) => {
    const path = join(artifactDir, `${name}.json`);
    writeFileSync(path, '{}\n', { mode: 0o600 });
    chmodSync(path, 0o600);
    return path;
  };
  const commitSha = 'e'.repeat(40);
  const staleCommitSha = 'f'.repeat(40);
  const imageDigest = `sha256:${'b'.repeat(64)}`;
  const staleImageDigest = `sha256:${'c'.repeat(64)}`;

  writeEvidenceEnvFile(dockerEnvPath, [
    ['BACKEND_GIT_COMMIT_SHA', commitSha],
    ['BACKEND_IMAGE_DIGEST', imageDigest],
    ['DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH', artifactPath('durable-runtime-selector-current')],
  ]);
  writeEvidenceEnvFile(liveOpenDefaultEnvPath, [
    ['LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', artifactPath('live-open-connectors-stale')],
    ['BACKEND_GIT_COMMIT_SHA', staleCommitSha],
    ['BACKEND_IMAGE_DIGEST', staleImageDigest],
  ]);
  writeEvidenceEnvFile(githubRepoRadarDefaultEnvPath, [
    ['GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH', artifactPath('github-repo-radar-stale')],
    ['BACKEND_GIT_COMMIT_SHA', staleCommitSha],
    ['BACKEND_IMAGE_DIGEST', staleImageDigest],
  ]);
  writeEvidenceEnvFile(githubTrendingPageDefaultEnvPath, [
    ['GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH', artifactPath('github-trending-page-stale')],
    ['BACKEND_GIT_COMMIT_SHA', staleCommitSha],
    ['BACKEND_IMAGE_DIGEST', staleImageDigest],
  ]);
  writeEvidenceEnvFile(relevanceMemoryDefaultEnvPath, [
    ['RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH', artifactPath('relevance-memory-stale')],
    ['BACKEND_GIT_COMMIT_SHA', staleCommitSha],
    ['INFINITY_CONTEXT_URL', 'https://memory.staging.social-monitor.invalid'],
  ]);
  writeEvidenceEnvFile(securityFinalSweepDefaultEnvPath, [
    ['SECURITY_FINAL_SWEEP_ARTIFACT_PATH', artifactPath('security-final-sweep-stale')],
    ['BACKEND_GIT_COMMIT_SHA', staleCommitSha],
  ]);
  writeEvidenceEnvFile(redditDefaultEnvPath, [
    ['REDDIT_LIVE_EVIDENCE_PATH', artifactPath('reddit-live-stale')],
    ['BACKEND_GIT_COMMIT_SHA', staleCommitSha],
    ['BACKEND_IMAGE_DIGEST', staleImageDigest],
  ]);
  writeEvidenceEnvFile(summaryFeedbackDefaultEnvPath, [
    ['SUMMARY_REAL_FEEDBACK_SAMPLES_PATH', artifactPath('summary-feedback-stale')],
    ['BACKEND_GIT_COMMIT_SHA', staleCommitSha],
  ]);

  execFileSync('node', ['scripts/package-current-external-beta-evidence.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCKER_BACKEND_STAGING_IMPORTED_ENV_PATH: dockerEnvPath,
      LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH: '',
      GITHUB_REPO_RADAR_LIVE_EVIDENCE_ENV_PATH: '',
      GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_ENV_PATH: '',
      GITHUB_LIVE_SUMMARY_EVIDENCE_ENV_PATH: '',
      RELEVANCE_MEMORY_RUNTIME_CANARY_ENV_PATH: '',
      SECURITY_FINAL_SWEEP_ENV_PATH: '',
      REDDIT_LIVE_EVIDENCE_ENV_PATH: '',
      SUMMARY_FEEDBACK_SAMPLES_ENV_PATH: '',
      EXTERNAL_BETA_ADDITIONAL_ENV_PATHS: '',
      EXTERNAL_BETA_CURRENT_PACKAGE_ARTIFACT_DIR: artifactDir,
      EXTERNAL_BETA_CURRENT_ENV_PATH: outputEnvPath,
      EXTERNAL_BETA_CURRENT_REPORT_PATH: outputReportPath,
      EXTERNAL_BETA_CURRENT_PACKAGE_EXPECTED_COMMIT_SHA: commitSha,
    },
  });

  const packagedEnv = readFileSync(outputEnvPath, 'utf8');
  if (packagedEnv.includes('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH=')
    || packagedEnv.includes('GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH=')
    || packagedEnv.includes('GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH=')
    || packagedEnv.includes('RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH=')
    || packagedEnv.includes('SECURITY_FINAL_SWEEP_ARTIFACT_PATH=')
    || packagedEnv.includes('REDDIT_LIVE_EVIDENCE_PATH=')
    || packagedEnv.includes('SUMMARY_REAL_FEEDBACK_SAMPLES_PATH=')) {
    violations.push('current evidence package must not merge stale default evidence env files');
  }
  const report = JSON.parse(readFileSync(outputReportPath, 'utf8'));
  const skippedStalePaths = new Set((report.skippedStaleEnvFiles ?? []).map((record) => record.path));
  if (!skippedStalePaths.has(liveOpenDefaultEnvPath)
    || !skippedStalePaths.has(githubRepoRadarDefaultEnvPath)
    || !skippedStalePaths.has(githubTrendingPageDefaultEnvPath)
    || !skippedStalePaths.has(relevanceMemoryDefaultEnvPath)
    || !skippedStalePaths.has(securityFinalSweepDefaultEnvPath)
    || !skippedStalePaths.has(redditDefaultEnvPath)
    || !skippedStalePaths.has(summaryFeedbackDefaultEnvPath)) {
    violations.push('current evidence package report must list skipped stale default evidence env files');
  }
  if (!Array.isArray(report.artifactIntegrity?.inputEnvFiles) || report.artifactIntegrity.inputEnvFiles.length !== 1) {
    violations.push('current evidence package report must hash only included input env files');
  }
}

function validateCurrentEvidencePackageRejectsEmptyInputs() {
  const artifactDir = join(tempDirectory, 'empty-current-package');
  mkdirSync(artifactDir, { recursive: true });
  const staleEnvPath = join(artifactDir, 'live-open-connectors.env');
  const outputEnvPath = join(artifactDir, 'empty-current-package.env');
  const outputReportPath = join(artifactDir, 'empty-current-package-report.json');
  const expectedCommitSha = 'a'.repeat(40);
  const staleCommitSha = 'b'.repeat(40);

  writeEvidenceEnvFile(staleEnvPath, [
    ['BACKEND_GIT_COMMIT_SHA', staleCommitSha],
    ['LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', join(artifactDir, 'stale-live-open.json')],
  ]);

  assertRejectedWithMessages(
    () => execFileSync('node', ['scripts/package-current-external-beta-evidence.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        EXTERNAL_BETA_CURRENT_PACKAGE_ARTIFACT_DIR: artifactDir,
        EXTERNAL_BETA_CURRENT_ENV_PATH: outputEnvPath,
        EXTERNAL_BETA_CURRENT_REPORT_PATH: outputReportPath,
        EXTERNAL_BETA_CURRENT_PACKAGE_EXPECTED_COMMIT_SHA: expectedCommitSha,
        EXTERNAL_BETA_ADDITIONAL_ENV_PATHS: '',
      },
    }),
    'empty current evidence package inputs',
    [
      'No current external beta evidence env files were found to package.',
      `Expected BACKEND_GIT_COMMIT_SHA: ${expectedCommitSha}`,
      'Regenerate Docker/live evidence for the current release commit',
      'Skipped stale env files:',
      staleEnvPath,
      `BACKEND_GIT_COMMIT_SHA=${staleCommitSha}`,
      'Skipped missing env files:',
    ],
  );
}

function assertRejected(fn, label, expectedMessage) {
  assertRejectedWithMessages(fn, label, [expectedMessage]);
}

function assertRejectedWithMessages(fn, label, expectedMessages) {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const expectedMessage of expectedMessages) {
      if (!message.includes(expectedMessage)) {
        violations.push(`expected ${label} rejection to include "${expectedMessage}"`);
      }
    }
    return;
  }

  violations.push(`expected ${label} to be rejected`);
}
