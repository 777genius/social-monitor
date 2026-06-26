import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';

import {
  readPrivateEvidenceEnvEntries,
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const artifactDir = process.env.EXTERNAL_BETA_CURRENT_PACKAGE_ARTIFACT_DIR ?? '/tmp/social-monitor-evidence';
const envFilePath = validateEvidenceEnvFilePath(
  process.env.EXTERNAL_BETA_CURRENT_ENV_PATH?.trim()
    || join(resolve(artifactDir), 'external-beta-current-package.env'),
);
const reportPath = validateEvidenceJsonFilePath(
  process.env.EXTERNAL_BETA_CURRENT_REPORT_PATH?.trim()
    || join(resolve(artifactDir), 'external-beta-current-package-report.json'),
  'EXTERNAL_BETA_CURRENT_REPORT_PATH',
);
const additionalInputPaths = (process.env.EXTERNAL_BETA_ADDITIONAL_ENV_PATHS ?? '')
  .split(delimiter)
  .map((path) => path.trim())
  .filter((path) => path.length > 0);
const secretValueEnvNames = new Set([
  'DATABASE_URL',
  'RABBITMQ_URL',
  'RABBITMQ_MANAGEMENT_URL',
  'REDDIT_ACCESS_TOKEN',
  'REDDIT_CLIENT_SECRET',
  'REDDIT_REFRESH_TOKEN',
  'SOURCE_CONFIG_ENCRYPTION_KEY',
]);
const forbiddenValueFragments = [
  'bearer ',
  'basic ',
  'private_key',
  'client_secret=',
  'access_token=',
  'refresh_token=',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'redis://',
];

const expectedCommitSha = readExpectedCommitSha();
const selectedInputSpecs = uniqueInputSpecs([
  ...defaultInputSpecs(),
  ...additionalInputPaths.map((path) => ({
    path,
    staleCommitPolicy: 'reject',
    source: 'additional_env_path',
  })),
]);
const packageResult = packageEvidenceEnvFiles(selectedInputSpecs, expectedCommitSha);
assertExpectedCommitSha(packageResult.entries, expectedCommitSha);

if (packageResult.includedEnvFiles.length === 0) {
  throw new Error('No current external beta evidence env files were found to package');
}

const writtenEnvFilePath = writeEvidenceEnvFile(
  envFilePath,
  [...packageResult.entries.entries()].sort(([left], [right]) => left.localeCompare(right)),
  {
    usageLines: [
      'Current safe external beta evidence handoff.',
      'This file intentionally excludes secret values such as DATABASE_URL, RABBITMQ_URL and Reddit OAuth tokens.',
      `set -a; . ${shellQuote(envFilePath)}; set +a`,
      'npm run beta:evidence:summary',
      'npm run beta:evidence:validate',
    ],
  },
);

const handoff = JSON.parse(execFileSync('node', [
  'scripts/external-beta-evidence-runner.mjs',
  '--handoff-json',
  '--env-file',
  writtenEnvFilePath,
], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: process.env,
}));
const report = buildReport({
  envFilePath: writtenEnvFilePath,
  reportPath,
  packageResult,
  expectedCommitSha,
  readiness: handoff.readiness,
  jobs: handoff.jobs,
});
writePrivateJson(reportPath, report);

console.log(`EXTERNAL_BETA_CURRENT_ENV_PATH=${writtenEnvFilePath}`);
console.log(`EXTERNAL_BETA_CURRENT_REPORT_PATH=${reportPath}`);
console.log(`External beta current evidence package: ${report.readiness.externalEvidenceReadyJobs}/${report.readiness.externalEvidenceTotalJobs} external evidence jobs ready`);
console.log(`Remaining required env: ${report.remaining.requiredEnv.length > 0 ? report.remaining.requiredEnv.join(', ') : 'none'}`);
if (report.remaining.requiredAlternativeGroups.length > 0) {
  console.log(`Remaining required alternatives: ${formatRequiredAlternativeGroups(report.remaining.requiredAlternativeGroups)}`);
}

