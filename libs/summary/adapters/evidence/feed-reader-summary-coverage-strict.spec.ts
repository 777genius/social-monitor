import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('coverage owns health and the complete feed workflow under strict Node', () => {
  it.each([
    ['ownership', 'candidate'],
    ['ownership', 'pagination'],
    ['ownership', 'early-exits'],
  ])('%s: %s returns failures without crashing', (support, scenario) => {
    const output = execFileSync(process.execPath, [
      '--unhandled-rejections=strict',
      '--max-old-space-size=4096',
      '-r', 'ts-node/register/transpile-only',
      '-r', 'tsconfig-paths/register',
      resolve(__dirname, `feed-reader-summary-coverage-${support}.spec-support.ts`),
      scenario,
    ], {
      cwd: process.cwd(),
      env: { ...process.env, TS_NODE_PROJECT: 'test/tsconfig.jest.json' },
      encoding: 'utf8',
      timeout: 20_000,
    });
    expect(output.trim()).toBe(`verified ${scenario}`);
  }, 25_000);
});
