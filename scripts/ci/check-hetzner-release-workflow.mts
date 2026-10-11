import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { CORE_SCHEMA, load } = require('js-yaml') as {
  readonly CORE_SCHEMA: object;
  load(source: string, options: { schema: object; json: false }): unknown;
};
const C: typeof import('./review-ci/release-workflow-contract.mjs') =
  require('./review-ci/release-workflow-contract.mts');
const WORKFLOW = '.github/workflows/hetzner-release.yml';

export function workflowSourceViolations(source: string): string[] {
  if (Buffer.byteLength(source) === 0 || Buffer.byteLength(source) > 256 * 1024) {
    return [`${WORKFLOW}: nonempty YAML within 256 KiB required`];
  }
  let value: unknown;
  try {
    // YAML 1.2 keeps "on" a string and merge keys literal. Default duplicate
    // rejection remains explicit even if parser defaults change.
    value = load(source, { schema: CORE_SCHEMA, json: false });
  } catch {
    return [`${WORKFLOW}: invalid YAML or duplicate mapping key`];
  }
  return C.releaseWorkflowViolations(value);
}

export function main(): void {
  let violations: string[];
  try {
    violations = workflowSourceViolations(readFileSync(WORKFLOW, 'utf8'));
  } catch {
    violations = [`${WORKFLOW}: canonical workflow could not be read or checked`];
  }
  if (violations.length > 0) {
    process.stderr.write(violations.join('\n') + '\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Hetzner release workflow contract OK\n');
}

if (process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
