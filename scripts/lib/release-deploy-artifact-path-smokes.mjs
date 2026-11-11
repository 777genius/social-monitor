// Original capture and self-check guards retain their invocation-time IO and diagnostics.
export function createReleaseDeployArtifactPathSmokes({
  violations, execFileSync, process, existsSync, resolve,
  captureScriptPath, currentScriptPath, mkdtempSync, join, tmpdir,
  writeFileSync, chmodSync, rmSync,
}) {
  function validateCaptureOutputPathGuards() {
    const workspaceArtifactPath = resolve('release-deploy-smoke-workspace-output.json');
    const artifactResult = runCaptureExpectingFailure({
      RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: workspaceArtifactPath,
      RELEASE_DEPLOY_SMOKE_ENV_PATH: '/tmp/social-monitor-release-deploy-smoke.env',
    });
    if (artifactResult.exitCode === 0) {
      violations.push(`${captureScriptPath}: capture must reject workspace RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH`);
    } else if (!artifactResult.output.includes('RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH must not write release evidence into the git workspace')) {
      violations.push(`${captureScriptPath}: workspace artifact path rejection must explain evidence path policy`);
    }
    if (existsSync(workspaceArtifactPath)) {
      violations.push(`${captureScriptPath}: workspace artifact path rejection must not create ${workspaceArtifactPath}`);
    }

    const workspaceEnvPath = resolve('release-deploy-smoke.env');
    const tmpArtifactPath = '/tmp/social-monitor-release-deploy-smoke-output.json';
    const envResult = runCaptureExpectingFailure({
      RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: tmpArtifactPath,
      RELEASE_DEPLOY_SMOKE_ENV_PATH: workspaceEnvPath,
    });
    if (envResult.exitCode === 0) {
      violations.push(`${captureScriptPath}: capture must reject workspace RELEASE_DEPLOY_SMOKE_ENV_PATH`);
    } else if (!envResult.output.includes('Evidence env file path must not be inside the git workspace')) {
      violations.push(`${captureScriptPath}: workspace env path rejection must explain evidence env path policy`);
    }
    if (existsSync(workspaceEnvPath)) {
      violations.push(`${captureScriptPath}: workspace env path rejection must not create ${workspaceEnvPath}`);
    }
  }

  function runCaptureExpectingFailure(env) {
    try {
      execFileSync(process.execPath, [captureScriptPath], {
        env: {
          ...process.env,
          ...env,
          API_BASE_URL: 'https://staging-alpha.social-monitor.invalid',
          BACKEND_IMAGE_DIGEST: `sha256:${'c'.repeat(64)}`,
          STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
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

  function validateDirectArtifactPathGuards() {
    if (process.env.RELEASE_DEPLOY_SMOKE_DIRECT_PATH_GUARD_TEST === '1') {
      return;
    }

    const requiredEnv = {
      API_BASE_URL: 'https://staging-alpha.social-monitor.invalid',
      BACKEND_IMAGE_DIGEST: `sha256:${'c'.repeat(64)}`,
      STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    };
    const workspaceArtifactPath = resolve('release-deploy-smoke-direct-workspace-output.json');
    const workspaceResult = runSelfExpectingFailure({
      ...requiredEnv,
      RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: workspaceArtifactPath,
    });
    if (workspaceResult.exitCode === 0) {
      violations.push('check:release-artifact-evidence must reject workspace RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH');
    } else if (!workspaceResult.output.includes('RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH must not write release evidence into the git workspace')) {
      violations.push('check:release-artifact-evidence workspace artifact rejection must explain evidence path policy');
    }
    if (existsSync(workspaceArtifactPath)) {
      violations.push(`check:release-artifact-evidence workspace artifact rejection must not create ${workspaceArtifactPath}`);
    }

    const tempDirectory = mkdtempSync(join(tmpdir(), 'release-deploy-smoke-direct-'));
    try {
      const publicArtifactPath = join(tempDirectory, 'release-deploy-smoke.json');
      writeFileSync(publicArtifactPath, '{}\n', { mode: 0o600 });
      chmodSync(publicArtifactPath, 0o644);
      const publicResult = runSelfExpectingFailure({
        ...requiredEnv,
        RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: publicArtifactPath,
      });
      if (publicResult.exitCode === 0) {
        violations.push('check:release-artifact-evidence must reject public RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH permissions');
      } else if (!publicResult.output.includes('RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH must use 0600-style private file permissions')) {
        violations.push('check:release-artifact-evidence public artifact rejection must explain private file mode policy');
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }

  function runSelfExpectingFailure(env) {
    try {
      execFileSync(process.execPath, [currentScriptPath], {
        env: {
          ...process.env,
          RELEASE_DEPLOY_SMOKE_DIRECT_PATH_GUARD_TEST: '1',
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

  return { validateCaptureOutputPathGuards, validateDirectArtifactPathGuards };
}
