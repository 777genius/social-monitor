import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// Existing CommonJS parser has no declarations; keep its boundary narrow.
const { CORE_SCHEMA, load, dump: stringify } = createRequire(import.meta.url)('js-yaml') as {
  readonly CORE_SCHEMA: object;
  load(text: string, options: { schema: object }): unknown;
  dump(value: unknown): string;
};
const C: typeof import('./release-workflow-contract.mjs') =
  createRequire(resolve('scripts/ci/review-ci/release-workflow-contract.test.mts'))('./release-workflow-contract.mts');
type Map = Record<string, unknown>;
const source = readFileSync(resolve('.github/workflows/hetzner-release.yml'), 'utf8');
function map(value: unknown): Map {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Map;
}
function parse(text: string): unknown {
  // CORE_SCHEMA follows YAML 1.2 and leaves merge keys as literal policy input.
  // Duplicate mapping keys are rejected by the existing parser's default mode.
  return load(text, { schema: CORE_SCHEMA });
}
function accepted(text: string): boolean {
  try { return C.releaseWorkflowViolations(parse(text)).length === 0; }
  catch { return false; }
}
function job(value: Map, name: string): Map { return map(map(value.jobs)[name]); }
function steps(value: Map, name: string): Map[] {
  const sequence = job(value, name).steps;
  assert.ok(Array.isArray(sequence)); return sequence.map(map);
}
function changed(mutate: (value: Map) => void): string {
  const value = map(parse(source)); mutate(value);
  return stringify(value);
}

test('canonical workflow passes default YAML 1.2 parsing and the finite policy contract', () => {
  assert.equal(accepted(source), true);
  assert.deepEqual(C.releaseWorkflowViolations(parse(source)), []);
});

test('parsed policy mutations cannot smuggle environment, write permissions, secrets or jobs', () => {
  const mutations: [string, (value: Map) => void][] = [
    ['workflow BASH_ENV', value => { value.env = { BASH_ENV: '/untrusted' }; }],
    ['job PATH', value => { job(value, 'candidate').env = { PATH: '/untrusted' }; }],
    ['precheckout environment', value => { map(steps(value, 'candidate')[1]!.env).BASH_ENV = '/untrusted'; }],
    ['candidate token injection', value => { map(steps(value, 'candidate')[5]!.env).GH_TOKEN = '${{ secrets.WRITE_TOKEN }}'; }],
    ['gate secret injection', value => { map(steps(value, 'activate')[5]!.env).HETZNER_PRIVATE_KEY = '${{ secrets.HETZNER_PRIVATE_KEY }}'; }],
    ['top-level write', value => { value.permissions = { contents: 'write' }; }],
    ['candidate write', value => { map(job(value, 'candidate').permissions).actions = 'write'; }],
    ['host write', value => { map(job(value, 'activate').permissions).contents = 'write'; }],
    ['extra job', value => { map(value.jobs).untrusted = { 'runs-on': 'ubuntu-latest', steps: [] }; }],
    ['extra step', value => { const sequence = job(value, 'candidate').steps; assert.ok(Array.isArray(sequence)); sequence.push({ run: 'echo untrusted' }); }],
    ['candidate secret', value => { map(steps(value, 'candidate')[5]!.env).PRIVATE = '${{ secrets.PRIVATE }}'; }],
    ['host secret expression', value => { map(steps(value, 'activate')[6]!.env).HETZNER_HOST = '${{ github.event.inputs.host }}'; }],
  ];
  for (const [name, mutate] of mutations) assert.equal(accepted(changed(mutate)), false, name);
});

