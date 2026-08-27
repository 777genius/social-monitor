import { spawnSync } from 'node:child_process';

const revision = (process.env.GITHUB_SHA ?? 'local').slice(0, 12).toLowerCase();
const image = `social-monitor-migration-runtime-ci:${revision}`;
const recoveryScript = '/app/scripts/check-feed-promotion-index-recovery.ts';

run('docker', [
  'build',
  '--file', 'Dockerfile',
  '--tag', image,
  '.',
]);

const probe = String.raw`
const fs = require('node:fs');
const target = ${JSON.stringify(recoveryScript)};
const stat = fs.statSync(target);
if (!stat.isFile() || (stat.mode & 0o444) === 0) {
  throw new Error('migration recovery script is not a readable regular file');
}
for (const dependency of ['ts-node/register', 'tsconfig-paths/register', 'pg']) {
  require.resolve(dependency);
}
require(target);
console.log('migration_image_runtime=ok');
`;

run('docker', [
  'run', '--rm', '--network', 'none',
  '--entrypoint', 'node', image,
  '-r', 'ts-node/register',
  '-r', 'tsconfig-paths/register',
  '-e', probe,
]);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args[0]} failed with status ${result.status}`);
  }
}
