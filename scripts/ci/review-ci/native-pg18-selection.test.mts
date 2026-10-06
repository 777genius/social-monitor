import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { needPg18 } from './native-pg18-selection.mts';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml') as { load(source: string): unknown };
type Step = { name: string; run?: string; id?: string };
type Workflow = { jobs: Record<string, { steps: Step[] }> };
const workflow = load(readFileSync('.github/workflows/pull-request.yml', 'utf8')) as Workflow;
const command = (fragment: string): string => {
  const step = workflow.jobs.backend_unit_shards!.steps.find((value) => value.name.includes(fragment));
  assert.ok(step?.run);
  return step.run;
};
const root = process.cwd();
const helper = resolve('scripts/ci/review-ci/native-pg18-selection.mts');
const { assignShards } = require('../jest-duration-sequencer.cjs') as {
  assignShards(tests: Array<{ path: string }>, options: { shardCount: number; rootDir: string;
    durationsMs: Record<string, number> }): Array<{ tests: Array<{ path: string }> }>;
};
const native = 'scripts/lib/reader-summary-first-publication-pg18.spec.ts';
const normal = 'plain.spec.ts';
const fixture = (run: (directory: string) => void): void => {
  const scratch = resolve('node_modules/.cicd-evidence');
  mkdirSync(scratch, { recursive: true });
  const directory = mkdtempSync(join(scratch, 'pg18-selection-'));
  try {
    mkdirSync(join(directory, 'scripts/lib'), { recursive: true });
    mkdirSync(join(directory, 'reports'));
    writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      target: 'ES2023', module: 'commonjs', baseUrl: '.', ignoreDeprecations: '6.0',
      paths: { '@social-monitor/fixture': ['shared.ts'] },
    } }));
    writeFileSync(join(directory, native), 'export {};');
    writeFileSync(join(directory, normal), 'export {};');
    run(directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
};
const lists = (directory: string, selected: unknown, inventory: unknown = [normal, native]) => {
  const absolute = (value: unknown): unknown => Array.isArray(value) ? value.map((path: unknown) =>
    typeof path === 'string' && !path.startsWith('/') ? join(directory, path) : path) : value;
  const inventoryFile = join(directory, 'reports/inventory.json');
  const selectionFile = join(directory, 'selection.json');
  writeFileSync(inventoryFile, JSON.stringify(absolute(inventory)));
  writeFileSync(selectionFile, JSON.stringify(absolute(selected)));
  return { inventoryFile, selectionFile };
};
const decide = (directory: string, selected: unknown, shard = '1/6', inventory?: unknown): boolean => {
  const files = lists(directory, selected, inventory);
  return needPg18(directory, files.inventoryFile, files.selectionFile, shard);
};

// Mutation: hardcode native shard6. The old guard protected installer text only;
// the actual classifier must follow discovery even when native moves to any shard.
test('native consumer moves across all six shards; ordinary selection needs no PG', () => {
  fixture((directory) => {
    const companions = Array.from({ length: 5 }, (_, index) => `companion-${index}.spec.ts`);
    for (const path of companions) writeFileSync(join(directory, path), 'export {};');
    const inventory = [...companions, native];
    for (let shard = 1; shard <= 6; shard++) {
      const durationsMs = Object.fromEntries(companions.map((path, index) =>
        [path, index < shard - 1 ? 100 + index : 1]));
      durationsMs[native] = 50;
      const bins = assignShards(inventory.map((path) => ({ path: join(directory, path) })),
        { shardCount: 6, rootDir: directory, durationsMs });
      assert.equal(bins.findIndex((bin) => bin.tests.some((suite) => suite.path === join(directory, native))), shard - 1);
      for (const [index, bin] of bins.entries()) {
        assert.equal(decide(directory, bin.tests.map((suite) => suite.path), `${index + 1}/6`, inventory), index + 1 === shard);
      }
    }
  });
});

