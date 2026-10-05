import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import Sequencer from './jest-duration-sequencer.cjs';

const { parseManifest, readManifest, assignShards, medianDuration } = Sequencer;
const source = { runId: 1, headSha: 'a'.repeat(40), conclusion: 'success' };
const manifest = (durationsMs) => JSON.stringify({ schemaVersion: 1, source, durationsMs });
const rootDir = resolve('node_modules/.cicd-evidence/synthetic-repo');
const tests = (names) => names.map((name) => ({ path: resolve(rootDir, `${name}.spec.ts`) }));
const names = (bins) => bins.map((bin) => bin.tests.map((suite) => suite.path.slice(rootDir.length + 1)));

// Red trigger recorded before implementation: the sequencer/refresh/timing imports
// failed ERR_MODULE_NOT_FOUND. Fixtures below are synthetic, not seed measurements.
test('LPT has independently expected bins, canonical path ties and median unknowns', () => {
  const durationsMs = { 'a.spec.ts': 9, 'b.spec.ts': 7, 'c.spec.ts': 6, 'd.spec.ts': 2 };
  const options = { shardCount: 2, rootDir, durationsMs };
  const bins = assignShards(tests(['e', 'd', 'c', 'b', 'a']), options);
  assert.equal(medianDuration(durationsMs), 6.5);
  assert.deepEqual(names(bins), [['a.spec.ts', 'c.spec.ts'], ['b.spec.ts', 'e.spec.ts', 'd.spec.ts']]);
  assert.deepEqual(bins.map((bin) => bin.durationMs), [15, 15.5]);
  assert.deepEqual(names(assignShards(tests(['b', 'a', 'd', 'c']), {
    ...options, durationsMs: { 'a.spec.ts': 5, 'b.spec.ts': 5, 'c.spec.ts': 5, 'd.spec.ts': 5 },
  })), [['a.spec.ts', 'c.spec.ts'], ['b.spec.ts', 'd.spec.ts']]);
});

test('permutations and any denominator keep every suite exactly once', () => {
  const suites = tests(['a', 'b', 'c', 'd', 'e']);
  const durationsMs = { 'a.spec.ts': 10, 'b.spec.ts': 2, 'deleted.spec.ts': 6 };
  for (const shardCount of [1, 2, 3, 4, 6, 7, 1000000000]) {
    const options = { shardCount, rootDir, durationsMs };
    const expected = names(assignShards(suites, options));
    for (const order of [suites, [...suites].reverse(), [...suites.slice(2), ...suites.slice(0, 2)]]) {
      const actual = names(assignShards(order, options));
      assert.deepEqual(actual, expected);
      assert.deepEqual(actual.flat().sort(), ['a', 'b', 'c', 'd', 'e'].map((name) => `${name}.spec.ts`));
      assert.equal(new Set(actual.flat()).size, suites.length);
    }
  }
  assert.deepEqual(names(assignShards(suites, { shardCount: 3, rootDir,
    durationsMs: { 'a.spec.ts': 0 } })).map((bin) => bin.length), [2, 2, 1]);
  assert.deepEqual(assignShards([], { shardCount: 4, rootDir, durationsMs }), []);
});

