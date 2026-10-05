import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { refreshDurations, refreshMultiDurations, validateBinding } from './refresh-jest-durations.mjs';
import { loadShardReports, parseExclusions, verifyShardReports } from './verify-jest-shard-completeness.mjs';
import Sequencer from './jest-duration-sequencer.cjs';
const { structuredClone } = globalThis;

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
  const text = readFileSync('ops/ci/jest-durations.json', 'utf8');
  const manifest = Sequencer.parseManifest(text);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.policy, 'max-of-two-successful-runs');
  assert.equal(manifest.fullTransferArchiveSha256, '58e7337d7e6a58c8d93abc811710a413bd1358398848eaa31c456fdb49d7d6b8');
  assert.equal(manifest.inventorySha256, '63e1850b5fdf094c3185d609eda4143881e11c85ba5325bfd80507413dd2b9e8');
  // Pin all verified report/artifact bindings and proofs, independent of future tracked suites.
  assert.equal(createHash('sha256').update(JSON.stringify(manifest.sources)).digest('hex'),
    '961cdbe139bc55989784e0daba493d27a78086a68539abf47534e8741a8fc4f0');
  assert.deepEqual(manifest.sources.map(({ runId, headSha, conclusion, shardCount, proof }) =>
    ({ runId, headSha, conclusion, shardCount, proof })), [
    { runId: 37298739585, headSha: '4c6cc67ba3107ff78114b4189f1fdb8cb1f00cc5', conclusion: 'success',
      shardCount: 6, proof: { shards: 6, suites: 1008, tests: 15338 } },
    { runId: 37301690758, headSha: '354d31f7880cbbbfd1dbcdda22ee49c7c8f04d6e', conclusion: 'success',
      shardCount: 6, proof: { shards: 6, suites: 1008, tests: 15338 } },
  ]);
  assert.equal(Object.keys(manifest.durationsMs).length, 1008);
  assert.deepEqual(Object.keys(manifest.durationsMs), Object.keys(manifest.durationsMs).sort());
  assert.ok(text.split('\n').length < 1000);
  const tracked = execFileSync('git', ['ls-files', '-z', '--', '*.spec.ts'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const excluded = new Set(parseExclusions(readFileSync('ops/ci/jest-inventory-exclusions.txt', 'utf8')));
  const currentPaths = tracked.filter((path) => !excluded.has(path)).map((path) => resolve(path)).sort();
  const bins = Sequencer.assignShards(currentPaths.map((path) => ({ path })),
    { shardCount: 6, rootDir: '.', durationsMs: manifest.durationsMs });
  assert.equal(bins.length, 6);
  const assigned = bins.flatMap((bin) => bin.tests.map((suite) => suite.path));
  assert.equal(new Set(assigned).size, currentPaths.length);
  assert.deepEqual(assigned.sort(), currentPaths);
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
  const historical = JSON.parse(execFileSync('git', ['show', '354d31f7880cbbbfd1dbcdda22ee49c7c8f04d6e:ops/ci/jest-durations.json'], { encoding: 'utf8' }));
  assert.deepEqual(result.manifest.durationsMs, historical.durationsMs);
  assert.deepEqual(reports.map((report) => report.execution.testResults.reduce((sum, suite) => sum + suite.endTime - suite.startTime, 0)),
    [227551, 511606, 513980, 559555]);
});

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function syntheticSources(directory) {
  const inventory = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => `/repo/${name}.spec.ts`);
  const sources = [1, 2].map((runId) => {
    const reports = `run-${runId}`;
    const headSha = String(runId).repeat(40);
    const reportFiles = [];
    const githubArtifacts = [];
    for (let index = 0; index < 6; index++) {
      const name = `backend-unit-report-${index + 1}`;
      mkdirSync(resolve(directory, reports, name), { recursive: true });
      const ms = (runId === 1 ? [1000, 70, 30, 20, 10, 5] : [15, 75, 40, 21, 12, 8])[index];
      const execution = report(index + 1, suite(String.fromCharCode(97 + index), ms)).execution;
      for (const [kind, data] of Object.entries({ execution, inventory })) {
        const path = `${reports}/${name}/${kind}.json`;
        const bytes = JSON.stringify(data);
        writeFileSync(resolve(directory, path), bytes);
        reportFiles.push({ path, sha256: digest(bytes) });
      }
      githubArtifacts.push({ id: runId * 10 + index, name, digest: `sha256:${'a'.repeat(64)}`, expired: false,
        workflow_run: { id: runId, head_sha: headSha } });
    }
    return { reports, reportRoot: '/repo', shardCount: 6, runId, headSha, conclusion: 'success', reportFiles, githubArtifacts };
  });
  return { sources, fullTransferArchiveSha256: 'b'.repeat(64) };
}

