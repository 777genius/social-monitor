import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { addResult, createEmptyTestResult, formatTestResults, makeEmptyAggregatedTestResult } from '@jest/test-result';
import { loadShardReports, main, parseExclusions, unitIgnorePattern, verifyShardReports } from './verify-jest-shard-completeness.mjs';
import { completeReports } from './review-ci/fixtures/jest-reports.mjs';

// Regression: treating E2E/Node suites as unit candidates, or rejecting a reviewed
// distinct-suite exclusion, would prevent a complete unit execution from passing.
test('proves four unique suites with a declared distinct-suite exclusion', () => {
  assert.deepEqual(verifyShardReports(completeReports()), { shards: 4, suites: 4, tests: 4 });
});

const mutations = [
  ['missing shard', (value) => value.reports.pop()],
  ['empty inventory', (value) => value.reports[0].inventory = []],
  ['shard subset used as full inventory', (value) => value.reports[0].inventory.pop()],
  ['all inventories silently drop a tracked suite', (value) => value.reports.forEach((report) => report.inventory.pop())],
  ['tracked candidate absent from all executions', (value) => {
    value.trackedPaths.push('libs/missing.spec.ts');
    value.reports.forEach((report) => report.inventory.push('/checkout/libs/missing.spec.ts'));
  }],
  ['suite executed twice', (value) => value.reports[1].execution.testResults[0].name = '/checkout/libs/a.spec.ts'],
  ['empty execution', (value) => value.reports[0].execution.testResults = []],
  ['zero tests', (value) => value.reports[0].execution.numTotalTests = 0],
  ['runtime failure counter', (value) => value.reports[0].execution.numRuntimeErrorTestSuites = 1],
  ['failed suite with success forged', (value) => value.reports[0].execution.testResults[0].status = 'failed'],
  ['runtime-error suite with success forged', (value) => value.reports[0].execution.testResults[0].testExecError = {}],
  ['failed assertion with success forged', (value) => value.reports[0].execution.testResults[0].assertionResults[0].status = 'failed'],
  ...['pending', 'todo', 'disabled'].flatMap((status) => ['passed', 'focused'].map((suiteStatus) =>
    [`wholly ${status} suite with ${suiteStatus} forged`, (value) => {
      const suite = value.reports[0].execution.testResults[0];
      suite.status = suiteStatus;
      suite.assertionResults[0].status = status;
    }])),
  ...['failed', 'unknown'].map((status) => [`${status} assertion with focused forged`, (value) => {
    const suite = value.reports[0].execution.testResults[0];
    suite.status = 'focused';
    suite.assertionResults.push({ status });
    value.reports[0].execution.numTotalTests++;
  }]),
  ['focused status without any pending assertion', (value) => value.reports[0].execution.testResults[0].status = 'focused'],
  ['runtime error with focused forged', (value) => {
    const suite = value.reports[0].execution.testResults[0];
    suite.status = 'focused';
    suite.testExecError = {};
    suite.assertionResults.push({ status: 'pending' });
    value.reports[0].execution.numTotalTests++;
  }],
  ['unknown suite status', (value) => value.reports[0].execution.testResults[0].status = 'unknown'],
  ['interrupted run', (value) => value.reports[0].execution.wasInterrupted = true],
  ['failed command reported', (value) => value.reports[0].execution.success = false],
  ['failure counter omitted', (value) => delete value.reports[0].execution.numFailedTests],
  ['forged total', (value) => value.reports[0].execution.numTotalTests = 2],
  ['duplicate shard identity', (value) => value.reports[1].shard = 1],
  ['unexpected suite', (value) => value.reports[0].execution.testResults[0].name = '/checkout/injected.spec.ts'],
  ['path traversal', (value) => value.reports[0].execution.testResults[0].name = '../libs/a.spec.ts'],
  ['stale exclusion', (value) => value.exclusions.push('gone.spec.ts')],
];
for (const [regression, mutate] of mutations) {
  // Regression: accepting this mutation would claim completeness without its
  // corresponding observable execution or independent tracked inventory proof.
  test(`rejects ${regression}`, () => {
    const value = completeReports(); mutate(value);
    assert.throws(() => verifyShardReports(value));
  });
}

function formattedExecution(statuses, skipped = false) {
  const suite = createEmptyTestResult();
  suite.testFilePath = '/checkout/libs/a.spec.ts';
  suite.skipped = skipped;
  suite.testResults = statuses.map((status, index) => ({
    ancestorTitles: [], title: `assertion ${index}`, fullName: `assertion ${index}`,
    status, failureMessages: [], numPassingAsserts: status === 'passed' ? 1 : 0,
  }));
  suite.numPassingTests = statuses.filter((status) => status === 'passed').length;
  suite.numPendingTests = statuses.filter((status) => status === 'pending').length;
  const aggregate = makeEmptyAggregatedTestResult();
  aggregate.numTotalTestSuites = 1;
  addResult(aggregate, suite);
  return JSON.parse(JSON.stringify(formatTestResults(aggregate)));
}

