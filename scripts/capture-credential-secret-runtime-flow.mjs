import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { shellQuote, writeEvidenceEnvFile } from './lib/evidence-env-file.mjs';

const artifactDir =
  process.env.CREDENTIAL_SECRET_EVIDENCE_ARTIFACT_DIR ??
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const sourceCredentialPath =
  process.env.SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH ??
  join(resolve(artifactDir), 'source-credential-rotation.json');
const webhookSecretPath =
  process.env.WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH ??
  join(resolve(artifactDir), 'webhook-secret-rotation.json');
const envFilePath =
  process.env.CREDENTIAL_SECRET_RUNTIME_FLOW_ENV_PATH ??
  join(resolve(artifactDir), 'credential-secret-runtime-flow.env');
const forbiddenIdentityFragments = ['local', 'fixture', 'example', 'mock', 'test'];
const env = {
  ...process.env,
  SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: sourceCredentialPath,
  WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: webhookSecretPath,
  STAGING_ENVIRONMENT_ID: evidenceIdentity('STAGING_ENVIRONMENT_ID', 'credential-secret-runtime-drill'),
  STAGING_SECRET_STORE_ID: evidenceIdentity('STAGING_SECRET_STORE_ID', 'credential-secret-runtime-drill-store'),
  STAGING_OPERATOR: evidenceIdentity('STAGING_OPERATOR', 'security-owner'),
  CREDENTIAL_SECRET_RUNTIME_FLOW_OVERWRITE_ARTIFACTS: '1',
};

mkdirSync(artifactDir, { recursive: true });

execFileSync('node', [
  'scripts/run-with-timeout.mjs',
  '--timeout-ms',
  '60000',
  '--node-options',
  '--max-old-space-size=768',
  '--',
  'ts-node',
  '-r',
  'tsconfig-paths/register',
  'scripts/check-credential-secret-runtime-flow.ts',
], {
  env,
  stdio: 'inherit',
});
execFileSync('node', ['scripts/check-credential-secret-runtime-flow.mjs'], {
  env,
  stdio: 'inherit',
});

writeEvidenceEnvFile(envFilePath, [
  ['SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH', sourceCredentialPath],
  ['WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH', webhookSecretPath],
  ['STAGING_SECRET_STORE_ID', env.STAGING_SECRET_STORE_ID],
], {
  usageLines: [
    'Usage:',
    `set -a; . ${shellQuote(envFilePath)}; set +a`,
    'npm run beta:evidence:validate -- --job credential-secret-rotation-drill',
    'This handoff includes credential and webhook rotation artifact paths only. It intentionally does not export STAGING_ENVIRONMENT_ID for other staging jobs.',
  ],
});

console.log(`SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH=${sourceCredentialPath}`);
console.log(`WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH=${webhookSecretPath}`);
console.log(`CREDENTIAL_SECRET_RUNTIME_FLOW_ENV_PATH=${envFilePath}`);

function evidenceIdentity(name, fallback) {
  const value = process.env[name]?.trim() ?? fallback;
  if (isForbiddenEvidenceIdentity(value)) {
    throw new Error(`${name} must not use local, fixture, example, mock or test identifiers`);
  }

  return value;
}

function isForbiddenEvidenceIdentity(value) {
  const normalized = value.toLowerCase();
  return forbiddenIdentityFragments.some((fragment) => normalized.includes(fragment));
}
