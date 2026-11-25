import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const yaml = createRequire(`${process.cwd()}/package.json`)('js-yaml');
const source = readFileSync('.github/workflows/production-deploy.yml', 'utf8');
const condition = "needs.plan.outputs.backend == 'true'";
const checkout = 'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10';
const setup = 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e';
const affectedCommand = `set -euo pipefail
base=$BACKEND_BASE
if [[ $base == 0000000000000000000000000000000000000000 ]]; then
  base=$(git rev-list --max-parents=0 "$GITHUB_SHA" | tail -n 1)
fi
npm test -- --changedSince="$base" --shard=\${{ matrix.shard }}/5
`;

// Like check-review-ci, parse the complete YAML and keep execution keys exact:
// extra conditions, matrix exclusions, filters or continue-on-error can lose tests.
function check(text: string) {
  const { jobs } = yaml.load(text, { json: false });
  expect(jobs.verify_backend_shards).toEqual({
    name: 'Test affected backend shard ${{ matrix.shard }}/5',
    needs: 'plan', 'runs-on': 'ubuntu-latest', 'timeout-minutes': 45,
    strategy: { 'fail-fast': false, matrix: { shard: [1, 2, 3, 4, 5] } },
    steps: [
      { name: 'Check out the release commit', if: condition, uses: checkout,
        with: { 'fetch-depth': 0, ref: '${{ github.sha }}' } },
      { name: 'Set up Node.js', if: condition, uses: setup,
        with: { 'node-version': 22, cache: 'npm' } },
      { name: 'Prepare the same backend source and generated dependencies', if: condition,
        env: { DATABASE_URL: 'postgresql://fixture:social_monitor_local_password@127.0.0.1:5432/fixture' },
        run: 'set -euo pipefail\ntest "$(git rev-parse HEAD)" = "$GITHUB_SHA"\nnpm ci\nnpm run prisma:generate\nnpm run build\n' },
      { name: 'Test affected backend modules', if: condition,
        env: { BACKEND_BASE: '${{ needs.plan.outputs.backend_base }}' }, run: affectedCommand },
    ],
  });
  expect(jobs.verify_backend.needs).toEqual(['plan', 'verify_backend_shards']);
  expect(jobs.verify_backend.if).toBe("${{ !cancelled() && needs.plan.result == 'success' }}");
  expect(jobs.verify_backend['continue-on-error']).toBeUndefined();
  expect(jobs.verify_backend.steps[0]).toEqual({
    name: 'Require every affected backend shard to succeed',
    run: 'test "${{ needs.verify_backend_shards.result }}" = "success"',
  });
  for (const id of ['release_a', 'deploy']) {
    expect(jobs[id].needs).toContain('verify_backend');
    expect(jobs[id].if).toBeUndefined(); // implicit success() rejects fail/cancel/skip
    expect(jobs[id]['continue-on-error']).toBeUndefined();
  }
  expect(jobs.plan.if).toBe("${{ github.event_name != 'workflow_dispatch' || inputs.maintenance_action == 'none' }}");
  expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts.test).toBe(
    'node scripts/run-with-timeout.mjs --timeout-ms 600000 --node-options --max-old-space-size=2048 -- jest --config jest.config.ts --runInBand',
  );
}

