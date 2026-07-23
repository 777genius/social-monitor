#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const jestPath = join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'jest.cmd' : 'jest',
);

const e2eSpecs = [
  'test/e2e/user-jwt-auth-boundary.e2e-spec.ts',
  'test/e2e/api-keys.user-jwt-management.e2e-spec.ts',
  'test/e2e/scan-dead-letters.authorization.e2e-spec.ts',
  'test/e2e/usage-audit-events.list.e2e-spec.ts',
  'test/e2e/production-auth-boundary-matrix.e2e-spec.ts',
];

if (!existsSync(jestPath)) {
  console.error(`Local Jest binary not found at ${jestPath}`);
  process.exit(1);
}

console.log(`Running user auth boundary e2e (${e2eSpecs.length} specs)`);
execFileSync(
  process.execPath,
  [
    'scripts/run-with-timeout.mjs',
    '--timeout-ms',
    '600000',
    '--clean-env',
    '--node-options',
    '--max-old-space-size=1536',
    '--',
    jestPath,
    '--config',
    'test/jest-e2e.config.ts',
    '--runInBand',
    '--runTestsByPath',
    ...e2eSpecs,
  ],
  {
    stdio: 'inherit',
  },
);

console.log(`User auth boundary OK (${e2eSpecs.length} e2e specs)`);
