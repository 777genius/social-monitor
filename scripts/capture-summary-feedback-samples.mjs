import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const artifactDir =
  process.env.SUMMARY_FEEDBACK_EVIDENCE_ARTIFACT_DIR ??
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const inputPathEnv = 'SUMMARY_FEEDBACK_REDACTED_INPUT_PATH';
const outputPathEnv = 'SUMMARY_REAL_FEEDBACK_SAMPLES_PATH';
const outputPath = process.env[outputPathEnv]?.trim() || join(artifactDir, 'summary-real-feedback-samples.json');
const envFilePath =
  process.env.SUMMARY_FEEDBACK_SAMPLES_ENV_PATH?.trim() ||
  join(resolve(artifactDir), 'summary-feedback-samples.env');
const redactedSampleFormat = 'redacted-summary-feedback-samples-v1';
const forbiddenPathFragments = ['/fixtures/', '\\fixtures\\', '.example.', '-examples', '_examples'];

async function main() {
  const inputPath = resolveInputPath(requiredEnv(inputPathEnv));
  const outputTarget = resolveOutputPath(outputPath);
  const envFileTarget = validateEvidenceEnvFilePath(envFilePath);
  const source = readInputSource(inputPath);
  const artifact = buildArtifact(source);

  mkdirSync(dirname(outputTarget), { recursive: true });
  const temporaryOutputPath = `${outputTarget}.${process.pid}.${Date.now()}.tmp.json`;

  try {
    writeFileSync(temporaryOutputPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temporaryOutputPath, 0o600);
    runSummaryFeedbackValidator(temporaryOutputPath);
    renameSync(temporaryOutputPath, outputTarget);
    chmodSync(outputTarget, 0o600);
    runSummaryFeedbackValidator(outputTarget);
  } catch (error) {
    rmSync(temporaryOutputPath, { force: true });
    throw error;
  }

  const writtenEnvFilePath = writeEvidenceEnvFile(envFileTarget, [
    [outputPathEnv, outputTarget],
  ], {
    usageLines: [
      'Load this file before validating summary-real-feedback-import evidence.',
      `set -a; . ${shellQuote(envFileTarget)}; set +a`,
      'Then run: npm run beta:evidence:validate -- --jobs summary-real-feedback-import',
    ],
  });

  console.log(`${outputPathEnv}=${outputTarget}`);
  console.log(`SUMMARY_FEEDBACK_SAMPLES_ENV_PATH=${writtenEnvFilePath}`);
}

function buildArtifact(source) {
  const samples = source.samples;
  const sampleWindow = readSampleWindow(source);
  const generatedAt = new Date().toISOString();
  const collectionMethod = readMetadata('SUMMARY_FEEDBACK_COLLECTION_METHOD', source.source?.collectionMethod);
  const redactionMethod =
    readOptionalEnv('SUMMARY_FEEDBACK_REDACTION_METHOD') ??
    source.redaction?.method ??
    'Identifiers and free-text comments were irreversibly redacted before summary feedback release review.';

  return {
    schemaVersion: 1,
    artifactFormat: redactedSampleFormat,
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    provenance: {
      evidenceKind: 'redacted_real_feedback_samples',
      collectionMethod,
      runner: 'scripts/capture-summary-feedback-samples.mjs',
      fixtureOnly: false,
    },
    evidenceMode: 'redacted_beta_samples',
    generatedAt,
    source: {
      kind: readMetadata('SUMMARY_FEEDBACK_SOURCE_KIND', source.source?.kind),
      environmentId: readMetadata('SUMMARY_FEEDBACK_ENVIRONMENT_ID', source.source?.environmentId),
      sampleWindow,
      operator: readMetadata('SUMMARY_FEEDBACK_OPERATOR', source.source?.operator),
      sampleCount: samples.length,
      collectionMethod,
      redactedBy: readMetadata('SUMMARY_FEEDBACK_REDACTED_BY', source.source?.redactedBy),
      approvedBy: readMetadata('SUMMARY_FEEDBACK_APPROVED_BY', source.source?.approvedBy),
    },
    redaction: {
      rawProviderPayloadsIncluded: false,
      piiIncluded: false,
      rawPromptTextIncluded: false,
      rawSourceTextIncluded: false,
      tokenValuesIncluded: false,
      secretUrlsIncluded: false,
      commentsAreSyntheticOrRedacted: true,
      method: redactionMethod,
    },
    samples,
    rollup: buildRollup(samples),
  };
}