// Mutation: map only the existing native filename. A new consumer, indirect
// helper, re-export, alias or literal dynamic import must acquire preparation.
test('new native consumers follow source dependencies and unknown local edges fail closed', () => {
  fixture((directory) => {
    writeFileSync(join(directory, 'shared.ts'), 'export const executable = "initdb";');
    writeFileSync(join(directory, 'barrel.ts'), 'export * from "./shared";');
    for (const source of ['import "./shared";', 'import "./barrel";',
      'import("./shared");', 'require("./shared");', 'import "@social-monitor/fixture";',
      'import "./unknown-native-helper";', 'const binary = "/usr/lib/postgresql/18/bin/postgres";']) {
      writeFileSync(join(directory, normal), source);
      assert.equal(decide(directory, [normal]), true, source);
    }
    // A changed formerly offline suite must not inherit its old exemption.
    const offline = 'scripts/lib/reader-summary-first-publication-pg18-lifecycle.spec.ts';
    writeFileSync(join(directory, offline), 'import "../../shared";');
    assert.equal(decide(directory, [offline], '2/6', [offline]), true);
  });
});

// Mutation: overbroad name matching drops genuine proof or installs for sealed
// offline faults. The unchanged real sources must honor their reviewed closure.
test('reviewed offline consumers do not need genuine binaries', () => {
  fixture((directory) => {
    const suites = ['lifecycle', 'error-evidence', 'crash-loader'].map((name) =>
      resolve(root, `scripts/lib/reader-summary-first-publication-pg18-${name}.spec.ts`));
    const files = lists(directory, suites, suites);
    assert.equal(needPg18(root, files.inventoryFile, files.selectionFile, '3/6'), false);
  });
});

// Mutation: interpret invalid/missing discovery as false. All bad data must
// throw before even a native-first list can short circuit the validation.
const invalid: Array<[string, unknown]> = [
  ['empty', []], ['object', {}], ['null', null], ['scalar', 'suite'],
  ['duplicate', [normal, normal]], ['nonstring', [native, 42]],
  ['foreign repo', ['/tmp/foreign.spec.ts']], ['missing spec', ['missing.spec.ts']],
  ['non-spec', ['tsconfig.json']],
];
for (const [name, value] of invalid) {
  test(`selection rejects ${name}`, () => fixture((directory) => {
    assert.throws(() => decide(directory, value));
  }));
}
test('malformed, missing, symlinked, noncanonical and unbound selection fail closed', () => {
  fixture((directory) => {
    let files = lists(directory, [normal]);
    writeFileSync(files.selectionFile, '[');
    assert.throws(() => needPg18(directory, files.inventoryFile, files.selectionFile, '1/6'));
    rmSync(files.selectionFile);
    assert.throws(() => needPg18(directory, files.inventoryFile, files.selectionFile, '1/6'));
    symlinkSync(files.inventoryFile, files.selectionFile);
    assert.throws(() => needPg18(directory, files.inventoryFile, files.selectionFile, '1/6'));
    rmSync(files.selectionFile);
    assert.throws(() => decide(directory, [native], '1/6', [normal]));
    assert.throws(() => decide(directory, [normal], '1/6', []));
    files = lists(directory, [`${directory}/scripts/../plain.spec.ts`]);
    assert.throws(() => needPg18(directory, files.inventoryFile, files.selectionFile, '1/6'));
    const linked = join(directory, 'linked.spec.ts');
    symlinkSync(join(directory, normal), linked);
    assert.throws(() => decide(directory, [linked], '1/6', [linked]));
  });
});
for (const shard of ['0/6', '7/6', '2/4', '2/7', '02/6', '2.0/6', '2', '2/6 extra']) {
  test(`denominator/bounds rejects ${shard}`, () => fixture((directory) => {
    assert.throws(() => decide(directory, [normal], shard), /shard/u);
  }));
}

