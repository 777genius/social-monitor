import { dirname, join, resolve } from 'node:path';

import {
  runNpmScript,
  withDockerBackendEvidenceStack,
} from './lib/docker-backend-evidence-harness.mjs';
import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const artifactPath =
  process.env.DURABLE_BACKEND_E2E_ARTIFACT_PATH ??
  join(resolve(process.env.STAGING_RELIABILITY_ARTIFACT_DIR ?? '/tmp/social-monitor-evidence'), 'durable-backend-e2e-loop.json');
const artifactTarget = validateEvidenceJsonFilePath(artifactPath, 'DURABLE_BACKEND_E2E_ARTIFACT_PATH');
const envFilePath =
  process.env.DURABLE_BACKEND_E2E_ENV_PATH ??
  join(dirname(artifactTarget), 'durable-backend-e2e.env');
const envFileTarget = validateEvidenceEnvFilePath(envFilePath);

await withDockerBackendEvidenceStack({
  projectEnvName: 'DURABLE_BACKEND_E2E_COMPOSE_PROJECT',
  projectPrefix: 'social-monitor-e2e',
  keepEnvNames: ['KEEP_DOCKER_DURABLE_BACKEND_E2E_STACK'],
}, async ({ runnerEnv }) => {
  const env = {
    ...runnerEnv,
    DURABLE_BACKEND_E2E_ARTIFACT_PATH: artifactTarget,
  };

  runNpmScript('capture:durable-backend-e2e-loop', env);
  runNpmScript('check:staging-reliability-evidence', env);
  writeEvidenceEnvFile(envFileTarget, [
    ['DURABLE_BACKEND_E2E_ARTIFACT_PATH', artifactTarget],
    ['API_BASE_URL', env.API_BASE_URL],
    ['STAGING_ENVIRONMENT_ID', env.STAGING_ENVIRONMENT_ID],
    ['BACKEND_IMAGE_DIGEST', env.BACKEND_IMAGE_DIGEST],
    ['STAGING_OPERATOR', env.STAGING_OPERATOR],
  ], {
    usageLines: [
      'Usage:',
      `set -a; . ${shellQuote(envFileTarget)}; set +a`,
      'npm run beta:evidence:validate -- --jobs durable-backend-e2e-loop',
    ],
  });
  console.log(`DURABLE_BACKEND_E2E_ARTIFACT_PATH=${artifactTarget}`);
  console.log(`DURABLE_BACKEND_E2E_ENV_PATH=${envFileTarget}`);
});
