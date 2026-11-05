/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, module, __dirname, Buffer */
// Jest's sequencer is CJS; inherit sort/cacheResults unchanged (failed tests first).
const { default: TestSequencer } = require('@jest/test-sequencer');
const { lstatSync, readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { resolve, relative, sep } = require('node:path');
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SUITES = 20000;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fail = (message) => { throw new Error(message); };
const sha256 = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const inventoryDigest = (paths) => createHash('sha256').update(JSON.stringify([...paths].sort())).digest('hex');

function canonicalInputPath(value) {
  if (typeof value !== 'string' || !value || value.length > 1024 ||
      [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || '\\:*?[]'.includes(character)) ||
      value.split('/').some((part) => !part || part === '.' || part === '..')) fail('invalid source path');
  return value;
}

// Metadata describes the GitHub artifacts; the transfer archive is a separate,
// operator-attested binding covering both source folders, not an artifact ZIP.
function validateSources(sources) {
  if (!Array.isArray(sources) || sources.length !== 2) fail('exactly two source runs required');
  const runs = new Set();
  const artifacts = new Set();
  const folders = new Set();
  for (const source of sources) {
    if (!source || !positiveInteger(source.runId) || runs.has(source.runId) ||
        typeof source.headSha !== 'string' || !/^[0-9a-f]{40}$/u.test(source.headSha) ||
        source.conclusion !== 'success' || source.shardCount !== 6 ||
        typeof source.reportRoot !== 'string' || !source.reportRoot.startsWith('/') ||
        !Array.isArray(source.reportFiles) || source.reportFiles.length !== 12 ||
        !Array.isArray(source.githubArtifacts) || source.githubArtifacts.length !== 6) fail('invalid or duplicate source run');
    runs.add(source.runId);
    canonicalInputPath(source.reports);
    if (folders.has(source.reports)) fail('duplicate source reports');
    folders.add(source.reports);
    const expected = new Set(Array.from({ length: 6 }, (_, index) => `backend-unit-report-${index + 1}`));
    const files = new Set();
    for (const file of source.reportFiles) {
      if (!file || !sha256(file.sha256)) fail('invalid source report digest');
      canonicalInputPath(file.path);
      if (files.has(file.path)) fail('duplicate source report');
      files.add(file.path);
    }
    for (const name of expected) {
      for (const kind of ['execution', 'inventory']) {
        if (!files.has(`${source.reports}/${name}/${kind}.json`)) fail('incomplete source report binding');
      }
    }
    for (const artifact of source.githubArtifacts) {
      if (!artifact || !positiveInteger(artifact.id) || artifacts.has(artifact.id) ||
          !expected.delete(artifact.name) || artifact.expired !== false ||
          typeof artifact.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(artifact.digest) ||
          artifact.workflow_run?.id !== source.runId || artifact.workflow_run?.head_sha !== source.headSha) fail('invalid source artifact binding');
      artifacts.add(artifact.id);
    }
  }
}

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
  if (!data || ![1, 2].includes(data.schemaVersion) || !data.durationsMs ||
      typeof data.durationsMs !== 'object' || Array.isArray(data.durationsMs)) fail('invalid duration manifest schema');
  if (data.schemaVersion === 1 && (!data.source || !/^[0-9a-f]{40}$/u.test(data.source.headSha) ||
      !positiveInteger(data.source.runId) || data.source.conclusion !== 'success')) fail('invalid duration manifest schema');
  const entries = Object.entries(data.durationsMs);
  if (!entries.length || entries.length > MAX_SUITES) fail('invalid duration manifest suite count');
  let total = 0;
  for (const [path, ms] of entries) {
    canonicalPath(path);
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) fail('invalid suite duration');
    total += ms;
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) fail('duration total overflow');
  }
  if (data.schemaVersion === 2) {
    if (data.policy !== 'max-of-two-successful-runs' || !sha256(data.fullTransferArchiveSha256) ||
        data.inventorySha256 !== inventoryDigest(entries.map(([path]) => path))) fail('invalid multi-run policy or inventory binding');
    validateSources(data.sources);
    for (const source of data.sources) {
      if (source.proof?.shards !== 6 || source.proof?.suites !== entries.length ||
          !positiveInteger(source.proof?.tests)) fail('incomplete source proof');
    }
    if (entries.some(([, ms]) => !Number.isSafeInteger(ms))) fail('invalid actual suite duration');
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
Object.assign(module.exports, { canonicalPath, canonicalInputPath, validateSources, inventoryDigest,
  parseManifest, readManifest, medianDuration, assignShards });