const shell = (directory: string, source: string, env: Record<string, string> = {}) => {
  const result = spawnSync('bash', ['-c', source], { cwd: directory, encoding: 'utf8', timeout: 15000,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', GITHUB_ACTIONS: 'true',
      RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux', RUNNER_TEMP: directory, ...env } });
  assert.ifError(result.error);
  assert.notEqual(result.status, null, result.stderr);
  return result;
};
const expand = (source: string, shard: number, decision = 'true'): string => source
  .replaceAll('${{ matrix.shard }}', String(shard))
  .replaceAll('${{ steps.native_pg18.outputs.need_pg18 }}', decision);

// Credential-free process-boundary fixtures execute the real workflow shell.
// Neither APT nor native commands run on the host: only shell functions below.
const installerPorts = `
source() { ID=ubuntu; VERSION_CODENAME=noble; }
id() { printf '1000\\n'; }
curl() { printf 'synthetic signing key' > "\${@: -1}"; }
gpg() { printf 'fpr:::::::::B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8:\\n'; }
sudo() {
  printf '%s\\n' "$*" >> install-arguments
  if [[ "$*" == *'apt-get install'* && "\${INSTALL_FAIL:-0}" = 1 ]]; then return 71; fi
  if [[ "$1" == tee ]]; then cat >/dev/null; fi
}
test() { if [[ "$1" == -x ]]; then [[ "\${MISSING_TOOL:-0}" = 0 ]]; return; fi; builtin test "$@"; }
/usr/lib/postgresql/18/bin/initdb() { printf 'initdb (PostgreSQL) 18.4\\n'; }
/usr/lib/postgresql/18/bin/pg_ctl() { printf 'pg_ctl (PostgreSQL) 18.4\\n'; }
/usr/lib/postgresql/18/bin/postgres() { printf 'postgres (PostgreSQL) 18.4\\n'; }
/usr/lib/postgresql/18/bin/psql() { printf 'psql (PostgreSQL) %s.4\\n' "\${PG_MAJOR:-18}"; }
`;

// Mutation: install regardless of decision, accept absent output, or mask APT
// failure. Contract text alone cannot prove shell exit propagation and admission.
test('actual bootstrap supplies native, bypasses APT only on false, refuses invalid and failed installs', () => {
  fixture((directory) => {
    const script = command('Supply genuine');
    assert.equal(shell(directory, installerPorts + expand(script, 1)).status, 0);
    const calls = readFileSync(join(directory, 'install-arguments'), 'utf8');
    assert.ok(calls.includes('apt-get install --yes --no-install-recommends postgresql-18 postgresql-client-18'));
    rmSync(join(directory, 'install-arguments'));
    assert.equal(shell(directory, installerPorts + expand(script, 2, 'false')).status, 0);
    assert.throws(() => readFileSync(join(directory, 'install-arguments')));
    for (const decision of ['', 'maybe', 'TRUE']) {
      assert.notEqual(shell(directory, installerPorts + expand(script, 6, decision)).status, 0);
    }
    assert.notEqual(shell(directory, installerPorts + expand(script, 1), { INSTALL_FAIL: '1' }).status, 0);
    assert.notEqual(shell(directory, installerPorts + expand(script, 1), { MISSING_TOOL: '1' }).status, 0);
    assert.notEqual(shell(directory, installerPorts + expand(script, 1), { PG_MAJOR: '17' }).status, 0);
    assert.notEqual(shell(directory, installerPorts + expand(script, 2, 'false'), { RUNNER_ENVIRONMENT: 'self-hosted' }).status, 0);
  });
});

// Mutation: discover a subset into reports/inventory.json, suppress Jest failure,
// use a different selector/config, or write selection into the reports artifact.
// Real shell and real validator run; Jest is replaced at its Node process boundary.
test('full inventory then shard discovery publishes boolean and propagates producer/validator failures', () => {
  fixture((directory) => {
    lists(directory, [native]);
    const output = join(directory, 'github-output');
    const ports = `node() {
      if [[ "$1" == scripts/ci/verify-jest-shard-completeness.mjs ]]; then printf 'fixture-ignore'; return; fi
      if [[ "$1" == scripts/run-with-timeout.mjs ]]; then
        printf '%s\\n' "$*" >> jest-arguments
        if [[ "\${PRODUCER_FAIL:-0}" = 1 ]]; then return 72; fi
        if [[ "$*" == *--shard=* ]]; then cat selection.json; else cat full.json; fi
        return
      fi
      "${process.execPath}" --experimental-strip-types "${helper}" "\${@:3}"
    }\n`;
    writeFileSync(join(directory, 'full.json'), JSON.stringify([join(directory, normal), join(directory, native)]));
    const scripts = expand(command('List the complete'), 4) + '\n' + expand(command('Discover actual'), 4);
    assert.equal(shell(directory, ports + scripts, { GITHUB_OUTPUT: output }).status, 0);
    assert.equal(readFileSync(output, 'utf8'), 'need_pg18=true\n');
    const calls = readFileSync(join(directory, 'jest-arguments'), 'utf8').trim().split('\n');
    assert.equal(calls.length, 2);
    assert.ok(!calls[0]!.includes('--shard='));
    assert.ok(calls[1]!.includes('--shard=4/6 --testPathIgnorePatterns=fixture-ignore --listTests --json'));
    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'reports/inventory.json'), 'utf8')),
      [join(directory, normal), join(directory, native)]);
    for (const mutation of ['malformed', 'empty', 'producer failure']) {
      rmSync(output);
      writeFileSync(join(directory, 'selection.json'), mutation === 'empty' ? '[]' : '[');
      assert.notEqual(shell(directory, ports + scripts, { GITHUB_OUTPUT: output,
        PRODUCER_FAIL: mutation === 'producer failure' ? '1' : '0' }).status, 0);
      // Redirection may create an empty output file; it must never publish false.
      assert.throws(() => assert.match(readFileSync(output, 'utf8'), /need_pg18=/u));
      writeFileSync(output, '');
    }
  });
});