describe('production affected-test shards', () => {
  it('keeps the exact affected selector, dependency preparation and strict deploy gate', () => check(source));
  it('keeps the lifecycle workflow line budget without dropping shard safety', () => {
    expect(source.match(/\n/g)!.length).toBeLessThan(1000);
    check(source);
  });
  it.each([
    ['secrets', process.execPath, ['scripts/check-secrets.mjs']],
    ['maintenance dispatch lifecycle', 'bash', ['ops/deploy/github-production-maintenance-dispatch.test.sh']],
  ])('passes the focused %s CI integration gate offline', (_name, command, args) => {
    const run = spawnSync(command as string, args as string[], {
      env: process.env,
      encoding: 'utf8', timeout: 30000,
    });
    expect(run.error).toBeUndefined();
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
  });
  it.each([false, true])('loads actual Prisma config offline with preparation env supplied=%s', (supplied) => {
    const preparation = yaml.load(source).jobs.verify_backend_shards.steps[2];
    // A fresh process receives only the explicit fixture env, never ambient credentials.
    // Evaluate the checked-in config with real prisma/config, stubbing only dotenv/config.
    const probe = `
      const ts = require('typescript');
      const source = require('node:fs').readFileSync('prisma.config.ts', 'utf8');
      const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText;
      const exports = {};
      try {
        require('node:vm').runInNewContext(code, { exports, require(id) {
          if (id === 'dotenv/config') return {};
          if (id === 'prisma/config') return require('prisma/config');
          throw new Error('Unexpected config import: ' + id);
        } });
        process.stdout.write(JSON.stringify({ url: exports.default.datasource.url }));
      } catch (error) {
        process.stdout.write(JSON.stringify({ name: error.name, message: error.message }));
        process.exitCode = 1;
      }
    `;
    const run = spawnSync(process.execPath, ['-e', probe], {
      env: supplied ? preparation.env : {}, encoding: 'utf8', timeout: 10000,
    });
    expect(run.error).toBeUndefined();
    expect(run.stderr).toBe('');
    expect(run.status).toBe(supplied ? 0 : 1);
    expect(JSON.parse(run.stdout)).toEqual(supplied
      ? { url: preparation.env.DATABASE_URL }
      : { name: 'PrismaConfigEnvError', message: 'Cannot resolve environment variable: DATABASE_URL.' });
  });
  it.each([
    ['          DATABASE_URL: postgresql://fixture:social_monitor_local_password@127.0.0.1:5432/fixture\n', ''],
    ['shard: [1, 2, 3, 4, 5]', 'shard: [1, 2, 3, 4]'],
    ['timeout-minutes: 45', 'timeout-minutes: 90'],
    ['test "$(git rev-parse HEAD)" = "$GITHUB_SHA"', 'true'],
    ['npm ci\n          npm run prisma:generate\n          npm run build', 'npm ci\n          npm run build'],
    ['npm run build', 'true'],
    ['--changedSince="$base"', '--changedSince=HEAD'],
    ['shard: [1, 2, 3, 4, 5]', 'shard: [1, 2, 3, 4, 4]'],
    ['matrix: {shard: [1, 2, 3, 4, 5]}', 'matrix: {shard: [1, 2, 3, 4, 5], exclude: [{shard: 4}]}'],
    ['fail-fast: false', 'fail-fast: true'],
    ['--shard=${{ matrix.shard }}/5', '--shard=${{ matrix.shard }}/4'],
    ['--shard=${{ matrix.shard }}/5', '--shard=${{ matrix.shard }}/6'],
    ['shard ${{ matrix.shard }}/5', 'shard ${{ matrix.shard }}/4'],
    ['shard ${{ matrix.shard }}/5', 'shard ${{ matrix.shard }}/6'],
    ['--shard=${{ matrix.shard }}/5', '--shard=${{ matrix.shard }}/5 --passWithNoTests'],
    ['--shard=${{ matrix.shard }}/5', '--shard=${{ matrix.shard }}/5 --testPathPatterns=small'],
    ['needs: [plan, verify_backend_shards]', 'needs: plan'],
    ['!cancelled()', 'success()'],
    ['= "success"', '!= "failure"'],
    ['= "success"', '= "success" || true'],
    ['    strategy:', '    continue-on-error: true\n    strategy:'],
    ['    strategy:', '    if: false\n    strategy:'],
    ["ref: '${{ github.sha }}'", 'ref: main'],
    ['jobs:\n', 'jobs: [\n'],
  ])('rejects unsafe mutation %s', (before, after) => {
    expect(source).toContain(before);
    expect(() => check(source.replace(before, after))).toThrow();
  });
  it.each(['release_a', 'deploy'])('rejects bypassed %s dependencies and failure policy', (id) => {
    for (const field of ['needs', 'if', 'continue-on-error']) {
      const workflow = yaml.load(source);
      workflow.jobs[id][field] = field === 'needs' ? ['plan'] : field === 'if' ? 'always()' : true;
      expect(() => check(yaml.dump(workflow))).toThrow();
    }
  });
  it.each(['skipped', 'cancelled'])('rejects accepting %s shards', (result) => {
    expect(() => check(source.replace('= "success"', `= "${result}"`))).toThrow();
  });
  it.each(['success', 'failure', 'cancelled', 'skipped', ''])('aggregate result %s fails closed', (result) => {
    const gate = yaml.load(source).jobs.verify_backend.steps[0].run;
    const run = spawnSync('bash', ['-e', '-c', gate.replace('${{ needs.verify_backend_shards.result }}', result)]);
    expect(run.status).toBe(result === 'success' ? 0 : 1);
  });
  it.each(['backend', 'control', 'frontend', 'x_collector', 'maintenance'])('preserves %s skip semantics', (mode) => {
    const { jobs } = yaml.load(source);
    // Successful plan always schedules five jobs. Backend=false skips their
    // individual steps, yielding success, not a skipped matrix dependency.
    expect(jobs.verify_backend_shards.if).toBeUndefined();
    expect(jobs.verify_backend_shards.needs).toBe('plan');
    for (const step of jobs.verify_backend_shards.steps) expect(step.if).toBe(condition);
    const evaluate = (expression: string, planResult = 'success') => runInNewContext(
      expression.replace(/^\$\{\{ | \}\}$/g, ''), {
        github: { event_name: mode === 'maintenance' ? 'workflow_dispatch' : 'push' },
        inputs: { maintenance_action: mode === 'maintenance' ? 'disk-report' : 'none' },
        needs: { plan: { result: planResult, outputs: { backend: mode === 'backend' ? 'true' : 'false' } } },
        cancelled: () => false,
      },
    );
    const planRuns = evaluate(jobs.plan.if);
    expect(planRuns).toBe(mode !== 'maintenance');
    for (const step of jobs.verify_backend_shards.steps) {
      expect(planRuns && evaluate(step.if)).toBe(mode === 'backend');
    }
    expect(evaluate(jobs.verify_backend.if, planRuns ? 'success' : 'skipped')).toBe(planRuns);
    for (const result of ['failure', 'cancelled', 'skipped']) {
      expect(evaluate(jobs.verify_backend.if, result)).toBe(false);
    }
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 34, 796])('Jest partitions %s files without loss or overlap', (count) => {
    const Sequencer = createRequire(`${process.cwd()}/package.json`)('@jest/test-sequencer').default;
    const sequencer = new Sequencer();
    const tests = Array.from({ length: count }, (_, i) => ({
      path: `/repo/test-${i}.spec.ts`, context: { config: { rootDir: '/repo' } },
    }));
    const shards = [1, 2, 3, 4, 5].map(shardIndex => sequencer.shard(tests, { shardIndex, shardCount: 5 }));
    const union = shards.flat().map((test: { path: string }) => test.path);
    expect(union.sort()).toEqual(tests.map(test => test.path).sort());
    expect(new Set(union).size).toBe(count);
  });
  it.each(['844192f9cc745da8e9bf2428cd1c936852d220b0', '0'.repeat(40)])(
    'passes exactly the original selector for base %s', (base) => {
      const script = affectedCommand.replace('${{ matrix.shard }}', '3');
      const stubs = 'git() { printf "root-sha\\n"; }; npm() { printf "<%s>\\n" "$@"; };\n';
      const run = spawnSync('bash', ['-e', '-c', stubs + script], {
        env: { ...process.env, BACKEND_BASE: base, GITHUB_SHA: 'target-sha' }, encoding: 'utf8',
      });
      expect(run.status).toBe(0);
      expect(run.stdout).toBe(`<test>\n<-->\n<--changedSince=${base === '0'.repeat(40) ? 'root-sha' : base}>\n<--shard=3/5>\n`);
    },
  );
  it('propagates selector resolution and test-command failures', () => {
    for (const stubs of ['git() { return 7; }; npm() { exit 0; };', 'git() { echo root; }; npm() { return 9; };']) {
      const run = spawnSync('bash', ['-c', stubs + '\n' + affectedCommand.replace('${{ matrix.shard }}', '1')], {
        env: { ...process.env, BACKEND_BASE: '0'.repeat(40), GITHUB_SHA: 'target' },
      });
      expect(run.status).not.toBe(0);
    }
  });
});
