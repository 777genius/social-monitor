import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function createExternalBetaOutputSafetySmokes({
  contract,
  violations,
  completeExternalEvidencePreflightEnv,
  execFileSync,
  runnerSmokeTimeoutMs,
  childProcessErrorOutput,
  smokeOutputSnippet,
}) {
  function validateRunnerOutputRedactionSmoke() {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-output-redaction-'));
    try {
      const secrets = outputRedactionSecretValues();
      const env = {
        ...completeExternalEvidencePreflightEnv(tempDirectory),
        API_BASE_URL: `http://127.0.0.1:3000?access_token=${secrets.apiToken}`,
        DATABASE_URL: 'postgresql://runtime_user:...@127.0.0.1:54329/social_monitor',
        RABBITMQ_URL: 'amqp://runtime_user:...@127.0.0.1:56729/social_monitor',
        REDDIT_ACCESS_TOKEN: secrets.redditAccessToken,
        REDDIT_CLIENT_SECRET: secrets.redditClientSecret,
        REDDIT_REFRESH_TOKEN: secrets.redditRefreshToken,
      };

      const smokeCommands = [
        { label: 'JSON plan', args: ['--plan', '--json'] },
        { label: 'summary', args: ['--summary'] },
        { label: 'text handoff', args: ['--handoff'] },
        { label: 'JSON handoff', args: ['--handoff-json'] },
      ];

      for (const smokeCommand of smokeCommands) {
        const result = runRunnerOutputSmoke(smokeCommand.args, env);
        if (result.exitCode !== 0) {
          violations.push(`${contract.runnerFile}: runner ${smokeCommand.label} redaction smoke must succeed: ${smokeOutputSnippet(result.output)}`);
          continue;
        }
        assertNoRunnerOutputSecrets(result.output, smokeCommand.label, secrets.forbiddenOutputFragments);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }

  function validateRunnerEnvFileSmokes() {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-env-file-'));
    try {
      const envFilePath = join(tempDirectory, 'external-beta-evidence.env');
      writeEnvFile(envFilePath, completeExternalEvidencePreflightEnv(tempDirectory));
      const positiveResult = runRunnerOutputSmoke(['--summary', '--env-file', envFilePath], {});
      if (positiveResult.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: runner env-file summary smoke must accept private env file: ${smokeOutputSnippet(positiveResult.output)}`);
      } else if (!positiveResult.output.includes('External evidence env readiness: 13/13 live/manual jobs (100%)')) {
        violations.push(`${contract.runnerFile}: runner env-file summary smoke must load required env values`);
      }

      const conflictPath = join(tempDirectory, 'conflicting-external-beta-evidence.env');
      writeEnvFile(conflictPath, {
        BACKEND_IMAGE_DIGEST: `sha256:${'0'.repeat(64)}`,
      });
      const conflictResult = runRunnerOutputSmoke(['--summary', '--env-file', envFilePath, '--env-file', conflictPath], {});
      if (conflictResult.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner env-file conflict smoke must reject conflicting values`);
      } else if (!conflictResult.output.includes('conflicts with')) {
        violations.push(`${contract.runnerFile}: runner env-file conflict smoke must explain conflicting values`);
      }

      const confirmationPath = join(tempDirectory, 'confirmation-external-beta-evidence.env');
      writeEnvFile(confirmationPath, {
        EXTERNAL_BETA_EVIDENCE_CONFIRM: 'run-live',
      });
      const confirmationResult = runRunnerOutputSmoke(['--summary', '--env-file', confirmationPath], {});
      if (confirmationResult.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner env-file confirmation smoke must reject live execution confirmation in env file`);
      } else if (!confirmationResult.output.includes('EXTERNAL_BETA_EVIDENCE_CONFIRM must be set explicitly in the operator shell')) {
        violations.push(`${contract.runnerFile}: runner env-file confirmation smoke must explain confirmation shell policy`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }

  function writeEnvFile(path, env) {
    const lines = Object.entries(env)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([name, value]) => `${name}='${String(value).replaceAll("'", "'\\''")}'`);
    writeFileSync(path, `${lines.join('\n')}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
  }

  function outputRedactionSecretValues() {
    const values = {
      apiToken: 'runtime-api-token-value-1234567890',
      redditAccessToken: 'reddit-runtime-access-value-1234567890',
      redditClientSecret: 'reddit-runtime-client-secret-value-1234567890',
      redditRefreshToken: 'reddit-runtime-refresh-value-1234567890',
    };
    return {
      ...values,
      forbiddenOutputFragments: [
        values.apiToken,
        values.redditAccessToken,
        values.redditClientSecret,
        values.redditRefreshToken,
        'postgresql://runtime_user:...@127.0.0.1:54329/social_monitor',
        'amqp://runtime_user:...@127.0.0.1:56729/social_monitor',
        '127.0.0.1:54329',
        '127.0.0.1:56729',
      ],
    };
  }

  function assertNoRunnerOutputSecrets(output, label, forbiddenOutputFragments) {
    for (const fragment of forbiddenOutputFragments) {
      if (String(output).includes(fragment)) {
        violations.push(`${contract.runnerFile}: runner ${label} output must not print raw env value fragment "${fragment}"`);
      }
    }
  }

  function runRunnerOutputSmoke(args, env) {
    try {
      const output = execFileSync(
        process.execPath,
        [
          contract.runnerFile,
          ...args,
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

  return { validateRunnerOutputRedactionSmoke, validateRunnerEnvFileSmokes };
}
