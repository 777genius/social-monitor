import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const artifactDir =
  process.env.SOURCE_LIVE_EVIDENCE_ARTIFACT_DIR ??
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const evidencePath =
  process.env.LIVE_OPEN_CONNECTORS_EVIDENCE_PATH ??
  join(resolve(artifactDir), 'live-open-connectors.json');
const envFilePath =
  process.env.LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH ??
  join(resolve(artifactDir), 'live-open-connectors.env');
const evidenceTarget = validateEvidenceJsonFilePath(evidencePath, 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH');
const envFileTarget = validateEvidenceEnvFilePath(envFilePath);
const identityEnvNames = ['SOURCE_LIVE_ENVIRONMENT_ID', 'SOURCE_LIVE_OPERATOR'];
const forbiddenIdentityFragments = ['local', 'fixture', 'example', 'mock', 'test'];
const env = {
  ...process.env,
  LIVE_OPEN_CONNECTORS_EVIDENCE_PATH: evidenceTarget,
  SOURCE_LIVE_ENVIRONMENT_ID: requiredEnv('SOURCE_LIVE_ENVIRONMENT_ID'),
  BACKEND_IMAGE_DIGEST: requiredEnv('BACKEND_IMAGE_DIGEST'),
  SOURCE_LIVE_OPERATOR: requiredEnv('SOURCE_LIVE_OPERATOR'),
};

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

writeEvidenceEnvFile(envFileTarget, [
  ['LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', evidenceTarget],
  ['SOURCE_LIVE_ENVIRONMENT_ID', env.SOURCE_LIVE_ENVIRONMENT_ID],
  ['BACKEND_IMAGE_DIGEST', env.BACKEND_IMAGE_DIGEST],
  ['SOURCE_LIVE_OPERATOR', env.SOURCE_LIVE_OPERATOR],
], {
  usageLines: [
    'Usage:',
    `set -a; . ${shellQuote(envFileTarget)}; set +a`,
    'npm run check:source-live-certification-evidence',
    'This credentialless handoff covers Hacker News, RSS and GitHub only. Reddit evidence remains blocked until tenant OAuth credentials are provided.',
  ],
});

console.log(`LIVE_OPEN_CONNECTORS_EVIDENCE_PATH=${evidenceTarget}`);
console.log(`LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH=${envFileTarget}`);

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required to capture live open connector evidence`);
  }
  if (identityEnvNames.includes(name) && isForbiddenEvidenceIdentity(value)) {
    throw new Error(`${name} must not use local, fixture, example, mock or test identifiers`);
  }

  return value;
}

function isForbiddenEvidenceIdentity(value) {
  const normalized = value.toLowerCase();
  return forbiddenIdentityFragments.some((fragment) => normalized.includes(fragment));
}