// Mutation: broaden the two-worker pilot or lose coverage/reports/deadline. Each
// concrete shard executes the workflow branch and records the resulting argv.
test('actual shard execution uses two workers only for shard2 and preserves proof argv', () => {
  fixture((directory) => {
    const ports = `node() {
      if [[ "$1" == scripts/ci/verify-jest-shard-completeness.mjs ]]; then printf 'fixture-ignore'; return; fi
      printf '%s\\n' "$@" > execution-arguments
    }\n`;
    for (let shard = 1; shard <= 6; shard++) {
      assert.equal(shell(directory, ports + expand(command('Run backend unit'), shard)).status, 0);
      const args = readFileSync(join(directory, 'execution-arguments'), 'utf8').trim().split('\n');
      assert.equal(args.includes('--maxWorkers=2'), shard === 2);
      assert.equal(args.includes('--runInBand'), shard !== 2);
      for (const flag of ['2700000', '--max-old-space-size=4096', 'jest.config.ts',
        `--shard=${shard}/6`, '--testPathIgnorePatterns=fixture-ignore', '--coverage',
        '--coverageDirectory=coverage', '--coverageReporters=lcovonly', '--outputFile=reports/execution.json']) {
        assert.ok(args.includes(flag), flag);
      }
    }
  });
});

// Mutation: CLI validates differently than the exported behavior or prints false
// on failure. Invoke the real process and assert its output/exit status together.
test('helper CLI publishes only a valid decision and fails without a false output', () => {
  fixture((directory) => {
    const files = lists(directory, [native]);
    const args = ['--experimental-strip-types', helper, '--root', directory,
      '--inventory', files.inventoryFile, '--selection', files.selectionFile, '--shard', '2/6'];
    const valid = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 15000 });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout, 'need_pg18=true\n');
    writeFileSync(files.selectionFile, '[]');
    const invalid = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 15000 });
    assert.notEqual(invalid.status, 0);
    assert.equal(invalid.stdout, '');
  });
});