test('rejects bounded invalid schema, nonfinite/negative values and traversal', () => {
  for (const path of ['../a.spec.ts', '/a.spec.ts', 'a/../b.spec.ts', 'a//b.spec.ts', 'a\\b.spec.ts', 'C:/a.spec.ts', 'a\0.spec.ts', 'a.ts']) {
    assert.throws(() => parseManifest(manifest({ [path]: 1 })), /path/u);
  }
  for (const value of [-1, null, '1']) assert.throws(() => parseManifest(manifest({ 'a.spec.ts': value })), /duration/u);
  assert.throws(() => parseManifest(manifest({ 'a.spec.ts': 1 }).replace(':1}', ':1e999}')), /duration/u);
  for (const data of [null, {}, { schemaVersion: 2, source, durationsMs: {} },
    { schemaVersion: 1, source: { ...source, conclusion: 'failure' }, durationsMs: { 'a.spec.ts': 1 } },
    { schemaVersion: 1, source, durationsMs: [] }]) assert.throws(() => parseManifest(JSON.stringify(data)));
  assert.throws(() => parseManifest(manifest({})), /count/u);
  assert.throws(() => parseManifest(' '.repeat(4 * 1024 * 1024 + 1)), /oversized/u);
  const many = Object.fromEntries(Array.from({ length: 20001 }, (_, i) => [`t${i}.spec.ts`, 1]));
  assert.throws(() => parseManifest(manifest(many)), /count/u);
  assert.throws(() => parseManifest(manifest({ 'a.spec.ts': Number.MAX_SAFE_INTEGER, 'b.spec.ts': 1 })), /overflow/u);
  assert.throws(() => assignShards(tests(['a', 'a']), { shardCount: 2, rootDir, durationsMs: { 'a.spec.ts': 1 } }), /duplicate/u);
  assert.throws(() => assignShards([{ path: resolve(rootDir, '../outside.spec.ts') }], { shardCount: 2, rootDir, durationsMs: { 'a.spec.ts': 1 } }), /path/u);
  assert.throws(() => assignShards(tests(['a']), { shardCount: 0, rootDir, durationsMs: { 'a.spec.ts': 1 } }), /count/u);
});

test('manifest file rejects symlinks; inherited Jest sort keeps failure priority', () => {
  mkdirSync(resolve('node_modules/.cicd-evidence'), { recursive: true });
  const directory = mkdtempSync(resolve('node_modules/.cicd-evidence/sequencer-'));
  try {
    const file = resolve(directory, 'manifest.json');
    writeFileSync(file, manifest({ 'a.spec.ts': 1 }));
    symlinkSync(file, resolve(directory, 'link.json'));
    assert.throws(() => readManifest(resolve(directory, 'link.json')), /file/u);
    const seq = new Sequencer({ globalConfig: { rootDir } });
    const context = { config: { cache: false }, hasteFS: { getSize: () => 1 } };
    const suites = tests(['a', 'b', 'c']).map((suite) => ({ ...suite, context }));
    // Populate installed Jest's actual cache, then execute its inherited sort.
    seq._cache.set(context, Object.fromEntries(suites.map((suite, index) => [suite.path, [index === 1 ? 0 : 1, index === 1 ? 1 : 100]])));
    assert.equal(seq.sort([...suites])[0].path, suites[1].path);
    const before = seq.shard(suites, { shardIndex: 1, shardCount: 2 }).map((suite) => suite.path);
    seq._cache.clear();
    assert.deepEqual(seq.shard([...suites].reverse(), { shardIndex: 1, shardCount: 2 }).map((suite) => suite.path), before);
    assert.throws(() => seq.shard(suites, { shardIndex: 3, shardCount: 2 }), /index/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('real installed Jest --listTests --shard supports the public sequencer API', () => {
  const directory = mkdtempSync(resolve('test/.cicd-jest-list-'));
  try {
    mkdirSync(resolve(directory, 'suites'));
    for (const name of ['a', 'b', 'c', 'd', 'e']) writeFileSync(resolve(directory, `suites/${name}.spec.ts`), '');
    const config = resolve(directory, 'jest.config.cjs');
    writeFileSync(config, `module.exports=${JSON.stringify({ rootDir: directory, testRegex: '.*\\.spec\\.ts$',
      testPathIgnorePatterns: [], testSequencer: resolve('scripts/ci/jest-duration-sequencer.cjs') })}`);
    const list = (shard) => JSON.parse(execFileSync(process.execPath, [resolve('node_modules/jest/bin/jest.js'),
      '--config', config, '--runInBand', '--listTests', '--json', ...(shard ? [`--shard=${shard}`] : [])],
    { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }));
    const full = list().sort();
    assert.equal(full.length, 5);
    for (const count of [3, 6, 7]) {
      const union = Array.from({ length: count }, (_, i) => list(`${i + 1}/${count}`)).flat();
      assert.equal(new Set(union).size, full.length);
      assert.deepEqual(union.sort(), full);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