function buildRollup(samples) {
  const rollup = {
    sampleCount: samples.length,
    categoryCounts: {},
    classificationCounts: {},
    severityCounts: {},
    actionTypeCounts: {},
    releaseBlockingSamples: 0,
    evalFixtureEligibleSamples: 0,
    blockerSampleIds: [],
  };

  for (const sample of samples) {
    increment(rollup.categoryCounts, sample.category);
    increment(rollup.classificationCounts, sample.classification);
    increment(rollup.severityCounts, sample.severity);
    increment(rollup.actionTypeCounts, sample.hardeningAction?.actionType);
    if (sample.releaseBlocking === true) {
      rollup.releaseBlockingSamples += 1;
    }
    if (sample.eligibleForEvalFixture === true) {
      rollup.evalFixtureEligibleSamples += 1;
    }
    if (sample.classification === 'blocker' && typeof sample.feedbackId === 'string') {
      rollup.blockerSampleIds.push(sample.feedbackId);
    }
  }

  return rollup;
}

function increment(counts, key) {
  if (typeof key !== 'string' || key.trim().length === 0) {
    return;
  }
  counts[key] = (counts[key] ?? 0) + 1;
}

function readInputSource(inputPath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(inputPath, 'utf8'));
  } catch (error) {
    throw new Error(`${inputPathEnv} must point to a JSON file with redacted summary feedback samples: ${error.message}`);
  }

  assertInputIsNotFixtureEvidence(parsed);

  const samples = Array.isArray(parsed) ? parsed : parsed?.samples;
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error(`${inputPathEnv} must contain a non-empty samples array`);
  }

  return {
    ...(isRecord(parsed) ? parsed : {}),
    samples: JSON.parse(JSON.stringify(samples)),
  };
}

function assertInputIsNotFixtureEvidence(parsed) {
  if (!isRecord(parsed)) {
    return;
  }

  if (parsed.provenance?.fixtureOnly === true) {
    throw new Error(`${inputPathEnv} must not use fixture provenance as real feedback input`);
  }
  if (parsed.provenance?.evidenceKind === 'fixture_example') {
    throw new Error(`${inputPathEnv} must not use fixture_example evidence as real feedback input`);
  }

  const source = isRecord(parsed.source) ? parsed.source : undefined;
  if (source !== undefined) {
    for (const field of ['kind', 'environmentId', 'operator', 'collectionMethod', 'redactedBy', 'approvedBy']) {
      const value = source[field];
      if (typeof value !== 'string') {
        continue;
      }
      const normalized = value.toLowerCase();
      for (const fragment of ['example', 'fixture', 'synthetic', 'mock', 'test']) {
        if (normalized.includes(fragment)) {
          throw new Error(`${inputPathEnv} source.${field} must not contain "${fragment}" for real feedback input`);
        }
      }
    }
  }
}

function readSampleWindow(source) {
  const startedAt = readOptionalEnv('SUMMARY_FEEDBACK_WINDOW_STARTED_AT')
    ?? source.source?.sampleWindow?.startedAt
    ?? source.sampleWindow?.startedAt;
  const endedAt = readOptionalEnv('SUMMARY_FEEDBACK_WINDOW_ENDED_AT')
    ?? source.source?.sampleWindow?.endedAt
    ?? source.sampleWindow?.endedAt;

  if (startedAt === undefined || endedAt === undefined) {
    throw new Error('SUMMARY_FEEDBACK_WINDOW_STARTED_AT and SUMMARY_FEEDBACK_WINDOW_ENDED_AT are required unless input.source.sampleWindow is set');
  }

  return { startedAt, endedAt };
}

function runSummaryFeedbackValidator(artifactPath) {
  execFileSync(process.execPath, ['scripts/check-summary-feedback-hardening.mjs'], {
    env: {
      ...process.env,
      [outputPathEnv]: artifactPath,
    },
    stdio: 'inherit',
  });
}

function resolveInputPath(path) {
  if (!isAbsolute(path)) {
    throw new Error(`${inputPathEnv} must be an absolute JSON file path`);
  }
  const resolved = resolve(path);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error(`${inputPathEnv} must point to an existing regular file`);
  }
  if (isInsideWorkspace(resolved)) {
    throw new Error(`${inputPathEnv} must not read redacted feedback input from the git workspace`);
  }
  if (isFixtureLikePath(resolved)) {
    throw new Error(`${inputPathEnv} must not point to fixture or example files`);
  }
  if (!hasPrivateFilePermissions(resolved)) {
    throw new Error(`${inputPathEnv} must use 0600-style private file permissions`);
  }
  return resolved;
}

function resolveOutputPath(path) {
  return validateEvidenceJsonFilePath(path, outputPathEnv);
}

function isInsideWorkspace(path) {
  const workspace = resolve(process.cwd());
  const relativePath = relative(workspace, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isFixtureLikePath(path) {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  return forbiddenPathFragments.some((fragment) => normalized.includes(fragment.replaceAll('\\', '/').toLowerCase()));
}

function hasPrivateFilePermissions(path) {
  return (statSync(path).mode & 0o077) === 0;
}

function readMetadata(envName, fallback) {
  const value = readOptionalEnv(envName) ?? stringOrUndefined(fallback);
  if (value === undefined) {
    throw new Error(`${envName} is required to capture summary feedback samples`);
  }
  return value;
}

function requiredEnv(name) {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readOptionalEnv(name) {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function stringOrUndefined(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