test('event checkout, command, environment, cancellation and branch-gate mutations deny', () => {
  const mutations: [string, (value: Map) => void][] = [
    ['untrusted event', value => { map(value.on).pull_request_target = {}; }],
    ['workflow selector', value => { map(map(value.on).workflow_run).workflows = ['Other checks']; }],
    ['event SHA checkout', value => { map(steps(value, 'candidate')[2]!.with).ref = '${{ github.event.workflow_run.head_sha }}'; }],
    ['fork repository checkout', value => { map(steps(value, 'candidate')[2]!.with).repository = '${{ github.event.workflow_run.head_repository.full_name }}'; }],
    ['persisted credentials', value => { map(steps(value, 'candidate')[2]!.with)['persist-credentials'] = true; }],
    ['missing main observation', value => { const sequence = job(value, 'candidate').steps; assert.ok(Array.isArray(sequence)); sequence.splice(1, 1); }],
    ['head check moved after script', value => { const sequence = job(value, 'candidate').steps; assert.ok(Array.isArray(sequence)); const [head] = sequence.splice(3, 1); sequence.push(head); }],
    ['head check changed', value => { steps(value, 'candidate')[3]!.run = 'git rev-parse HEAD'; }],
    ['candidate command changed', value => { steps(value, 'candidate')[5]!.run = 'node candidate.mts'; }],
    ['activation command changed', value => { steps(value, 'activate')[6]!.run = 'echo activate'; }],
    ['host environment changed', value => { job(value, 'activate').environment = '${{ github.event.inputs.environment }}'; }],
    ['cancel active release', value => { map(job(value, 'activate').concurrency)['cancel-in-progress'] = true; }],
    ['candidate phase gate removed', value => { job(value, 'activate').if = 'always()'; }],
    ['host authorization gate removed', value => { steps(value, 'activate')[6]!.if = 'always()'; }],
    ['mode gate removed before checkout', value => { delete steps(value, 'candidate')[2]!.if; }],
    ['receipt wildcard', value => { map(steps(value, 'activate')[7]!.with).path = '${{ runner.temp }}/**'; }],
  ];
  for (const [name, mutate] of mutations) assert.equal(accepted(changed(mutate)), false, name);
});

test('literal merge keys from the inherited workflow fail with GitHub-compatible YAML 1.2', () => {
  const originalMerge = changed(value => {
    const gate = steps(value, 'preflight')[5]!, env = map(gate.env);
    for (const key of ['GH_TOKEN', 'GH_CONFIG_DIR', 'HETZNER_RELEASE_MODE', 'TRUSTED_MAIN']) delete env[key];
    env['<<'] = { GH_TOKEN: '${{ github.token }}',
      GH_CONFIG_DIR: '${{ runner.temp }}/hetzner-gh-${{ github.job }}',
      HETZNER_RELEASE_MODE: '${{ vars.HETZNER_RELEASE_MODE }}', TRUSTED_MAIN: '${{ steps.main.outputs.sha }}' };
  });
  assert.equal(accepted(originalMerge), false);
  assert.equal(accepted('name: [unterminated'), false);
  assert.equal(accepted(source + '\npermissions: {}\n'), false);
});

test('only ready exact-lane host jobs may share the fixed noncancelling production group', () => {
  const mutations: [string, (value: Map) => void][] = [
    ['top-level production group', value => {
      value.concurrency = { group: 'social-monitor-hetzner-production', 'cancel-in-progress': false };
    }],
    ['extra top-level group', value => {
      value.concurrency = { group: 'candidate-only', 'cancel-in-progress': false };
    }],
    ['candidate production group', value => {
      job(value, 'candidate').concurrency = {
        group: 'social-monitor-hetzner-production', 'cancel-in-progress': false,
      };
    }],
  ];
  for (const lane of ['preflight', 'activate'] as const) {
    mutations.push(
      [`${lane} missing concurrency`, value => { delete job(value, lane).concurrency; }],
      [`${lane} missing group`, value => { delete map(job(value, lane).concurrency).group; }],
      [`${lane} changed group`, value => { map(job(value, lane).concurrency).group = '${{ github.sha }}'; }],
      [`${lane} missing cancellation policy`, value => {
        delete map(job(value, lane).concurrency)['cancel-in-progress'];
      }],
      [`${lane} cancellation enabled`, value => {
        map(job(value, lane).concurrency)['cancel-in-progress'] = true;
      }],
      [`${lane} string cancellation policy`, value => {
        map(job(value, lane).concurrency)['cancel-in-progress'] = 'false';
      }],
      [`${lane} missing qualification`, value => { delete job(value, lane).if; }],
      [`${lane} lane alone`, value => {
        job(value, lane).if = `needs.candidate.outputs.lane == '${lane}'`;
      }],
      [`${lane} phase alone`, value => {
        job(value, lane).if = "needs.candidate.outputs.phase == 'ready'";
      }],
      [`${lane} alternate lane`, value => {
        job(value, lane).if = `needs.candidate.outputs.phase == 'ready' && needs.candidate.outputs.lane == '${lane === 'preflight' ? 'activate' : 'preflight'}'`;
      }],
    );
  }
  for (const [name, mutate] of mutations) {
    const violations = C.releaseWorkflowViolations(parse(changed(mutate)));
    assert.ok(violations.length > 0 && violations.length <= 100, name);
  }
});

