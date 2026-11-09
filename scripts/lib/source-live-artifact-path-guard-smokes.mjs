import { execFileSync as defaultExecFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export function createSourceLiveArtifactPathGuardSmokes({
  violations, liveOpenCaptureScriptPath, githubTrendingPageCaptureScriptPath,
  redditLiveCaptureScriptPath, redditLiveScriptPath, localTsNodePath,
  execFileSync = defaultExecFileSync,
}) {
  function validateCaptureOutputPathGuards() {
    const openWorkspaceArtifactPath = resolve('live-open-connectors-workspace-output.json');
    const openResult = runCaptureExpectingFailure(liveOpenCaptureScriptPath, {
      LIVE_OPEN_CONNECTORS_EVIDENCE_PATH: openWorkspaceArtifactPath,
      LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH: '/tmp/social-monitor-live-open-connectors.env',
      SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
      BACKEND_IMAGE_DIGEST: `sha256:${'a'.repeat(64)}`,
      BACKEND_GIT_COMMIT_SHA: 'a'.repeat(40),
      SOURCE_LIVE_OPERATOR: 'source-owner-1',
    });
    if (openResult.exitCode === 0) {
      violations.push(`${liveOpenCaptureScriptPath}: capture must reject workspace LIVE_OPEN_CONNECTORS_EVIDENCE_PATH`);
    } else if (!openResult.output.includes('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH must not write release evidence into the git workspace')) {
      violations.push(`${liveOpenCaptureScriptPath}: workspace artifact path rejection must explain evidence path policy`);
    }
    if (existsSync(openWorkspaceArtifactPath)) {
      violations.push(`${liveOpenCaptureScriptPath}: workspace artifact path rejection must not create ${openWorkspaceArtifactPath}`);
    }

    const githubTrendingPageWorkspaceArtifactPath = resolve('github-trending-page-live-workspace-output.json');
    const githubTrendingPageResult = runCaptureExpectingFailure(githubTrendingPageCaptureScriptPath, {
      GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH: githubTrendingPageWorkspaceArtifactPath,
      GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_ENV_PATH: '/tmp/social-monitor-live-github-trending-page.env',
      SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
      BACKEND_IMAGE_DIGEST: `sha256:${'c'.repeat(64)}`,
      BACKEND_GIT_COMMIT_SHA: 'c'.repeat(40),
      SOURCE_LIVE_OPERATOR: 'source-owner-1',
    });
    if (githubTrendingPageResult.exitCode === 0) {
      violations.push(`${githubTrendingPageCaptureScriptPath}: capture must reject workspace GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH`);
    } else if (!githubTrendingPageResult.output.includes('GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH must not write release evidence into the git workspace')) {
      violations.push(`${githubTrendingPageCaptureScriptPath}: workspace artifact path rejection must explain evidence path policy`);
    }
    if (existsSync(githubTrendingPageWorkspaceArtifactPath)) {
      violations.push(`${githubTrendingPageCaptureScriptPath}: workspace artifact path rejection must not create ${githubTrendingPageWorkspaceArtifactPath}`);
    }

    const redditWorkspaceArtifactPath = resolve('live-reddit-oauth-workspace-output.json');
    const redditResult = runCaptureExpectingFailure(redditLiveCaptureScriptPath, {
      REDDIT_ACCESS_TOKEN: 'reddit-live-access-token-for-path-guard',
      REDDIT_LIVE_EVIDENCE_PATH: redditWorkspaceArtifactPath,
      REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: '/tmp/social-monitor-reddit-credential-lifecycle.json',
      REDDIT_LIVE_EVIDENCE_ENV_PATH: '/tmp/social-monitor-live-reddit-oauth.env',
      SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
      BACKEND_IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`,
      BACKEND_GIT_COMMIT_SHA: 'b'.repeat(40),
      SOURCE_LIVE_OPERATOR: 'source-owner-1',
    });
    if (redditResult.exitCode === 0) {
      violations.push(`${redditLiveCaptureScriptPath}: capture must reject workspace REDDIT_LIVE_EVIDENCE_PATH`);
    } else if (!redditResult.output.includes('REDDIT_LIVE_EVIDENCE_PATH must not write release evidence into the git workspace')) {
      violations.push(`${redditLiveCaptureScriptPath}: workspace artifact path rejection must explain evidence path policy`);
    }
    if (existsSync(redditWorkspaceArtifactPath)) {
      violations.push(`${redditLiveCaptureScriptPath}: workspace artifact path rejection must not create ${redditWorkspaceArtifactPath}`);
    }

    const redditLifecycleWorkspaceArtifactPath = resolve('reddit-credential-lifecycle-workspace-output.json');
    const redditLifecycleResult = runCaptureExpectingFailure(redditLiveCaptureScriptPath, {
      REDDIT_ACCESS_TOKEN: 'reddit-live-access-token-for-path-guard',
      REDDIT_LIVE_EVIDENCE_PATH: '/tmp/social-monitor-live-reddit-oauth.json',
      REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: redditLifecycleWorkspaceArtifactPath,
      REDDIT_LIVE_EVIDENCE_ENV_PATH: '/tmp/social-monitor-live-reddit-oauth.env',
      SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
      BACKEND_IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`,
      BACKEND_GIT_COMMIT_SHA: 'b'.repeat(40),
      SOURCE_LIVE_OPERATOR: 'source-owner-1',
    });
    if (redditLifecycleResult.exitCode === 0) {
      violations.push(`${redditLiveCaptureScriptPath}: capture must reject workspace REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH`);
    } else if (!redditLifecycleResult.output.includes('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must not write release evidence into the git workspace')) {
      violations.push(`${redditLiveCaptureScriptPath}: workspace lifecycle artifact path rejection must explain evidence path policy`);
    }
    if (existsSync(redditLifecycleWorkspaceArtifactPath)) {
      violations.push(`${redditLiveCaptureScriptPath}: workspace lifecycle artifact path rejection must not create ${redditLifecycleWorkspaceArtifactPath}`);
    }
  }

  function runCaptureExpectingFailure(scriptPath, env) {
    try {
      execFileSync(process.execPath, [scriptPath], {
        env: {
          ...process.env,
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

  function validateDirectRedditLifecyclePathGuards() {
    const workspaceLifecycleArtifactPath = resolve('reddit-live-direct-lifecycle-workspace-output.json');
    const workspaceResult = runLiveRedditSmokeExpectingFailure({
      REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: workspaceLifecycleArtifactPath,
    });
    if (workspaceResult.exitCode === 0) {
      violations.push(`${redditLiveScriptPath}: direct live smoke must reject workspace REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH`);
    } else if (!workspaceResult.output.includes('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must not write release evidence into the git workspace')) {
      violations.push(`${redditLiveScriptPath}: direct workspace lifecycle rejection must explain evidence path policy`);
    }
    if (existsSync(workspaceLifecycleArtifactPath)) {
      violations.push(`${redditLiveScriptPath}: direct workspace lifecycle rejection must not create ${workspaceLifecycleArtifactPath}`);
    }

    const tempDirectory = mkdtempSync(join(tmpdir(), 'reddit-live-direct-lifecycle-'));
    try {
      const publicLifecycleArtifactPath = join(tempDirectory, 'reddit-credential-lifecycle.json');
      writeFileSync(publicLifecycleArtifactPath, '{}\n', { mode: 0o600 });
      chmodSync(publicLifecycleArtifactPath, 0o644);
      const publicModeResult = runLiveRedditSmokeExpectingFailure({
        REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: publicLifecycleArtifactPath,
      });
      if (publicModeResult.exitCode === 0) {
        violations.push(`${redditLiveScriptPath}: direct live smoke must reject public lifecycle artifact permissions`);
      } else if (!publicModeResult.output.includes('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must use 0600-style private file permissions')) {
        violations.push(`${redditLiveScriptPath}: direct public lifecycle rejection must explain private file mode policy`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }

  function runLiveRedditSmokeExpectingFailure(env) {
    try {
      execFileSync(
        process.execPath,
        [
          'scripts/run-with-timeout.mjs',
          '--timeout-ms',
          '45000',
          '--node-options',
          '--max-old-space-size=1024',
          '--',
          localTsNodePath,
          '-r',
          'tsconfig-paths/register',
          redditLiveScriptPath,
        ],
        {
          env: {
            ...process.env,
            REDDIT_ACCESS_TOKEN: 'reddit-live-access-token-for-direct-path-guard',
            REDDIT_LIVE_EVIDENCE_PATH: '/tmp/social-monitor-live-reddit-direct-path-guard.json',
            SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
            BACKEND_IMAGE_DIGEST: `sha256:${'c'.repeat(64)}`,
            BACKEND_GIT_COMMIT_SHA: 'c'.repeat(40),
            SOURCE_LIVE_OPERATOR: 'source-owner-1',
            ...env,
          },
          encoding: 'utf8',
          stdio: 'pipe',
        },
      );
      return { exitCode: 0, output: '' };
    } catch (error) {
      return {
        exitCode: typeof error.status === 'number' ? error.status : 1,
        output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
      };
    }
  }

  return { validateCaptureOutputPathGuards, validateDirectRedditLifecyclePathGuards };
}
