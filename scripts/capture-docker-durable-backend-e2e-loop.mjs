import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import {
  runNpmScript,
  withDockerBackendEvidenceStack,
} from './lib/docker-backend-evidence-harness.mjs';
import { shellQuote, validateEvidenceEnvFilePath, writeEvidenceEnvFile } from './lib/evidence-env-file.mjs';

const artifactPath =
  process.env.DURABLE_BACKEND_E2E_ARTIFACT_PATH ??
  join(resolve(process.env.STAGING_RELIABILITY_ARTIFACT_DIR ?? '/tmp/social-monitor-evidence'), 'durable-backend-e2e-loop.json');
const artifactTarget = resolveArtifactPath(artifactPath, 'DURABLE_BACKEND_E2E_ARTIFACT_PATH');
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

function resolveArtifactPath(path, label) {
  if (!isAbsolute(path)) {
    throw new Error(`${label} must be an absolute JSON file path`);
  }
  const resolved = resolve(path);
  if (!resolved.endsWith('.json')) {
    throw new Error(`${label} must end with .json`);
  }
  if (isInsideWorkspace(resolved)) {
    throw new Error(`${label} must not write release evidence into the git workspace`);
  }
  if (isFixtureLikePath(resolved)) {
    throw new Error(`${label} must not point to fixture or example paths`);
  }

  return resolved;
}

function isInsideWorkspace(path) {
  const workspace = resolve(process.cwd());
  const relativePath = relative(workspace, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isFixtureLikePath(path) {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  return ['/fixtures/', '.example.', '-examples', '_examples'].some((fragment) => normalized.includes(fragment));
}
