export function createExternalBetaPreflightCommandSmokes({
  contract, violations, execFileSync, runnerSmokeTimeoutMs,
  preflightNegativeSmokeScenarios, mkdtempSync, tmpdir, join, rmSync,
  completeExternalEvidencePreflightEnv, redditOAuthPreflightEnv,
  childProcessErrorOutput, smokeOutputSnippet,
}) {
  function validateRunnerPreflightNegativeSmokes() {
    const scenarios = preflightNegativeSmokeScenarios();

    for (const scenario of scenarios) {
      const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-preflight-negative-'));
      try {
        const result = runRunnerPreflightNegativeSmoke(scenario.jobId, scenario.env(tempDirectory));
        if (result.exitCode === 0) {
          violations.push(`${contract.runnerFile}: runner preflight negative smoke must reject ${scenario.label}`);
          continue;
        }
        for (const expectedOutput of scenario.expectedOutput) {
          if (!result.output.includes(expectedOutput)) {
            violations.push(`${contract.runnerFile}: runner preflight negative smoke for ${scenario.label} must report "${expectedOutput}"`);
          }
        }
      } finally {
        rmSync(tempDirectory, { recursive: true, force: true });
      }
    }
  }

  function runRunnerPreflightNegativeSmoke(jobId, env) {
    try {
      execFileSync(
        process.execPath,
        [
          contract.runnerFile,
          '--require-env',
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
      return { exitCode: 0, output: '' };
    } catch (error) {
      return {
        exitCode: typeof error.status === 'number' ? error.status : 1,
        output: childProcessErrorOutput(error),
      };
    }
  }

  function validateRunnerPreflightPositiveSmoke() {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-preflight-positive-'));
    try {
      const result = runRunnerPreflightPositiveSmoke(completeExternalEvidencePreflightEnv(tempDirectory));
      if (result.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: runner positive preflight smoke must accept structurally valid required env: ${smokeOutputSnippet(result.output)}`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }

    const redditTempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-preflight-reddit-refresh-positive-'));
    try {
      const result = runRunnerPreflightPositiveSmoke(redditOAuthPreflightEnv(redditTempDirectory, {
        REDDIT_ACCESS_TOKEN: '',
        REDDIT_CLIENT_ID: 'reddit-client-id-prod-1',
        REDDIT_CLIENT_SECRET: 'reddit-client-secret-value-1234567890',
        REDDIT_REFRESH_TOKEN: 'reddit-refresh-token-value-1234567890',
      }), 'live-reddit-oauth');
      if (result.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: runner positive preflight smoke must accept Reddit refresh-token auth alternative: ${smokeOutputSnippet(result.output)}`);
      }
    } finally {
      rmSync(redditTempDirectory, { recursive: true, force: true });
    }

    const redditAppTempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-preflight-reddit-app-refresh-positive-'));
    try {
      const result = runRunnerPreflightPositiveSmoke(redditOAuthPreflightEnv(redditAppTempDirectory, {
        REDDIT_ACCESS_TOKEN: '',
        REDDIT_APP_CLIENT_ID: 'reddit-app-client-id-prod-1',
        REDDIT_APP_CLIENT_SECRET: 'reddit-app-client-secret-value-1234567890',
        REDDIT_REFRESH_TOKEN: 'reddit-refresh-token-value-1234567890',
      }), 'live-reddit-oauth');
      if (result.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: runner positive preflight smoke must accept Reddit app refresh-token auth alternative: ${smokeOutputSnippet(result.output)}`);
      }
    } finally {
      rmSync(redditAppTempDirectory, { recursive: true, force: true });
    }
  }

  function runRunnerPreflightPositiveSmoke(env, jobId) {
    const args = [
      contract.runnerFile,
      '--require-env',
    ];
    if (jobId !== undefined) {
      args.push('--job', jobId);
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
          timeout: runnerSmokeTimeoutMs,
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
    validateRunnerPreflightNegativeSmokes,
    validateRunnerPreflightPositiveSmoke,
  };
}
