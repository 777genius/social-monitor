import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const fixturePath = 'ops/release/fixtures/redacted-summary-feedback-samples-examples.json';
const captureScript = 'scripts/capture-summary-feedback-samples.mjs';
const tempDirectory = mkdtempSync(join(tmpdir(), 'summary-feedback-sample-capture-'));
const violations = [];

try {
  validateCaptureScriptGuards();
  validatePositiveCapture();
  validateMissingExportTraceabilityRejected();
  validateWorkspaceInputRejected();
  validateFixtureArtifactInputRejected();
  validateCopiedFixtureSamplesRejected();
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

function validateCaptureScriptGuards() {
  const captureSource = readFileSync(captureScript, 'utf8');
  for (const marker of ['mode: 0o600', 'chmodSync', '.tmp.json', 'must not reuse fixture sample id', 'must not copy fixture sample signal text']) {
    if (!captureSource.includes(marker)) {
      violations.push(`${captureScript}: capture must include ${marker}`);
    }
  }
}

function validatePositiveCapture() {
  const inputPath = join(tempDirectory, 'redacted-summary-feedback-input.json');
  const outputPath = join(tempDirectory, 'summary-real-feedback-samples.json');
  const envFilePath = join(tempDirectory, 'summary-feedback-samples.env');
  const samples = redactedDogfoodSamples();
  const now = Date.now();
  writeFileSync(inputPath, `${JSON.stringify({
    samples,
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
      ...redactedExportEnv({
        SUMMARY_FEEDBACK_EXPORTED_AT: new Date(now - 60 * 1000).toISOString(),
      }),
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
  if (artifact.rollup?.sampleCount !== samples.length) {
    violations.push(`${captureScript}: positive smoke output rollup.sampleCount must match input samples`);
  }
  if (artifact.source?.export?.exportId !== 'SF-EXPORT-20260618-ALPHA') {
    violations.push(`${captureScript}: positive smoke output must include source.export traceability metadata`);
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
    ...redactedExportEnv(),
  });

  if (result.exitCode === 0) {
    violations.push(`${captureScript}: negative smoke must reject workspace fixture input`);
    return;
  }
  if (!result.output.includes('must not read redacted feedback input from the git workspace')) {
    violations.push(`${captureScript}: negative smoke must explain workspace input rejection`);
  }
}

function validateMissingExportTraceabilityRejected() {
  const inputPath = join(tempDirectory, 'missing-export-traceability-input.json');
  const outputPath = join(tempDirectory, 'missing-export-traceability-should-not-write.json');
  writeFileSync(inputPath, `${JSON.stringify({
    samples: redactedDogfoodSamples(),
    sampleWindow: {
      startedAt: '2026-06-18T00:00:00.000Z',
      endedAt: '2026-06-19T00:00:00.000Z',
    },
  }, null, 2)}\n`, { mode: 0o600 });

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
    violations.push(`${captureScript}: negative smoke must reject missing source.export traceability`);
    return;
  }
  if (existsSync(outputPath)) {
    violations.push(`${captureScript}: negative smoke must not write output artifact when source.export traceability is missing`);
  }
  if (!result.output.includes('SUMMARY_FEEDBACK_EXPORT_SOURCE_SYSTEM is required')) {
    violations.push(`${captureScript}: negative smoke must explain missing source.export traceability`);
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
    ...redactedExportEnv(),
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

function validateCopiedFixtureSamplesRejected() {
  const inputPath = join(tempDirectory, 'copied-fixture-samples-input.json');
  const outputPath = join(tempDirectory, 'copied-fixture-samples-should-not-write.json');
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
    SUMMARY_FEEDBACK_SOURCE_KIND: 'internal_dogfood',
    SUMMARY_FEEDBACK_ENVIRONMENT_ID: 'summary-dogfood-alpha-1',
    SUMMARY_FEEDBACK_OPERATOR: 'summary-owner-1',
    SUMMARY_FEEDBACK_REDACTED_BY: 'summary-owner-1',
    SUMMARY_FEEDBACK_APPROVED_BY: 'security-owner-1',
    SUMMARY_FEEDBACK_COLLECTION_METHOD: 'Redacted internal dogfood export collected from summary feedback API review queue.',
    ...redactedExportEnv(),
  });

  if (result.exitCode === 0) {
    violations.push(`${captureScript}: negative smoke must reject copied fixture samples without fixture provenance`);
    return;
  }
  if (existsSync(outputPath)) {
    violations.push(`${captureScript}: negative smoke must not write output artifact when copied fixture samples are rejected`);
  }
  if (!result.output.includes('must not reuse fixture sample id')) {
    violations.push(`${captureScript}: negative smoke must explain copied fixture sample rejection`);
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
    ...redactedExportEnv(),
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
    ...redactedExportEnv(),
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

function redactedExportEnv(overrides = {}) {
  return {
    SUMMARY_FEEDBACK_EXPORT_SOURCE_SYSTEM: 'summary-feedback-api',
    SUMMARY_FEEDBACK_EXPORT_ID: 'SF-EXPORT-20260618-ALPHA',
    SUMMARY_FEEDBACK_EXPORTED_AT: '2026-06-19T00:05:00.000Z',
    SUMMARY_FEEDBACK_REVIEW_QUEUE: 'summary-quality-review',
    SUMMARY_FEEDBACK_REDACTION_REVIEW_ID: 'SEC-REDACTION-4321',
    SUMMARY_FEEDBACK_APPROVAL_REFERENCE: 'REL-APPROVAL-9876',
    ...overrides,
  };
}

function redactedDogfoodSamples() {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const replacements = [
    {
      suffix: '001',
      sanitizedSignal: 'Internal dogfood review found a summary claim that outran the cited approval state.',
      redactedComment: 'Reviewer noted that the redacted item showed a pending state while the summary used approved wording.',
    },
    {
      suffix: '002',
      sanitizedSignal: 'Internal dogfood review found a citation attached to the wrong supporting metric.',
      redactedComment: 'Reviewer noted that the citation described context but did not prove the redacted metric.',
    },
    {
      suffix: '003',
      sanitizedSignal: 'Internal dogfood review found a newer in-window item omitted from the summary.',
      redactedComment: 'Reviewer noted that an in-window item with relevant evidence was absent from the final summary.',
    },
  ];

  return fixture.samples.map((sample, index) => {
    const replacement = replacements[index] ?? replacements[0];
    return {
      ...sample,
      feedbackId: `dogfood-feedback-summary-${replacement.suffix}`,
      summaryEvidence: {
        ...sample.summaryEvidence,
        summaryId: `dogfood-summary-${replacement.suffix}`,
        topicId: 'dogfood-topic-summary-001',
        citationId: `dogfood-citation-${replacement.suffix}`,
        feedItemId: `dogfood-feed-item-${replacement.suffix}`,
        sourceItemId: `dogfood-source-item-${replacement.suffix}`,
      },
      sanitizedSignal: replacement.sanitizedSignal,
      redactedComment: replacement.redactedComment,
    };
  });
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