function packageEvidenceEnvFiles(inputSpecs, expectedCommitSha) {
  const entries = new Map();
  const sourcesByName = new Map();
  const includedEnvFiles = [];
  const skippedMissingEnvFiles = [];
  const skippedStaleEnvFiles = [];
  const withheldSecretEnvNames = new Set();
  const violations = [];

  for (const inputSpec of inputSpecs) {
    const path = inputSpec.path;
    if (path === undefined || path.length === 0) {
      continue;
    }
    if (!existsSync(path)) {
      skippedMissingEnvFiles.push(path);
      continue;
    }

    const parsedEntries = readPrivateEvidenceEnvEntries(path, `evidence env file ${path}`);
    const packagedCommitSha = new Map(parsedEntries).get('BACKEND_GIT_COMMIT_SHA');
    if (packagedCommitSha !== undefined && packagedCommitSha !== expectedCommitSha) {
      if (inputSpec.staleCommitPolicy === 'skip') {
        skippedStaleEnvFiles.push({
          path,
          source: inputSpec.source,
          packagedCommitSha,
          expectedCommitSha,
        });
        continue;
      }
      violations.push(`${path}: stale BACKEND_GIT_COMMIT_SHA ${packagedCommitSha}; expected ${expectedCommitSha}`);
      continue;
    }

    includedEnvFiles.push(path);
    for (const [name, value] of parsedEntries) {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
        violations.push(`${path}: ${name} is not a valid uppercase env var name`);
        continue;
      }
      if (secretValueEnvNames.has(name)) {
        withheldSecretEnvNames.add(name);
        continue;
      }
      const forbiddenFragment = forbiddenValueFragments.find((fragment) => value.toLowerCase().includes(fragment));
      if (forbiddenFragment !== undefined) {
        violations.push(`${path}: ${name} contains forbidden secret-like fragment "${forbiddenFragment}"`);
        continue;
      }

      const existingValue = entries.get(name);
      if (existingValue !== undefined && existingValue !== value) {
        violations.push(`${path}: ${name} conflicts with ${sourcesByName.get(name)}`);
        continue;
      }

      entries.set(name, value);
      sourcesByName.set(name, path);
    }
  }

  if (violations.length > 0) {
    throw new Error(`Current evidence package cannot merge env files:\n- ${violations.join('\n- ')}`);
  }

  return {
    entries,
    includedEnvFiles,
    skippedMissingEnvFiles,
    skippedStaleEnvFiles,
    withheldSecretEnvNames: [...withheldSecretEnvNames].sort(),
  };
}

function buildReport({ envFilePath, reportPath, packageResult, expectedCommitSha, readiness, jobs }) {
  const blockedJobs = jobs
    .filter((job) => job.blocksExternalBeta === true && job.executionReadiness !== 'local_contract_ready')
    .map((job) => ({
      jobId: job.jobId,
      executionReadiness: job.executionReadiness,
      missingEnv: job.missingEnv ?? [],
      missingRequiredAlternativeGroups: missingRequiredAlternativeGroups(job),
      preflightViolations: job.preflightViolations ?? [],
      operatorAction: job.operatorAction,
    }));
  const activeBlockerJobs = jobs
    .filter((job) => job.blocksExternalBeta === true && isActiveEvidenceBlockerReadiness(job.executionReadiness))
    .map((job) => ({
      jobId: job.jobId,
      executionReadiness: job.executionReadiness,
      missingEnv: job.missingEnv ?? [],
      missingRequiredAlternativeGroups: missingRequiredAlternativeGroups(job),
      preflightViolations: job.preflightViolations ?? [],
      operatorAction: job.operatorAction,
    }));

  return {
    schemaVersion: 1,
    artifactFormat: 'external-beta-current-evidence-package-v1',
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    generatedAt: new Date().toISOString(),
    envFilePath,
    reportPath,
    inputPolicy: {
      valuesPrinted: false,
      secretValuesIncluded: false,
      secretEnvNamesWithheld: packageResult.withheldSecretEnvNames,
    },
    commitPolicy: {
      expectedCommitSha,
      packagedCommitSha: packageResult.entries.get('BACKEND_GIT_COMMIT_SHA') ?? null,
      requireCurrentCommit: true,
    },
    artifactIntegrity: {
      inputEnvFiles: fileIntegrityRecords(packageResult.includedEnvFiles, 'input evidence env file'),
      packagedEvidenceArtifacts: packagedEvidenceArtifactIntegrityRecords(packageResult.entries),
    },
    includedEnvFiles: packageResult.includedEnvFiles,
    skippedMissingEnvFiles: packageResult.skippedMissingEnvFiles,
    skippedStaleEnvFiles: packageResult.skippedStaleEnvFiles,
    packagedEnvNames: [...packageResult.entries.keys()].sort(),
    readiness: {
      contractClosurePercent: readiness.contractClosurePercent,
      externalEvidenceReadyJobs: readiness.externalEvidenceReadyJobs,
      externalEvidenceTotalJobs: readiness.externalEvidenceTotalJobs,
      externalEvidenceEnvReadinessPercent: readiness.externalEvidenceEnvReadinessPercent,
      blockedMissingRequiredEnvJobCount: readiness.blockedMissingRequiredEnvJobCount,
      blockedLocalRuntimeEnvJobCount: readiness.blockedLocalRuntimeEnvJobCount,
      activeExternalEvidenceBlockerJobCount: activeBlockerJobs.length,
      readinessCounts: readiness.readinessCounts,
    },
    remaining: {
      requiredEnv: readiness.uniqueMissingEnv,
      optionalEnv: readiness.uniqueMissingOptionalEnv,
      requiredAlternativeGroups: blockedJobs.flatMap((job) => (
        job.missingRequiredAlternativeGroups.map((group) => ({
          jobId: job.jobId,
          ...group,
        }))
      )),
      activeBlockerJobs,
      blockedJobs,
    },
  };
}

