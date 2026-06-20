import { join } from 'node:path';

import {
  runNpmScript,
  withDockerBackendEvidenceStack,
} from './lib/docker-backend-evidence-harness.mjs';

await withDockerBackendEvidenceStack({
  projectEnvName: 'DURABLE_BACKEND_E2E_COMPOSE_PROJECT',
  projectPrefix: 'social-monitor-e2e',
  keepEnvNames: ['KEEP_DOCKER_DURABLE_BACKEND_E2E_STACK'],
}, async ({ runnerEnv }) => {
  const artifactPath =
    process.env.DURABLE_BACKEND_E2E_ARTIFACT_PATH ??
    join(process.env.STAGING_RELIABILITY_ARTIFACT_DIR ?? '/tmp/social-monitor-evidence', 'durable-backend-e2e-loop.json');
  const env = {
    ...runnerEnv,
    DURABLE_BACKEND_E2E_ARTIFACT_PATH: artifactPath,
  };

  runNpmScript('capture:durable-backend-e2e-loop', env);
  runNpmScript('check:staging-reliability-evidence', env);
  console.log(`DURABLE_BACKEND_E2E_ARTIFACT_PATH=${artifactPath}`);
});
