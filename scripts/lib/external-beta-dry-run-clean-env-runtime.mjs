import { execFileSync } from 'node:child_process';

export function readRunnerJsonWithCleanEnv(args) {
  const output = execFileSync(
    process.execPath,
    ['scripts/external-beta-evidence-runner.mjs', ...args],
    {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
      },
    },
  );
  return JSON.parse(output);
}