function isActiveEvidenceBlockerReadiness(readiness) {
  return [
    'blocked_missing_required_env',
    'blocked_invalid_env',
    'blocked_local_runtime_env',
  ].includes(readiness);
}

function missingRequiredAlternativeGroups(job) {
  const missingEnv = new Set(job.missingEnv ?? []);
  return (job.requiredAlternativeInputs ?? [])
    .filter((alternative) => (
      (alternative.coversEnv ?? []).some((envName) => missingEnv.has(envName))
    ))
    .map((alternative) => {
      const inputs = alternative.inputs ?? [];
      return {
        label: alternative.label,
        coversEnv: alternative.coversEnv ?? [],
        requiredEnv: inputs.map((input) => input.env),
        missingEnv: inputs.filter((input) => input.missing === true).map((input) => input.env),
        satisfied: inputs.length > 0 && inputs.every((input) => input.missing !== true),
      };
    });
}

function formatRequiredAlternativeGroups(groups) {
  return groups
    .map((group) => {
      const missing = group.missingEnv.length > 0 ? group.missingEnv.join('+') : 'none';
      return `${group.jobId}:${group.label}[missing ${missing}]`;
    })
    .join('; ');
}

function packagedEvidenceArtifactIntegrityRecords(entries) {
  return [...entries.entries()]
    .filter(([name]) => name.endsWith('_PATH'))
    .map(([name, path]) => evidenceJsonFileIntegrityRecord(path, name))
    .sort((left, right) => left.envName.localeCompare(right.envName));
}

function evidenceJsonFileIntegrityRecord(path, envName) {
  return {
    envName,
    ...fileIntegrityRecord(validateEvidenceJsonFilePath(path, envName), envName),
  };
}

function fileIntegrityRecords(paths, label) {
  return paths
    .map((path) => fileIntegrityRecord(path, label))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function fileIntegrityRecord(path, label) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    throw new Error(`${label} ${path} must point to an existing regular file`);
  }
  if (!stats.isFile()) {
    throw new Error(`${label} ${path} must point to a regular file`);
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new Error(`${label} ${path} must use 0600-style private file permissions`);
  }
  const body = readFileSync(path);

  return {
    path,
    sha256: createHash('sha256').update(body).digest('hex'),
    sizeBytes: stats.size,
    mtimeMs: Math.trunc(stats.mtimeMs),
  };
}

