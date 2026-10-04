#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { CORE_SCHEMA, load } = require('js-yaml') as {
  readonly CORE_SCHEMA: object;
  load(source: string, options: { schema: object; json: false }): unknown;
};
const WORKFLOW = '.github/workflows/pull-request.yml';
const FRAGMENT = 'ops/ci/release-candidate-job.yml';
const CHECKOUT = 'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10';
const NODE = 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e';
const DOCKER = 'docker/setup-docker-action@2bf61fb9464cc67f0cbdeabed6aa0380accd1c70';
const UPLOAD = 'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f';
const DIRECTORY = '${{ runner.temp }}/api-candidate-${{ github.run_id }}';
const ROOT_ENV = {
  DATABASE_URL: 'postgresql://social_monitor_ci:social_monitor_local_password@127.0.0.1:5432/social_monitor_ci',
};
const GATES = [
  'npm run check:container',
  'npm run check:runtime-compose',
  'npm run check:production-deploy-lifecycle',
];
const HELPER = [
  'set -euo pipefail',
  'node scripts/ci/release-candidate.mjs \\',
  '--directory "$CANDIDATE_DIRECTORY" \\',
  '--source-sha "$GITHUB_SHA" --run-id "$GITHUB_RUN_ID" \\',
  '--controller-dir ops/release/hetzner',
].join('\n');
const FILES = [
  'candidate.tar', 'candidate.tar.sha256', 'manifest.json', 'phases.json',
  'image-id.txt', 'source-sha.txt',
];

type Mapping = Record<string, unknown>;
function mapping(value: unknown): value is Mapping {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function onlyKeys(value: Mapping, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function commands(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).join('\n');
}
function action(step: Mapping | undefined, uses: string, options: Mapping): boolean {
  return step !== undefined && onlyKeys(step, ['name', 'uses', 'with']) &&
    typeof step.name === 'string' && step.name.length > 0 &&
    step.uses === uses && isDeepStrictEqual(step.with, options);
}
function run(step: Mapping | undefined, expected: string, env?: Mapping): boolean {
  return step !== undefined && onlyKeys(step, env === undefined
    ? ['name', 'run'] : ['name', 'run', 'env']) &&
    typeof step.name === 'string' && step.name.length > 0 &&
    commands(step.run) === expected && isDeepStrictEqual(step.env, env);
}

export function candidateWorkflowViolations(workflow: unknown, fragment: unknown): string[] {
  const fail = [`${WORKFLOW}: production_runtime must match ${FRAGMENT} and run the unconditional, read-only, exact-SHA candidate contract`];
  if (!mapping(workflow) || !mapping(fragment) || !onlyKeys(fragment, ['production_runtime']) ||
      !mapping(workflow.jobs) || !mapping(workflow.jobs.production_runtime) ||
      !mapping(fragment.production_runtime)) return fail;
  const job = workflow.jobs.production_runtime;
  if (!isDeepStrictEqual(job, fragment.production_runtime) || !isDeepStrictEqual(workflow.permissions, { contents: 'read' }) ||
      !isDeepStrictEqual(workflow.env, ROOT_ENV) || workflow.defaults !== undefined ||
      !onlyKeys(job, ['name', 'runs-on', 'timeout-minutes', 'permissions', 'steps']) ||
      job.name !== 'Production container and deploy lifecycle' ||
      job['runs-on'] !== 'ubuntu-latest' || job['timeout-minutes'] !== 45 ||
      !isDeepStrictEqual(job.permissions, { contents: 'read' }) || !Array.isArray(job.steps) ||
      job.steps.length !== 8 || !job.steps.every(mapping)) return fail;
  const steps = job.steps as Mapping[];
  if (!action(steps[0], CHECKOUT, {
    ref: '${{ github.sha }}',
    'fetch-depth': 0, 'persist-credentials': false,
  }) || !action(steps[1], NODE, { 'node-version': 22 }) ||
      !action(steps[2], DOCKER, {
        version: 'v29.8.2', 'set-host': true,
        'daemon-config': '{"features":{"containerd-snapshotter":true}}',
      }) || !run(steps[3], ['set -euo pipefail', ...GATES].join('\n')) ||
      !run(steps[4], ['set -euo pipefail',
        'node --test scripts/ci/release-candidate.test.mjs ops/release/e2e/harness.test.mjs',
        'node --experimental-strip-types --test scripts/ci/candidate-runtime.test.mts'].join('\n')) ||
      !run(steps[5], HELPER, {
        CANDIDATE_DIRECTORY: DIRECTORY,
      })) return fail;
  if (!action(steps[6], UPLOAD, {
    name: 'api-candidate-${{ github.sha }}-${{ github.run_id }}',
    path: FILES.map((file) => `${DIRECTORY}/${file}`).join('\n') + '\n',
    'if-no-files-found': 'error', 'retention-days': 1,
  })) return fail;
  const evidence = steps[7];
  if (evidence === undefined || !onlyKeys(evidence, ['name', 'if', 'uses', 'with']) ||
      typeof evidence.name !== 'string' || evidence.name.length === 0 ||
      evidence.if !== 'failure()' || evidence.uses !== UPLOAD ||
      !isDeepStrictEqual(evidence.with, {
        name: 'api-candidate-phases-${{ github.sha }}-${{ github.run_id }}',
        path: `${DIRECTORY}/phases.json`,
        'if-no-files-found': 'ignore', 'retention-days': 1,
      })) return fail;
  return [];
}

function parse(source: string): unknown {
  if (Buffer.byteLength(source) === 0 || Buffer.byteLength(source) > 256 * 1024) {
    throw new Error('Nonempty YAML within 256 KiB required');
  }
  return load(source, { schema: CORE_SCHEMA, json: false });
}

export function candidateWorkflowSourceViolations(
  workflowSource: string, fragmentSource: string,
): string[] {
  try {
    return candidateWorkflowViolations(parse(workflowSource), parse(fragmentSource));
  } catch {
    return [`${WORKFLOW} and ${FRAGMENT}: invalid YAML, duplicate mapping key, or invalid bounded document`];
  }
}

export function main(): void {
  let violations: string[];
  try {
    violations = candidateWorkflowSourceViolations(
      readFileSync(WORKFLOW, 'utf8'), readFileSync(FRAGMENT, 'utf8'),
    );
  } catch {
    violations = [`${WORKFLOW} and ${FRAGMENT}: canonical candidate documents could not be read or checked`];
  }
  if (violations.length > 0) {
    process.stderr.write(violations.join('\n') + '\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Release candidate workflow contract OK\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
