export function createExternalBetaArtifactValidationSmokes({
  contract,
  execFileSync,
  artifactValidationSmokeTimeoutMs,
  releaseDeploySmokeImageDigest,
  childProcessErrorOutput,
}) {
  function runRunnerNegativeSmoke(artifactPath, options = {}) {
    return runRunnerArtifactSmoke(artifactPath, options);
  }

  function runRunnerSecurityFinalSweepArtifactSmoke(artifactPath, exportPaths, options = {}) {
    return runRunnerValidateArtifactsSmoke('security-final-sweep-staging', {
      LOG_EXPORT_PATH: exportPaths.logs.path,
      METRICS_EXPORT_PATH: exportPaths.metrics.path,
      PUBLIC_ERROR_EXPORT_PATH: exportPaths.publicErrors.path,
      AUDIT_EVENT_EXPORT_PATH: exportPaths.auditMetadata.path,
      SECURITY_FINAL_SWEEP_ARTIFACT_PATH: artifactPath,
    }, options);
  }

  function runRunnerCredentialRotationArtifactSmoke(sourceArtifactPath, webhookArtifactPath, options = {}) {
    return runRunnerValidateArtifactsSmoke('credential-secret-rotation-drill', {
      SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: sourceArtifactPath,
      STAGING_SECRET_STORE_ID: 'secret-store-staging-alpha-1',
      WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: webhookArtifactPath,
    }, options);
  }

  function runRunnerDurableRuntimeArtifactSmoke(artifactPath, options = {}) {
    const imageDigest = `sha256:${'d'.repeat(64)}`;
    return runRunnerValidateArtifactsSmoke('durable-runtime-staging-proof', {
      API_BASE_URL: 'https://api.staging.social-monitor.invalid',
      BACKEND_IMAGE_DIGEST: imageDigest,
      DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH: artifactPath,
      STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    }, options);
  }

  function runRunnerStagingReliabilityArtifactSmoke(config, artifactPath, options = {}) {
    return runRunnerValidateArtifactsSmoke(config.jobId, {
      BACKEND_IMAGE_DIGEST: config.imageDigest,
      STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
      [config.envName]: artifactPath,
      ...config.requiredEnv,
    }, options);
  }

  function runRunnerSummaryFeedbackArtifactSmoke(artifactPath, options = {}) {
    return runRunnerValidateArtifactsSmoke('summary-real-feedback-import', {
      SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: artifactPath,
    }, options);
  }

  function runRunnerReleaseDeployArtifactSmoke(artifactPath, options = {}) {
    return runRunnerValidateArtifactsSmoke('release-deploy-smoke', {
      API_BASE_URL: 'https://api.staging.social-monitor.invalid',
      BACKEND_IMAGE_DIGEST: releaseDeploySmokeImageDigest(),
      RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: artifactPath,
      STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    }, options);
  }

  function runRunnerArtifactSmoke(artifactPath, options = {}) {
    const imageDigest = `sha256:${'a'.repeat(64)}`;
    const commitSha = 'a'.repeat(40);
    return runRunnerValidateArtifactsSmoke('live-open-connectors', {
      BACKEND_IMAGE_DIGEST: imageDigest,
      BACKEND_GIT_COMMIT_SHA: commitSha,
      LIVE_OPEN_CONNECTORS_EVIDENCE_PATH: artifactPath,
      SOURCE_LIVE_ENVIRONMENT_ID: 'source-prod-alpha',
      SOURCE_LIVE_OPERATOR: 'release-operator-1',
    }, options);
  }

  function runRunnerRedditArtifactSmoke(liveArtifactPath, lifecyclePath, options = {}) {
    const imageDigest = `sha256:${'b'.repeat(64)}`;
    const commitSha = 'b'.repeat(40);
    return runRunnerValidateArtifactsSmoke('live-reddit-oauth', {
      BACKEND_IMAGE_DIGEST: imageDigest,
      BACKEND_GIT_COMMIT_SHA: commitSha,
      REDDIT_ACCESS_TOKEN: 'reddit-live-value-1234567890',
      REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecyclePath,
      REDDIT_LIVE_EVIDENCE_PATH: liveArtifactPath,
      SOURCE_LIVE_ENVIRONMENT_ID: 'source-reddit-alpha',
      SOURCE_LIVE_OPERATOR: 'source-operator-1',
    }, options);
  }

  function runRunnerValidateArtifactsSmoke(jobId, env, options = {}) {
    const args = [
      contract.runnerFile,
      '--validate-artifacts',
      '--require-env',
      '--job',
      jobId,
    ];
    if (options.contractSmokeArtifactOnly === true) {
      args.splice(2, 0, '--contract-smoke-artifact-only');
    }

    try {
      execFileSync(
        process.execPath,
        args,
        {
          env: {
            PATH: process.env.PATH ?? '',
            ...env,
          },
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: artifactValidationSmokeTimeoutMs,
        },
      );
      return { exitCode: 0, output: '' };
    } catch (error) {
      return {
        exitCode: typeof error.status === 'number' ? error.status : 1,
        output: childProcessErrorOutput(error),
      };
    }
  }

  return {
    runRunnerNegativeSmoke,
    runRunnerSecurityFinalSweepArtifactSmoke,
    runRunnerCredentialRotationArtifactSmoke,
    runRunnerDurableRuntimeArtifactSmoke,
    runRunnerStagingReliabilityArtifactSmoke,
    runRunnerSummaryFeedbackArtifactSmoke,
    runRunnerReleaseDeployArtifactSmoke,
    runRunnerArtifactSmoke,
    runRunnerRedditArtifactSmoke,
    runRunnerValidateArtifactsSmoke,
  };
}
