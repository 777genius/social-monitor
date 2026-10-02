/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, module, __dirname, Buffer */
// Jest's sequencer is CJS; inherit sort/cacheResults unchanged (failed tests first).
const { default: TestSequencer } = require('@jest/test-sequencer');
const { lstatSync, readFileSync } = require('node:fs');
const { resolve, relative, sep } = require('node:path');
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SUITES = 20000;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fail = (message) => { throw new Error(message); };

function canonicalPath(value) {
  if (typeof value !== 'string' || value.length > 1024 || !value.endsWith('.spec.ts') ||
      [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || '\\:*?[]'.includes(character)) ||
      value.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('invalid canonical suite path');
  }
  return value;
}

function parseManifest(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > MAX_BYTES) fail('oversized duration manifest');
  const data = JSON.parse(source);
  if (!data || data.schemaVersion !== 1 || !data.source ||
      !/^[0-9a-f]{40}$/u.test(data.source.headSha) ||
      !Number.isSafeInteger(data.source.runId) || data.source.runId < 1 ||
      data.source.conclusion !== 'success' || !data.durationsMs ||
      typeof data.durationsMs !== 'object' || Array.isArray(data.durationsMs)) fail('invalid duration manifest schema');
  const entries = Object.entries(data.durationsMs);
  if (!entries.length || entries.length > MAX_SUITES) fail('invalid duration manifest suite count');
  let total = 0;
  for (const [path, ms] of entries) {
    canonicalPath(path);
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) fail('invalid suite duration');
    total += ms;
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) fail('duration total overflow');
  }
  return data;
}

function readManifest(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) fail('invalid duration manifest file');
  return parseManifest(readFileSync(path, 'utf8'));
}

function medianDuration(durations) {
  const values = Object.values(durations).sort((a, b) => a - b);
  if (!values.length) fail('empty duration dataset');
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function assignShards(tests, { shardCount, rootDir, durationsMs }) {
  if (!Number.isSafeInteger(shardCount) || shardCount < 1) fail('invalid shard count');
  // Allocate at most one bin per suite, even for a very large Jest denominator.
  const bins = Array.from({ length: Math.min(shardCount, tests.length) }, () => ({ tests: [], durationMs: 0 }));
  const fallback = medianDuration(durationsMs);
  const paths = new Set();
  const weighted = tests.map((test) => {
    const path = canonicalPath(relative(resolve(rootDir), resolve(test.path)).split(sep).join('/'));
    if (paths.has(path)) fail('duplicate suite path');
    paths.add(path);
    const ms = Object.hasOwn(durationsMs, path) ? durationsMs[path] : fallback;
    return { test, path, ms };
  }).sort((a, b) => b.ms - a.ms || compare(a.path, b.path));
  for (const suite of weighted) {
    let target = 0;
    for (let index = 1; index < bins.length; index++) {
      if (bins[index].durationMs < bins[target].durationMs ||
          (bins[index].durationMs === bins[target].durationMs && bins[index].tests.length < bins[target].tests.length)) target = index;
    }
    bins[target].tests.push(suite.test);
    bins[target].durationMs += suite.ms;
  }
  return bins;
}

class DurationSequencer extends TestSequencer {
  constructor(options) {
    super(options);
    this.rootDir = options?.globalConfig?.rootDir ?? resolve(__dirname, '../..');
  }
  shard(tests, { shardIndex, shardCount }) {
    if (!Number.isSafeInteger(shardIndex) || shardIndex < 1 || shardIndex > shardCount) fail('invalid shard index');
    const manifest = readManifest(resolve(__dirname, '../../ops/ci/jest-durations.json'));
    return assignShards(tests, { shardCount, rootDir: this.rootDir, durationsMs: manifest.durationsMs })[shardIndex - 1]?.tests ?? [];
  }
}

module.exports = DurationSequencer;
Object.assign(module.exports, { canonicalPath, parseManifest, readManifest, medianDuration, assignShards });
