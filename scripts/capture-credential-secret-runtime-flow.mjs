import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const artifactDir =
  process.env.CREDENTIAL_SECRET_EVIDENCE_ARTIFACT_DIR ??
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const sourceCredentialPath =
  process.env.SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH ??
  join(artifactDir, 'source-credential-rotation.json');
const webhookSecretPath =
  process.env.WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH ??
  join(artifactDir, 'webhook-secret-rotation.json');
const env = {
  ...process.env,
  SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: sourceCredentialPath,
  WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: webhookSecretPath,
  STAGING_ENVIRONMENT_ID: process.env.STAGING_ENVIRONMENT_ID ?? 'credential-secret-runtime-drill',
  STAGING_SECRET_STORE_ID: process.env.STAGING_SECRET_STORE_ID ?? 'credential-secret-runtime-drill-store',
  STAGING_OPERATOR: process.env.STAGING_OPERATOR ?? 'security-owner',
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

console.log(`SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH=${sourceCredentialPath}`);
console.log(`WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH=${webhookSecretPath}`);