// Regression: installed Jest formats a pass plus an intentional skip as focused;
// rejecting that real JSON report incorrectly fails complete successful shards.
test('accepts installed Jest formatter report with passing and pending assertions', () => {
  const value = completeReports();
  value.reports[0].execution = formattedExecution(['passed', 'pending']);
  assert.equal(value.reports[0].execution.testResults[0].status, 'focused');
  assert.equal(value.reports[0].execution.success, true);
  assert.equal(value.reports[0].execution.numFailedTests, 0);
  assert.equal(value.reports[0].execution.numTotalTests, 2);
  assert.equal(verifyShardReports(value).tests, 5);
});

// Regression: changing an entirely skipped real report's status to focused must
// not invent evidence that any assertion in that tracked suite passed.
test('rejects installed Jest wholly skipped report even with focused forged', () => {
  const value = completeReports();
  value.reports[0].execution = formattedExecution(['pending'], true);
  assert.equal(value.reports[0].execution.testResults[0].status, 'skipped');
  assert.throws(() => verifyShardReports(value));
  value.reports[0].execution.testResults[0].status = 'focused';
  assert.throws(() => verifyShardReports(value));
});

// Regression: glob exclusions, duplicate exclusions or absolute paths could hide
// future tests unintentionally instead of recording exact intentional exclusions.
test('exclusion manifest accepts comments but rejects unsafe or duplicate paths', () => {
  assert.deepEqual(parseExclusions('# dedicated contract\ntest/separate.spec.ts\n'), ['test/separate.spec.ts']);
  for (const source of ['../a.spec.ts', '/checkout/a.spec.ts', 'a.spec.ts\na.spec.ts', '**/*.spec.ts']) {
    assert.throws(() => parseExclusions(source));
  }
});

