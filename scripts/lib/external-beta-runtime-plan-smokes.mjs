export function createExternalBetaRuntimePlanSmokes({
  contract, violations, execFileSync, runnerSmokeTimeoutMs,
  mkdtempSync, tmpdir, join, writeFileSync, chmodSync, rmSync,
  durableBackendE2ePreflightEnv, childProcessErrorOutput, smokeOutputSnippet,
}) {
  function validateRunnerLocalRuntimePlanSmoke() {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-local-runtime-plan-'));
    try {
      const env = durableBackendE2ePreflightEnv(tempDirectory, {
        API_BASE_URL: 'http://127.0.0.1:3000',
      });
      const result = runRunnerJsonPlanSmoke(
        'durable-backend-e2e-loop',
        env,
      );
      if (result.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: runner local runtime plan smoke must produce a JSON plan: ${smokeOutputSnippet(result.output)}`);
        return;
      }
      const plan = result.plan;
      const job = plan.jobs?.[0];
      if (job?.executionReadiness !== 'blocked_local_runtime_env') {
        violations.push(`${contract.runnerFile}: local Docker runtime evidence must be classified as blocked_local_runtime_env`);
      }
      if (plan.blockedLocalRuntimeEnvJobCount !== 1) {
        violations.push(`${contract.runnerFile}: local runtime plan must count blockedLocalRuntimeEnvJobCount=1`);
      }
      if (plan.readinessCounts?.blocked_local_runtime_env !== 1) {
        violations.push(`${contract.runnerFile}: local runtime plan must include blocked_local_runtime_env readiness count`);
      }
      if (plan.blockedInvalidInputJobCount !== 0) {
        violations.push(`${contract.runnerFile}: local runtime plan must not count local runtime URLs as generic invalid input`);
      }
  
      const handoffResult = runRunnerTextHandoffSmoke('durable-backend-e2e-loop', env);
      if (handoffResult.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: runner local runtime handoff smoke must produce text handoff: ${smokeOutputSnippet(handoffResult.output)}`);
        return;
      }
      for (const expectedText of ['Blocked by local runtime env: 1', 'Readiness: blocked_local_runtime_env']) {
        if (!handoffResult.output.includes(expectedText)) {
          violations.push(`${contract.runnerFile}: local runtime handoff smoke must include "${expectedText}"`);
        }
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
  
  function validateRunnerDockerBundleAlternativeSmoke() {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-docker-bundle-alternative-'));
    try {
      const bundlePath = join(tempDirectory, 'backend-staging-evidence-bundle.json');
      writeFileSync(bundlePath, JSON.stringify({
        schemaVersion: 1,
        artifactId: 'backend-staging-evidence-bundle-redacted-smoke',
        provenance: {
          evidenceKind: 'local_docker_staging',
          fixtureOnly: false,
        },
        redaction: {
          secretsIncluded: false,
          rawConnectionUrlsIncluded: false,
        },
      }, null, 2));
      chmodSync(bundlePath, 0o600);
  
      const cases = [
        {
          jobId: 'durable-runtime-staging-proof',
          coveredEnv: 'API_BASE_URL',
          env: {
            BACKEND_IMAGE_DIGEST: `sha256:${'1'.repeat(64)}`,
            BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
            DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH: join(tempDirectory, 'durable-runtime-selector.json'),
            STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
          },
        },
        {
          jobId: 'rabbitmq-staging-reliability-drill',
          coveredEnv: 'RABBITMQ_URL',
          env: {
            BACKEND_IMAGE_DIGEST: `sha256:${'2'.repeat(64)}`,
            BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
            RABBITMQ_STAGING_DRILL_ARTIFACT_PATH: join(tempDirectory, 'rabbitmq-staging-drill.json'),
            STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
          },
        },
        {
          jobId: 'postgres-restore-migration-drill',
          coveredEnv: 'DATABASE_URL',
          env: {
            BACKEND_IMAGE_DIGEST: `sha256:${'3'.repeat(64)}`,
            BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
            POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: join(tempDirectory, 'postgres-restore-drill.json'),
            STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
          },
        },
        {
          jobId: 'durable-backend-e2e-loop',
          coveredEnv: 'API_BASE_URL',
          env: durableBackendE2ePreflightEnv(tempDirectory, {
            API_BASE_URL: '',
            BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
            STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
          }),
        },
        {
          jobId: 'release-deploy-smoke',
          coveredEnv: 'API_BASE_URL',
          env: {
            BACKEND_IMAGE_DIGEST: `sha256:${'4'.repeat(64)}`,
            BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
            RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: join(tempDirectory, 'release-deploy-smoke.json'),
            STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
          },
        },
      ];
  
      for (const currentCase of cases) {
        const result = runRunnerJsonPlanSmoke(currentCase.jobId, currentCase.env);
        if (result.exitCode !== 0) {
          violations.push(`${contract.runnerFile}: Docker bundle alternative plan smoke for ${currentCase.jobId} must produce a JSON plan: ${smokeOutputSnippet(result.output)}`);
          continue;
        }
        const job = result.plan.jobs?.[0];
        if (job?.executionReadiness !== 'manual_artifact_required') {
          violations.push(`${contract.runnerFile}: Docker bundle alternative for ${currentCase.jobId} must be manual_artifact_required`);
        }
        if (job?.missingEnv?.includes(currentCase.coveredEnv)) {
          violations.push(`${contract.runnerFile}: Docker bundle alternative for ${currentCase.jobId} must cover ${currentCase.coveredEnv}`);
        }
        if (result.plan.blockedMissingRequiredEnvJobCount !== 0) {
          violations.push(`${contract.runnerFile}: Docker bundle alternative for ${currentCase.jobId} must not count missing required env`);
        }
        if (result.plan.blockedInvalidInputJobCount !== 0) {
          violations.push(`${contract.runnerFile}: Docker bundle alternative for ${currentCase.jobId} must not count invalid input`);
        }
        if (result.plan.blockedLocalRuntimeEnvJobCount !== 0) {
          violations.push(`${contract.runnerFile}: Docker bundle alternative for ${currentCase.jobId} must not count local runtime env`);
        }
      }
  
      const handoffResult = runRunnerTextHandoffSmoke('durable-backend-e2e-loop', cases[3].env);
      if (handoffResult.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: Docker bundle alternative handoff smoke must produce text handoff: ${smokeOutputSnippet(handoffResult.output)}`);
      } else if (!handoffResult.output.includes('BACKEND_STAGING_EVIDENCE_BUNDLE_PATH covers API_BASE_URL')) {
        violations.push(`${contract.runnerFile}: Docker bundle alternative handoff must explain covered API_BASE_URL`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
  
  function runRunnerTextHandoffSmoke(jobId, env) {
    try {
      const output = execFileSync(
        process.execPath,
        [
          contract.runnerFile,
          '--handoff',
          '--job',
          jobId,
        ],
        {
          env: {
            PATH: process.env.PATH ?? '',
            ...env,
          },
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: runnerSmokeTimeoutMs,
        },
      );
      return { exitCode: 0, output };
    } catch (error) {
      return {
        exitCode: typeof error.status === 'number' ? error.status : 1,
        output: childProcessErrorOutput(error),
      };
    }
  }
  
  function runRunnerJsonPlanSmoke(jobId, env) {
    try {
      const output = execFileSync(
        process.execPath,
        [
          contract.runnerFile,
          '--plan',
          '--json',
          '--job',
          jobId,
        ],
        {
          env: {
            PATH: process.env.PATH ?? '',
            ...env,
          },
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: runnerSmokeTimeoutMs,
        },
      );
      return { exitCode: 0, output, plan: JSON.parse(output) };
    } catch (error) {
      return {
        exitCode: typeof error.status === 'number' ? error.status : 1,
        output: childProcessErrorOutput(error),
        plan: undefined,
      };
    }
  }
  
  return {
    validateRunnerLocalRuntimePlanSmoke,
    validateRunnerDockerBundleAlternativeSmoke,
  };
}
