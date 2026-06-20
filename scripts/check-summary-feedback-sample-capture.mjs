import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const fixturePath = 'ops/release/fixtures/redacted-summary-feedback-samples-examples.json';
const captureScript = 'scripts/capture-summary-feedback-samples.mjs';
const tempDirectory = mkdtempSync(join(tmpdir(), 'summary-feedback-sample-capture-'));
const violations = [];

try {
  validatePositiveCapture();
  validateWorkspaceInputRejected();
  validateFixtureArtifactInputRejected();
  validatePublicInputRejected();
  validateWorkspaceEnvFileRejected();
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Summary feedback sample capture OK');

function validatePositiveCapture() {
  const inputPath = join(tempDirectory, 'redacted-summary-feedback-input.json');
  const outputPath = join(tempDirectory, 'summary-real-feedback-samples.json');
  const envFilePath = join(tempDirectory, 'summary-feedback-samples.env');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const now = Date.now();
  writeFileSync(inputPath, `${JSON.stringify({
    samples: fixture.samples,
    sampleWindow: {
      startedAt: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
      endedAt: new Date(now - 2 * 60 * 1000).toISOString(),
    },
  }, null, 2)}\n`, { mode: 0o600 });

  execFileSync(process.execPath, [captureScript], {
    env: {
      ...process.env,
      SUMMARY_FEEDBACK_REDACTED_INPUT_PATH: inputPath,
      SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: outputPath,
      SUMMARY_FEEDBACK_SAMPLES_ENV_PATH: envFilePath,
      SUMMARY_FEEDBACK_SOURCE_KIND: 'internal_dogfood',
      SUMMARY_FEEDBACK_ENVIRONMENT_ID: 'summary-dogfood-alpha-1',
      SUMMARY_FEEDBACK_OPERATOR: 'summary-owner-1',
      SUMMARY_FEEDBACK_REDACTED_BY: 'summary-owner-1',
      SUMMARY_FEEDBACK_APPROVED_BY: 'security-owner-1',
      SUMMARY_FEEDBACK_COLLECTION_METHOD: 'Redacted internal dogfood export collected from summary feedback API review queue.',
    },
    stdio: 'inherit',
  });

  if (!existsSync(outputPath)) {
    violations.push(`${captureScript}: positive smoke must write ${outputPath}`);
    return;
  }

  const artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
  if (artifact.provenance?.fixtureOnly !== false) {
    violations.push(`${captureScript}: positive smoke output provenance.fixtureOnly must be false`);
  }
  if (artifact.rollup?.sampleCount !== fixture.samples.length) {
    violations.push(`${captureScript}: positive smoke output rollup.sampleCount must match input samples`);
  }

  if (!existsSync(envFilePath)) {
    violations.push(`${captureScript}: positive smoke must write ${envFilePath}`);
    return;
  }
  const envFileMode = statSync(envFilePath).mode & 0o777;
  if (envFileMode !== 0o600) {
    violations.push(`${captureScript}: generated env handoff must use 0600 permissions`);
  }
  const envFile = readFileSync(envFilePath, 'utf8');
  if (!envFile.includes(`SUMMARY_REAL_FEEDBACK_SAMPLES_PATH='${outputPath}'`)) {
    violations.push(`${captureScript}: generated env handoff must export SUMMARY_REAL_FEEDBACK_SAMPLES_PATH`);
  }
  if (envFile.includes('SUMMARY_FEEDBACK_REDACTED_INPUT_PATH')) {
    violations.push(`${captureScript}: generated env handoff must not export redacted input path`);
  }
}

function validateWorkspaceInputRejected() {
  const outputPath = join(tempDirectory, 'workspace-input-should-not-write.json');
  const result = runCaptureExpectingFailure({
    SUMMARY_FEEDBACK_REDACTED_INPUT_PATH: resolve(fixturePath),
    SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: outputPath,
    SUMMARY_FEEDBACK_SOURCE_KIND: 'internal_dogfood',
    SUMMARY_FEEDBACK_ENVIRONMENT_ID: 'summary-dogfood-alpha-1',
    SUMMARY_FEEDBACK_OPERATOR: 'summary-owner-1',
    SUMMARY_FEEDBACK_REDACTED_BY: 'summary-owner-1',
    SUMMARY_FEEDBACK_APPROVED_BY: 'security-owner-1',
    SUMMARY_FEEDBACK_COLLECTION_METHOD: 'Redacted internal dogfood export collected from summary feedback API review queue.',
    SUMMARY_FEEDBACK_WINDOW_STARTED_AT: '2026-06-18T00:00:00.000Z',
    SUMMARY_FEEDBACK_WINDOW_ENDED_AT: '2026-06-19T00:00:00.000Z',
  });

  if (result.exitCode === 0) {
    violations.push(`${captureScript}: negative smoke must reject workspace fixture input`);
    return;
  }
  if (!result.output.includes('must not read redacted feedback input from the git workspace')) {
    violations.push(`${captureScript}: negative smoke must explain workspace input rejection`);
  }
}

function validateFixtureArtifactInputRejected() {
  const inputPath = join(tempDirectory, 'fixture-artifact-input.json');
  const outputPath = join(tempDirectory, 'fixture-artifact-should-not-write.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  writeFileSync(inputPath, `${JSON.stringify(fixture, null, 2)}\n`, { mode: 0o600 });

  const result = runCaptureExpectingFailure({
    SUMMARY_FEEDBACK_REDACTED_INPUT_PATH: inputPath,
    SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: outputPath,
    SUMMARY_FEEDBACK_SOURCE_KIND: 'internal_dogfood',
    SUMMARY_FEEDBACK_ENVIRONMENT_ID: 'summary-dogfood-alpha-1',
    SUMMARY_FEEDBACK_OPERATOR: 'summary-owner-1',
    SUMMARY_FEEDBACK_REDACTED_BY: 'summary-owner-1',
    SUMMARY_FEEDBACK_APPROVED_BY: 'security-owner-1',
    SUMMARY_FEEDBACK_COLLECTION_METHOD: 'Redacted internal dogfood export collected from summary feedback API review queue.',
  });

  if (result.exitCode === 0) {
    violations.push(`${captureScript}: negative smoke must reject copied fixture artifact input`);
    return;
  }
  if (existsSync(outputPath)) {
    violations.push(`${captureScript}: negative smoke must not write output artifact when fixture provenance is rejected`);
  }
  if (!result.output.includes('must not use fixture provenance as real feedback input')) {
    violations.push(`${captureScript}: negative smoke must explain fixture provenance rejection`);
  }
}

function validatePublicInputRejected() {
  const inputPath = join(tempDirectory, 'public-redacted-summary-feedback-input.json');
  const outputPath = join(tempDirectory, 'public-input-should-not-write.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  writeFileSync(inputPath, `${JSON.stringify({
    samples: fixture.samples,
    sampleWindow: {
      startedAt: '2026-06-18T00:00:00.000Z',
      endedAt: '2026-06-19T00:00:00.000Z',
    },
  }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(inputPath, 0o644);

  const result = runCaptureExpectingFailure({
    SUMMARY_FEEDBACK_REDACTED_INPUT_PATH: inputPath,
    SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: outputPath,
    SUMMARY_FEEDBACK_SOURCE_KIND: 'internal_dogfood',
    SUMMARY_FEEDBACK_ENVIRONMENT_ID: 'summary-dogfood-alpha-1',
    SUMMARY_FEEDBACK_OPERATOR: 'summary-owner-1',
    SUMMARY_FEEDBACK_REDACTED_BY: 'summary-owner-1',
    SUMMARY_FEEDBACK_APPROVED_BY: 'security-owner-1',
    SUMMARY_FEEDBACK_COLLECTION_METHOD: 'Redacted internal dogfood export collected from summary feedback API review queue.',
  });

  if (result.exitCode === 0) {
    violations.push(`${captureScript}: negative smoke must reject public redacted feedback input`);
    return;
  }
  if (existsSync(outputPath)) {
    violations.push(`${captureScript}: negative smoke must not write output artifact when redacted input permissions are rejected`);
  }
  if (!result.output.includes('must use 0600-style private file permissions')) {
    violations.push(`${captureScript}: negative smoke must explain redacted input permission rejection`);
  }
}

function validateWorkspaceEnvFileRejected() {
  const inputPath = join(tempDirectory, 'redacted-summary-feedback-env-reject-input.json');
  const outputPath = join(tempDirectory, 'summary-env-reject-output.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  writeFileSync(inputPath, `${JSON.stringify({
    samples: fixture.samples,
    sampleWindow: {
      startedAt: '2026-06-18T00:00:00.000Z',
      endedAt: '2026-06-19T00:00:00.000Z',
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const result = runCaptureExpectingFailure({
    SUMMARY_FEEDBACK_REDACTED_INPUT_PATH: inputPath,
    SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: outputPath,
    SUMMARY_FEEDBACK_SAMPLES_ENV_PATH: resolve('summary-feedback-samples.env'),
    SUMMARY_FEEDBACK_SOURCE_KIND: 'internal_dogfood',
    SUMMARY_FEEDBACK_ENVIRONMENT_ID: 'summary-dogfood-alpha-1',
    SUMMARY_FEEDBACK_OPERATOR: 'summary-owner-1',
    SUMMARY_FEEDBACK_REDACTED_BY: 'summary-owner-1',
    SUMMARY_FEEDBACK_APPROVED_BY: 'security-owner-1',
    SUMMARY_FEEDBACK_COLLECTION_METHOD: 'Redacted internal dogfood export collected from summary feedback API review queue.',
  });

  if (result.exitCode === 0) {
    violations.push(`${captureScript}: negative smoke must reject workspace env handoff path`);
    return;
  }
  if (existsSync(outputPath)) {
    violations.push(`${captureScript}: negative smoke must not write output artifact when env handoff path is rejected`);
  }
  if (!result.output.includes('Evidence env file path must not be inside the git workspace')) {
    violations.push(`${captureScript}: negative smoke must explain workspace env handoff rejection`);
  }
}

function runCaptureExpectingFailure(env) {
  try {
    execFileSync(process.execPath, [captureScript], {
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
