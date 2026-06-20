import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const fixturePath = 'ops/release/fixtures/redacted-summary-feedback-samples-examples.json';
const captureScript = 'scripts/capture-summary-feedback-samples.mjs';
const tempDirectory = mkdtempSync(join(tmpdir(), 'summary-feedback-sample-capture-'));
const violations = [];

try {
  validatePositiveCapture();
  validateWorkspaceInputRejected();
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