test('native canonical workflow guard accepts valid YAML and finitely rejects hostile YAML', async () => {
  const runner = resolve('scripts/ci/check-hetzner-release-workflow.mts');
  const root = await mkdtemp(join(tmpdir(), 'sm-release-yaml-'));
  try {
    await mkdir(join(root, '.github/workflows'), { recursive: true });
    const cases: [string, string, number, RegExp][] = [
      ['canonical', source, 0, /Hetzner release workflow contract OK/u],
      ['malformed', 'name: [unterminated', 1, /invalid YAML or duplicate mapping key/u],
      ['duplicate', source + '\npermissions: {}\n', 1, /invalid YAML or duplicate mapping key/u],
      ['literal merge', changed(value => {
        map(job(value, 'preflight').concurrency)['<<'] = { 'cancel-in-progress': true };
      }), 1, /exact allowed keys required/u],
      ['top-level concurrency', changed(value => {
        value.concurrency = { group: 'social-monitor-hetzner-production', 'cancel-in-progress': false };
      }), 1, /exact allowed keys required/u],
    ];
    for (const [name, yaml, status, diagnostic] of cases) {
      await writeFile(join(root, '.github/workflows/hetzner-release.yml'), yaml);
      const result = spawnSync(process.execPath, ['--experimental-strip-types', runner], {
        cwd: root, timeout: 10000, maxBuffer: 65536,
      });
      assert.ifError(result.error);
      assert.equal(result.status, status, name);
      assert.match(status === 0 ? result.stdout.toString() : result.stderr.toString(), diagnostic, name);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('static CI rejects skipped, reordered, duplicated or changed release verification', () => {
  const R = createRequire(import.meta.url)('../../check-review-ci.mjs') as {
    hetznerReleaseCiViolations(source: string, scripts: unknown): string[];
  };
  const ci = map(parse(readFileSync(resolve('.github/workflows/pull-request.yml'), 'utf8')));
  const pkg = map(JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as unknown);
  assert.deepEqual(R.hetznerReleaseCiViolations(stringify(ci), pkg.scripts), []);
  const mutations: ((value: Map) => void)[] = [
    value => { job(value, 'static_quality').if = 'false'; },
    value => { job(value, 'static_quality')['continue-on-error'] = true; },
    ...['if', 'continue-on-error', 'working-directory'].map(key => (value: Map) => {
      const gate = steps(value, 'static_quality').find(step =>
        typeof step.run === 'string' && step.run.includes('npm run check:hetzner-release-typecheck'));
      assert.ok(gate); gate[key] = key === 'if' ? 'false' : key === 'working-directory' ? '/tmp' : true;
    }),
    value => {
      const sequence = job(value, 'static_quality').steps;
      assert.ok(Array.isArray(sequence));
      const index = sequence.findIndex(step => typeof map(step).run === 'string' &&
        String(map(step).run).includes('npm run check:hetzner-release-typecheck'));
      assert.ok(index >= 0); const [gate] = sequence.splice(index, 1); sequence.unshift(gate);
    },
    value => { map(value.jobs).extra = { steps: [{ run: 'npm run check:hetzner-release-tests' }] }; },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(ci); mutate(value);
    assert.ok(R.hetznerReleaseCiViolations(stringify(value), pkg.scripts).length > 0);
  }
  const scripts = { ...map(pkg.scripts), 'check:hetzner-release-tests': 'node --test' };
  assert.ok(R.hetznerReleaseCiViolations(stringify(ci), scripts).length > 0);
});
