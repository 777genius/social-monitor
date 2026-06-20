import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const artifactDir =
  process.env.SOURCE_LIVE_EVIDENCE_ARTIFACT_DIR ??
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const evidencePath =
  process.env.LIVE_OPEN_CONNECTORS_EVIDENCE_PATH ??
  join(artifactDir, 'live-open-connectors.json');
const env = {
  ...process.env,
  LIVE_OPEN_CONNECTORS_EVIDENCE_PATH: evidencePath,
  SOURCE_LIVE_ENVIRONMENT_ID: requiredEnv('SOURCE_LIVE_ENVIRONMENT_ID'),
  BACKEND_IMAGE_DIGEST: requiredEnv('BACKEND_IMAGE_DIGEST'),
  SOURCE_LIVE_OPERATOR: requiredEnv('SOURCE_LIVE_OPERATOR'),
};

mkdirSync(artifactDir, { recursive: true });

execFileSync('node', [
  'scripts/run-with-timeout.mjs',
  '--timeout-ms',
  '45000',
  '--node-options',
  '--max-old-space-size=1024',
  '--',
  'ts-node',
  '-r',
  'tsconfig-paths/register',
  'scripts/check-live-open-connectors.ts',
], {
  env,
  stdio: 'inherit',
});
execFileSync('node', ['scripts/check-source-live-certification-evidence.mjs'], {
  env,
  stdio: 'inherit',
});

console.log(`LIVE_OPEN_CONNECTORS_EVIDENCE_PATH=${evidencePath}`);

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required to capture live open connector evidence`);
  }

  return value;
}