function withArtifacts(run) {
  const directory = mkdtempSync(join(tmpdir(), 'sm-ci-reports-'));
  try {
    for (const report of completeReports().reports) {
      const folder = join(directory, `backend-unit-report-${report.shard}`);
      mkdirSync(folder);
      writeFileSync(join(folder, 'inventory.json'), JSON.stringify(report.inventory));
      writeFileSync(join(folder, 'execution.json'), JSON.stringify(report.execution));
    }
    run(directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

// Regression: merging artifacts could overwrite identically named reports and
// erase a missing shard; fixed directories must preserve all four reports.
test('loads each fixed artifact directory without merging JSON files', () => withArtifacts((directory) => {
  assert.equal(verifyShardReports({ ...completeReports(), reports: loadShardReports(directory) }).suites, 4);
}));

for (const [regression, mutate] of [
  ['shell-looking artifact name', (directory) => mkdirSync(join(directory, 'backend-unit-report-$(touch-owned)'))],
  ['injected executable', (directory) => writeFileSync(join(directory, 'backend-unit-report-1', 'run.mjs'), 'throw 1')],
  ['malformed JSON', (directory) => writeFileSync(join(directory, 'backend-unit-report-1', 'execution.json'), '{')],
  ['symlink report', (directory) => {
    const path = join(directory, 'backend-unit-report-1', 'execution.json');
    rmSync(path); symlinkSync('../inventory.json', path);
  }],
  ['absent shard artifact', (directory) => rmSync(join(directory, 'backend-unit-report-4'), { recursive: true })],
]) {
  // Regression: hostile artifact names/files must never become execution inputs
  // or silently substitute for the fixed JSON-only four-shard data contract.
  test(`rejects artifact ${regression}`, () => withArtifacts((directory) => {
    mutate(directory); assert.throws(() => loadShardReports(directory));
  }));
}

// Regression: a path prefix/regex metacharacter or dropped default ignore could
// silently exclude a neighboring unit test or include generated test output.
test('shared selector excludes exact distinct-suite paths only', () => {
  const pattern = new RegExp(unitIgnorePattern(['test/separate.spec.ts']));
  assert.equal(pattern.test('/checkout/test/separate.spec.ts'), true);
  for (const path of ['/checkout/test/separateXspec.ts', '/checkout/test/separate.spec.ts.extra', '/checkout/other-test/separate.spec.ts']) {
    assert.equal(pattern.test(path), false);
  }
  for (const path of ['/checkout/node_modules/a.spec.ts', '/checkout/dist/a.spec.ts', '/checkout/prisma/generated/a.spec.ts']) {
    assert.equal(pattern.test(path), true);
  }
});

// Regression: a four-report historical source must remain accepted by default,
// while the six-shard pipeline rejects the same source and any incomplete union.
test('six-shard proof is explicit and rejects historical four-report pipeline input', () => {
  const value = { ...completeReports(6), shardCount: 6 };
  assert.deepEqual(verifyShardReports(value), { shards: 6, suites: 6, tests: 6 });
  assert.throws(() => verifyShardReports({ ...completeReports(), shardCount: 6 }));
  for (const [label, mutate] of [
    ['missing sixth', (v) => v.reports.pop()],
    ['extra report', (v) => v.reports.push(globalThis.structuredClone(v.reports[0]))],
    ['duplicate sixth id', (v) => v.reports[5].shard = 5],
    ['duplicate sixth suite', (v) => v.reports[5].execution.testResults[0].name = v.reports[0].execution.testResults[0].name],
    ['sixth failed', (v) => v.reports[5].execution.success = false],
    ['sixth skipped', (v) => v.reports[5].execution.testResults[0].status = 'skipped'],
  ]) {
    const bad = globalThis.structuredClone(value); mutate(bad);
    assert.throws(() => verifyShardReports(bad), undefined, label);
  }
});

// Regression: coercing malformed counts or accepting an omitted sixth artifact
// could silently reduce pipeline completeness to the old four-shard shape.
test('shard counts are strict bounded numbers in CLI and verifier contracts', () => {
  for (const shardCount of [0, -1, 1.5, NaN, Infinity, '6', 101]) {
    assert.throws(() => verifyShardReports({ ...completeReports(6), shardCount }));
    assert.throws(() => loadShardReports('/unused', shardCount), /invalid shard count/u);
  }
  for (const count of ['0', '-1', '1.5', '6junk', '6e0', '06', ' 6', 'Infinity', '101', '9007199254740993']) {
    assert.throws(() => main(['--reports', '/unused', '--root', '.', '--exclusions', '/unused', '--shards', count]));
  }
});

test('six artifact directories reject the missing sixth and any extra artifact', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sm-ci-six-reports-'));
  const value = { ...completeReports(6), shardCount: 6 };
  try {
    for (const report of value.reports) {
      const folder = join(directory, `backend-unit-report-${report.shard}`);
      mkdirSync(folder);
      writeFileSync(join(folder, 'inventory.json'), JSON.stringify(report.inventory));
      writeFileSync(join(folder, 'execution.json'), JSON.stringify(report.execution));
    }
    assert.equal(verifyShardReports({ ...value, reports: loadShardReports(directory, 6) }).suites, 6);
    assert.throws(() => loadShardReports(directory));
    const extra = join(directory, 'backend-unit-report-7'); mkdirSync(extra);
    assert.throws(() => loadShardReports(directory, 6)); rmSync(extra, { recursive: true });
    rmSync(join(directory, 'backend-unit-report-6'), { recursive: true });
    assert.throws(() => loadShardReports(directory, 6));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

// Regression: library-only tests would miss an unwired CLI denominator. These
// reports are synthetic verifier fixtures, not evidence of passing unit tests.
test('actual CLI proves six synthetic reports against the real tracked inventory', () => {
  const root = process.cwd();
  const exclusions = parseExclusions(readFileSync('ops/ci/jest-inventory-exclusions.txt', 'utf8'));
  const inventory = execFileSync('git', ['ls-files', '-z', '--', '*.spec.ts'], { encoding: 'utf8' })
    .split('\0').filter(path => path && !exclusions.includes(path)).map(path => resolve(root, path));
  const directory = mkdtempSync(join(tmpdir(), 'sm-ci-six-cli-'));
  try {
    for (let shard = 1; shard <= 6; shard++) {
      const folder = join(directory, `backend-unit-report-${shard}`);
      mkdirSync(folder);
      const results = inventory.filter((_, index) => index % 6 === shard - 1).map(name => ({
        name, status: 'passed', assertionResults: [{ status: 'passed' }],
      }));
      writeFileSync(join(folder, 'inventory.json'), JSON.stringify(inventory));
      writeFileSync(join(folder, 'execution.json'), JSON.stringify({
        success: true, wasInterrupted: false, numTotalTests: results.length,
        numTotalTestSuites: results.length, numFailedTests: 0, numFailedTestSuites: 0,
        numRuntimeErrorTestSuites: 0, testResults: results,
      }));
    }
    const args = ['scripts/ci/verify-jest-shard-completeness.mjs', '--reports', directory,
      '--root', root, '--exclusions', 'ops/ci/jest-inventory-exclusions.txt', '--shards', '6'];
    assert.match(execFileSync(process.execPath, args, { encoding: 'utf8' }),
      new RegExp(`6 shards, ${inventory.length} suites, ${inventory.length} tests`));
    assert.throws(() => execFileSync(process.execPath, args.slice(0, -2), { stdio: 'ignore' }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