function withSources(check) {
  const directory = mkdtempSync(resolve('node_modules/.duration-sources-'));
  try { check(directory, syntheticSources(directory)); } finally { rmSync(directory, { recursive: true, force: true }); }
}
const cli = (directory, declaration, args = []) => {
  writeFileSync(resolve(directory, 'sources.json'), JSON.stringify(declaration));
  return JSON.parse(execFileSync(process.execPath, ['scripts/ci/refresh-jest-durations.mjs',
    '--sources', resolve(directory, 'sources.json'), '--out', resolve(directory, 'out.json'), ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
};

test('real six-report CLI preserves the slow outlier with MAX and canonical source ordering', () => withSources((directory, declaration) => {
  const summary = cli(directory, declaration);
  const first = readFileSync(resolve(directory, 'out.json'), 'utf8');
  assert.deepEqual(JSON.parse(first).durationsMs, { 'a.spec.ts': 1000, 'b.spec.ts': 75, 'c.spec.ts': 40,
    'd.spec.ts': 21, 'e.spec.ts': 12, 'f.spec.ts': 8 });
  assert.deepEqual(summary.proofs, [1, 2].map((runId) => ({ runId, shards: 6, suites: 6, tests: 6 })));
  assert.deepEqual([summary.unknown, summary.deleted], [[], []]);
  declaration.sources.reverse();
  for (const source of declaration.sources) { source.reportFiles.reverse(); source.githubArtifacts.reverse(); }
  cli(directory, declaration);
  assert.equal(readFileSync(resolve(directory, 'out.json'), 'utf8'), first);
}));

test('multi-source rejects duplicate, incomplete, failed, stale or mismatched declarations', () => withSources((directory, declaration) => {
  for (const mutate of [
    (x) => { x.sources.pop(); }, (x) => { x.sources.push(x.sources[0]); },
    (x) => { x.sources[1].runId = x.sources[0].runId; },
    (x) => { x.sources[0].reports = '../outside'; },
    (x) => { x.sources[0].headSha = '3'.repeat(40); },
    (x) => { x.sources[0].conclusion = 'failure'; },
    (x) => { x.sources[0].shardCount = 4; },
    (x) => { x.sources[0].reportFiles.pop(); },
    (x) => { x.sources[0].reportFiles[0] = x.sources[0].reportFiles[1]; },
    (x) => { x.sources[0].reportFiles[0].sha256 = 'c'.repeat(64); },
    (x) => { x.sources[0].githubArtifacts[0].workflow_run.id = 9; },
    (x) => { x.sources[0].githubArtifacts.pop(); },
    (x) => { x.sources[0].githubArtifacts[1] = x.sources[0].githubArtifacts[0]; },
    (x) => { x.fullTransferArchiveSha256 = ''; },
  ]) {
    const value = structuredClone(declaration); mutate(value);
    assert.throws(() => refreshMultiDurations({ declaration: value, inputRoot: directory }));
    assert.throws(() => cli(directory, value));
  }
  assert.throws(() => cli(directory, declaration, ['--reports', directory]));
  assert.throws(() => cli(directory, declaration, ['--sources', 'duplicate']));
}));

test('each run independently rejects invalid execution, inventory and actual timestamps even with matching hashes', () => withSources((directory, declaration) => {
  const source = declaration.sources[1];
  const file = source.reportFiles.find((file) => file.path.endsWith('backend-unit-report-6/execution.json'));
  const original = JSON.parse(readFileSync(resolve(directory, file.path), 'utf8'));
  for (const mutate of [
    (x) => { x.success = false; }, (x) => { x.wasInterrupted = true; },
    (x) => { x.testResults[0].assertionResults[0].status = 'pending'; },
    (x) => { x.testResults[0].name = '/repo/a.spec.ts'; },
    (x) => { x.testResults[0].endTime = 0; },
    (x) => { delete x.testResults[0].startTime; },
    (x) => { x.testResults[0].endTime = 1.5; },
    (x) => { x.testResults = []; x.numTotalTestSuites = 0; },
  ]) {
    const value = structuredClone(original); mutate(value);
    const bytes = JSON.stringify(value); writeFileSync(resolve(directory, file.path), bytes); file.sha256 = digest(bytes);
    assert.throws(() => refreshMultiDurations({ declaration, inputRoot: directory }));
  }
  const bytes = JSON.stringify(original); writeFileSync(resolve(directory, file.path), bytes); file.sha256 = digest(bytes);
  assert.throws(() => refreshMultiDurations({ declaration, inputRoot: directory, currentInventory: ['a.spec.ts'] }));
  for (const inventoryFile of source.reportFiles.filter((file) => file.path.endsWith('inventory.json'))) {
    const names = JSON.parse(readFileSync(resolve(directory, inventoryFile.path), 'utf8'));
    names[5] = '/repo/other.spec.ts';
    const bytes = JSON.stringify(names); writeFileSync(resolve(directory, inventoryFile.path), bytes); inventoryFile.sha256 = digest(bytes);
  }
  const changed = structuredClone(original); changed.testResults[0].name = '/repo/other.spec.ts';
  const changedBytes = JSON.stringify(changed); writeFileSync(resolve(directory, file.path), changedBytes); file.sha256 = digest(changedBytes);
  assert.throws(() => refreshMultiDurations({ declaration, inputRoot: directory }), /inventories/u);
}));

test('CLI refuses missing, oversized and symlink JSON inputs; legacy CLI remains explicitly four shards', () => withSources((directory, declaration) => {
  writeFileSync(resolve(directory, 'large.json'), ' '.repeat(65537));
  symlinkSync(resolve(directory, 'large.json'), resolve(directory, 'link.json'));
  for (const input of ['large.json', 'link.json', 'missing.json']) {
    assert.throws(() => execFileSync(process.execPath, ['scripts/ci/refresh-jest-durations.mjs',
      '--sources', resolve(directory, input), '--out', resolve(directory, 'out.json')], { stdio: 'pipe' }));
  }
  const execution = resolve(directory, declaration.sources[0].reportFiles[0].path);
  const bytes = readFileSync(execution);
  rmSync(execution); writeFileSync(resolve(directory, 'target.json'), bytes); symlinkSync(resolve(directory, 'target.json'), execution);
  assert.throws(() => cli(directory, declaration));
  rmSync(execution); writeFileSync(execution, bytes);
  rmSync(resolve(directory, 'run-1/backend-unit-report-6'), { recursive: true });
  assert.throws(() => cli(directory, declaration));
  rmSync(resolve(directory, 'run-1/backend-unit-report-5'), { recursive: true });
  const inventory = ['a', 'b', 'c', 'd'].map((name) => `/repo/${name}.spec.ts`);
  for (let index = 1; index <= 4; index++) writeFileSync(resolve(directory, `run-1/backend-unit-report-${index}/inventory.json`), JSON.stringify(inventory));
  writeFileSync(resolve(directory, 'binding.json'), JSON.stringify(binding));
  const summary = JSON.parse(execFileSync(process.execPath, ['scripts/ci/refresh-jest-durations.mjs', '--reports', resolve(directory, 'run-1'),
    '--binding', resolve(directory, 'binding.json'), '--source-sha', sourceSha, '--report-root', '/repo',
    '--out', resolve(directory, 'legacy.json')], { encoding: 'utf8', stdio: 'pipe' }));
  assert.deepEqual([summary.shards, summary.suites, summary.tests], [4, 4, 4]);
  const legacy = Sequencer.readManifest(resolve(directory, 'legacy.json'));
  assert.equal(legacy.schemaVersion, 1);
  assert.deepEqual(legacy.source, { runId: 1, headSha: sourceSha, conclusion: 'success', archiveSha256: binding.report_archive_sha256,
    reportSha256: [1, 2, 3, 4].map((index) => digest(readFileSync(resolve(directory, `run-1/backend-unit-report-${index}/execution.json`)))) });
}));

const evidenceDirectory = 'node_modules/.ci-balance-inputs';
test('both original runs independently prove current coverage, exact report hashes and every committed MAX weight',
  { skip: !existsSync(`${evidenceDirectory}/source-evidence.json`) }, () => {
    const declaration = JSON.parse(readFileSync(`${evidenceDirectory}/source-evidence.json`, 'utf8'));
    const committed = Sequencer.readManifest('ops/ci/jest-durations.json');
    const expected = new Map();
    const trackedPaths = execFileSync('git', ['ls-files', '-z', '--', '*.spec.ts'], { encoding: 'utf8' }).split('\0').filter(Boolean);
    const exclusions = parseExclusions(readFileSync('ops/ci/jest-inventory-exclusions.txt', 'utf8'));
    for (const source of declaration.sources) {
      const reports = loadShardReports(`${evidenceDirectory}/${source.reports}`, 6);
      assert.deepEqual(verifyShardReports({ reports, trackedPaths, exclusions, root: source.reportRoot, shardCount: 6 }),
        { shards: 6, suites: 1008, tests: 15338 });
      const provenance = committed.sources.find((item) => item.runId === source.runId);
      assert.deepEqual(provenance.reportFiles, [...source.reportFiles].sort((a, b) => a.path < b.path ? -1 : 1));
      for (const file of source.reportFiles) assert.equal(digest(readFileSync(`${evidenceDirectory}/${file.path}`)), file.sha256);
      for (const report of reports) for (const suite of report.execution.testResults) {
        assert.ok(suite.assertionResults.every((assertion) => assertion.status === 'passed'));
        const path = suite.name.slice(source.reportRoot.length + 1);
        const ms = suite.endTime - suite.startTime;
        if (!expected.has(path) || expected.get(path) < ms) expected.set(path, ms);
      }
    }
    assert.deepEqual(committed.durationsMs, Object.fromEntries([...expected].sort(([a], [b]) => a < b ? -1 : 1)));
    const currentInventory = trackedPaths.filter((path) => !exclusions.includes(path));
    const result = refreshMultiDurations({ declaration, inputRoot: evidenceDirectory, currentInventory });
    assert.deepEqual(result.manifest, committed);
    assert.deepEqual([result.unknown, result.deleted], [[], []]);
  });