function assertExpectedCommitSha(entries, expectedCommitSha) {
  const packagedCommitSha = entries.get('BACKEND_GIT_COMMIT_SHA');
  if (packagedCommitSha !== undefined && packagedCommitSha !== expectedCommitSha) {
    throw new Error(
      `Current evidence package has stale BACKEND_GIT_COMMIT_SHA ${packagedCommitSha}; expected ${expectedCommitSha}. Regenerate Docker/live evidence for the current release commit or set EXTERNAL_BETA_CURRENT_PACKAGE_EXPECTED_COMMIT_SHA for an intentional non-HEAD release package.`,
    );
  }
}

function readExpectedCommitSha() {
  const value = process.env.EXTERNAL_BETA_CURRENT_PACKAGE_EXPECTED_COMMIT_SHA?.trim()
    || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error('EXTERNAL_BETA_CURRENT_PACKAGE_EXPECTED_COMMIT_SHA must be a full lowercase git commit SHA');
  }

  return value;
}

function writePrivateJson(path, document) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function defaultInputSpecs() {
  const dockerOverridePath = process.env.DOCKER_BACKEND_STAGING_IMPORTED_ENV_PATH?.trim();
  const liveOpenOverridePath = process.env.LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH?.trim();
  const redditOverridePath = process.env.REDDIT_LIVE_EVIDENCE_ENV_PATH?.trim();
  const githubRepoRadarOverridePath = process.env.GITHUB_REPO_RADAR_LIVE_EVIDENCE_ENV_PATH?.trim();
  const githubTrendingPageOverridePath = process.env.GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_ENV_PATH?.trim();
  const githubSummaryOverridePath = process.env.GITHUB_LIVE_SUMMARY_EVIDENCE_ENV_PATH?.trim();
  const feedbackOverridePath = process.env.SUMMARY_FEEDBACK_SAMPLES_ENV_PATH?.trim();
  const resolvedArtifactDir = resolve(artifactDir);

  return [
    {
      path: dockerOverridePath || join(resolvedArtifactDir, 'external-beta-evidence-from-docker-bundle.env'),
      staleCommitPolicy: dockerOverridePath ? 'reject' : 'skip',
      source: dockerOverridePath
        ? 'docker_backend_staging_import_env_override'
        : 'default_docker_backend_staging_import_env',
    },
    {
      path: liveOpenOverridePath || join(resolvedArtifactDir, 'live-open-connectors.env'),
      staleCommitPolicy: liveOpenOverridePath ? 'reject' : 'skip',
      source: liveOpenOverridePath
        ? 'live_open_connectors_env_override'
        : 'default_live_open_connectors_env',
    },
    {
      path: githubRepoRadarOverridePath || join(resolvedArtifactDir, 'live-github-repo-radar.env'),
      staleCommitPolicy: githubRepoRadarOverridePath ? 'reject' : 'skip',
      source: githubRepoRadarOverridePath
        ? 'github_repo_radar_live_evidence_env_override'
        : 'default_github_repo_radar_live_evidence_env',
    },
    {
      path: githubTrendingPageOverridePath || join(resolvedArtifactDir, 'live-github-trending-page.env'),
      staleCommitPolicy: githubTrendingPageOverridePath ? 'reject' : 'skip',
      source: githubTrendingPageOverridePath
        ? 'github_trending_page_live_evidence_env_override'
        : 'default_github_trending_page_live_evidence_env',
    },
    {
      path: githubSummaryOverridePath,
      staleCommitPolicy: githubSummaryOverridePath ? 'reject' : 'skip',
      source: 'legacy_github_live_summary_env',
    },
    {
      path: redditOverridePath || join(resolvedArtifactDir, 'live-reddit-oauth.env'),
      staleCommitPolicy: redditOverridePath ? 'reject' : 'skip',
      source: redditOverridePath
        ? 'reddit_live_oauth_env_override'
        : 'default_reddit_live_oauth_env',
    },
    {
      path: feedbackOverridePath,
      staleCommitPolicy: feedbackOverridePath ? 'reject' : 'skip',
      source: 'summary_feedback_samples_env',
    },
  ];
}

function uniqueInputSpecs(inputSpecs) {
  const seenPaths = new Set();
  return inputSpecs.filter((inputSpec) => {
    if (inputSpec.path === undefined || inputSpec.path.length === 0 || seenPaths.has(inputSpec.path)) {
      return false;
    }
    seenPaths.add(inputSpec.path);
    return true;
  });
}
