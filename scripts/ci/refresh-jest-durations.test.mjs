import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { refreshDurations, validateBinding } from './refresh-jest-durations.mjs';
import { loadShardReports } from './verify-jest-shard-completeness.mjs';

const sourceSha = 'a'.repeat(40);
const binding = { head_sha: sourceSha, run_id: 1, conclusion: 'success', report_archive_sha256: 'b'.repeat(64) };
const suite = (name, ms) => ({ name: `/repo/${name}.spec.ts`, status: 'passed', startTime: 1000, endTime: 1000 + ms,
  assertionResults: [{ status: 'passed' }] });
const report = (shard, result) => ({ shard, inventory: ['/repo/a.spec.ts', '/repo/b.spec.ts'], execution: {
  success: true, wasInterrupted: false, numTotalTests: 1, numFailedTests: 0, numFailedTestSuites: 0,
  numRuntimeErrorTestSuites: 0, numTotalTestSuites: 1, testResults: [result],
} });
const input = () => ({ reports: [report(1, suite('a', 70)), report(2, suite('b', 30))], binding,
  sourceSha, reportRoot: '/repo' });

test('refresh uses actual end-start, verifies complete union, reports unknown/deleted', () => {
  const result = refreshDurations(input());
  assert.deepEqual(result.manifest.durationsMs, { 'a.spec.ts': 70, 'b.spec.ts': 30 });
  assert.deepEqual(result.proof, { shards: 2, suites: 2, tests: 2 });
  const changed = refreshDurations({ ...input(), currentInventory: ['a.spec.ts', 'new.spec.ts'] });
  assert.deepEqual(changed.manifest.durationsMs, { 'a.spec.ts': 70 });
  assert.deepEqual(changed.unknown, ['new.spec.ts']);
  assert.deepEqual(changed.deleted, ['b.spec.ts']);
});

test('source binding rejects wrong SHA, unsuccessful source and absent archive binding', () => {
  for (const value of [{ ...binding, head_sha: 'c'.repeat(40) }, { ...binding, conclusion: 'failure' },
    { ...binding, report_archive_sha256: '' }, { ...binding, run_id: -1 }, null]) {
    assert.throws(() => validateBinding(value, sourceSha), /binding/u);
  }
  assert.throws(() => validateBinding(binding, 'main'), /binding/u);
});

test('untrustworthy execution, omitted/duplicate inventory and suite times are rejected', () => {
  for (const mutate of [
    (x) => { x.reports[0].execution.success = false; },
    (x) => { x.reports[0].execution.wasInterrupted = true; },
    (x) => { x.reports[0].execution.numFailedTests = 1; },
    (x) => { x.reports[0].execution.testResults[0].assertionResults[0].status = 'failed'; },
    (x) => { x.reports[0].inventory.pop(); },
    (x) => { x.reports[1].execution.testResults[0].name = '/repo/a.spec.ts'; },
    (x) => { x.reports[1].execution.testResults[0].endTime = 1; },
    (x) => { delete x.reports[1].execution.testResults[0].startTime; },
    (x) => { x.reports[1].execution.testResults[0].startTime = NaN; },
    (x) => { x.reports[1].execution.testResults[0].endTime = Infinity; },
    (x) => { x.reports[1].execution.numTotalTests = 3; },
    (x) => { x.reports[1].execution.numRuntimeErrorTestSuites = 1; },
    (x) => { x.reports[1].execution.testResults[0].status = 'skipped'; },
    (x) => { x.currentInventory = ['a.spec.ts', 'a.spec.ts']; },
    (x) => { x.reports = []; },
  ]) { const data = input(); mutate(data); assert.throws(() => refreshDurations(data)); }
});

test('committed manifest carries measured provenance and 1008 canonical durations', () => {
  const manifest = JSON.parse(readFileSync('ops/ci/jest-durations.json', 'utf8'));
  assert.equal(manifest.source.headSha, '597a01cd6fdcd30f74d4854182c296a3ec02bdad');
  assert.equal(manifest.source.runId, 37231862752);
  assert.equal(manifest.source.conclusion, 'success');
  assert.equal(manifest.source.archiveSha256, 'a924383f379e89bf03cce4320af181ab235256cd5a52b3f7206c19d2af2337f8');
  assert.deepEqual(manifest.source.reportSha256, [
    'ed03db09e5ac166aa557cd79055a183302f2dd85cc697d53cd5243bf565ede52',
    'da65858c586325b77360a4a20c36c2f85d98f33c8deeb1ef4688d4da41570204',
    '7d604953dcf7a42d3dc16a33e46d4c952c0778a6b0a2d82bc542ccffb551a8f6',
    '4d1a021bdbf0dc94e5b04c6e7529b8d34f3864bd6256aaf649c1d41d7b1a098a',
  ]);
  assert.equal(Object.keys(manifest.durationsMs).length, 1008);
});

// Optional real artifacts are local-only ignored inputs materialized by the host.
const realDirectory = 'node_modules/.cicd-evidence/gha-ci-pr1-unit-reports';
let realBinding;
try { realBinding = JSON.parse(readFileSync('node_modules/.cicd-evidence/gha-source-binding.json', 'utf8')); } catch { /* not present on generic CI */ }
test('host reports independently match every seed weight, successful complete 1008-suite union', { skip: !realBinding }, () => {
  const reports = loadShardReports(realDirectory);
  const result = refreshDurations({ reports, binding: realBinding, sourceSha: realBinding.head_sha,
    reportRoot: '/home/runner/work/social-monitor/social-monitor' });
  assert.equal(result.proof.suites, 1008);
  assert.deepEqual(result.manifest.durationsMs, JSON.parse(readFileSync('ops/ci/jest-durations.json', 'utf8')).durationsMs);
  assert.deepEqual(reports.map((report) => report.execution.testResults.reduce((sum, suite) => sum + suite.endTime - suite.startTime, 0)),
    [227551, 511606, 513980, 559555]);
});
