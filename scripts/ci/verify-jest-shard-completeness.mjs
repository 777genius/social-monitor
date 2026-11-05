#!/usr/bin/env node
// Dependency-free: the aggregate never installs or executes artifact-supplied code.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const fail = (message) => { throw new Error(message); };
const sameSet = (left, right) => left.size === right.size && [...left].every((item) => right.has(item));
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;

export function unitPath(value, root) {
  if (typeof value !== 'string' || !value || [...value].some((character) => character.charCodeAt(0) < 32 || '\\*?[]'.includes(character))) fail('invalid suite path');
  const path = isAbsolute(value) ? relative(resolve(root), value).split(sep).join('/') : value;
  if (path.startsWith('/') || path.split('/').some((part) => !part || part === '.' || part === '..') ||
      !path.endsWith('.spec.ts')) fail('suite path escapes root or is not a unit candidate');
  return path;
}

export function parseExclusions(source) {
  const paths = source.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const normalized = paths.map((path) => unitPath(path, '.'));
  if (paths.some(isAbsolute) || new Set(normalized).size !== normalized.length) fail('invalid exclusion manifest');
  return normalized;
}

// Both discovery and execution use this same anchored exact-path exclusion
// selector. Preserve Jest's existing generated/build/dependency ignores when
// overriding testPathIgnorePatterns; never expand the unit corpus to E2E/Node.
export function unitIgnorePattern(exclusions) {
  const escaped = exclusions.map((path) => unitPath(path, '.').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  return '/node_modules/|/dist/|/prisma/generated/' +
    (escaped.length ? `|(?:^|/)(?:${escaped.join('|')})$` : '');
}

// trackedPaths is supplied by git ls-files, never by an artifact's claimed inventory.
export function verifyShardReports({ reports, trackedPaths, exclusions = [], root = '.', shardCount = 4 }) {
  if (!integer(shardCount, 1) || shardCount > 100) fail('invalid shard count');
  if (!Array.isArray(reports) || reports.length !== shardCount) fail('missing shard report');
  const candidates = new Set(trackedPaths.filter((path) => path.endsWith('.spec.ts')).map((path) => unitPath(path, root)));
  for (const path of exclusions) {
    if (!candidates.delete(unitPath(path, root))) fail('exclusion is stale or not a tracked unit candidate');
  }
  if (!candidates.size) fail('empty tracked unit inventory');
  const seen = new Set();
  const ids = new Set();
  let tests = 0;
  for (const report of reports) {
    if (!integer(report.shard, 1) || report.shard > shardCount || ids.has(report.shard)) fail('invalid or duplicate shard id');
    ids.add(report.shard);
    if (!Array.isArray(report.inventory) || !report.inventory.length) fail('missing or empty full inventory');
    const inventory = report.inventory.map((path) => unitPath(path, root));
    if (new Set(inventory).size !== inventory.length || !sameSet(new Set(inventory), candidates)) {
      fail('full inventory differs from tracked candidates or between shards');
    }
    const execution = report.execution;
    if (!execution || execution.success !== true || !integer(execution.numTotalTests, 1) ||
        execution.numFailedTests !== 0 || execution.numFailedTestSuites !== 0 ||
        execution.numRuntimeErrorTestSuites !== 0 || execution.wasInterrupted !== false ||
        !Array.isArray(execution.testResults) || !execution.testResults.length ||
        execution.numTotalTestSuites !== execution.testResults.length) fail('empty, failed or incomplete execution report');
    let assertions = 0;
    for (const suite of execution.testResults) {
      const path = unitPath(suite.name, root);
      if (!candidates.has(path) || seen.has(path)) fail('unexpected or duplicate executed suite');
      // Jest calls a successful suite with pending assertions focused. Require
      // an executed pass for either accepted status; skips alone prove no execution.
      if (!['passed', 'focused'].includes(suite.status) || !Array.isArray(suite.assertionResults) ||
          !suite.assertionResults.some((test) => test.status === 'passed') ||
          (suite.status === 'focused' && !suite.assertionResults.some((test) =>
            ['pending', 'disabled'].includes(test.status))) ||
          suite.testExecError != null || suite.assertionResults.some((test) =>
            !['passed', 'pending', 'todo', 'disabled'].includes(test.status))) fail('failed or runtime-error suite');
      assertions += suite.assertionResults.length;
      seen.add(path);
    }
    if (assertions !== execution.numTotalTests) fail('test count differs from executed assertions');
    tests += assertions;
  }
  if (!sameSet(seen, candidates)) fail('unit suite missing from execution');
  return { shards: ids.size, suites: seen.size, tests };
}

function readJson(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024 * 1024) fail('invalid or oversized JSON report');
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadShardReports(directory, shardCount = 4) {
  if (!integer(shardCount, 1) || shardCount > 100) fail('invalid shard count');
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('invalid report directory');
  const entries = readdirSync(directory).sort();
  const expected = Array.from({ length: shardCount }, (_, index) => `backend-unit-report-${index + 1}`);
  if (JSON.stringify(entries) !== JSON.stringify([...expected].sort())) fail('unexpected artifact names or missing shard artifact');
  return expected.map((name, index) => {
    const folder = resolve(directory, name);
    const stat = lstatSync(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink() ||
        JSON.stringify(readdirSync(folder).sort()) !== JSON.stringify(['execution.json', 'inventory.json'])) {
      fail('unexpected artifact files');
    }
    return { shard: index + 1, inventory: readJson(resolve(folder, 'inventory.json')),
      execution: readJson(resolve(folder, 'execution.json')) };
  });
}

export function main(args) {
  if (args.length === 2 && args[0] === '--ignore-pattern') {
    console.log(unitIgnorePattern(parseExclusions(readFileSync(args[1], 'utf8'))));
    return;
  }
  if (![6, 8].includes(args.length) || args[0] !== '--reports' || args[2] !== '--root' || args[4] !== '--exclusions' || (args.length === 8 &&
      (args[6] !== '--shards' || !/^[1-9][0-9]*$/u.test(args[7])))) {
    fail('usage: --reports DIR --root ROOT --exclusions FILE [--shards COUNT]');
  }
  const shardCount = args.length === 8 ? Number(args[7]) : 4;
  if (!integer(shardCount, 1) || shardCount > 100) fail('invalid shard count');
  const root = resolve(args[3]);
  const trackedPaths = execFileSync('git', ['ls-files', '-z', '--', '*.spec.ts'], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  const result = verifyShardReports({ root, trackedPaths, shardCount,
    exclusions: parseExclusions(readFileSync(args[5], 'utf8')), reports: loadShardReports(args[1], shardCount) });
  console.log(`Jest completeness proved: ${result.shards} shards, ${result.suites} suites, ${result.tests} tests`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) {
    // Do not print hostile report contents, filenames, payloads or stacks.
    console.error(`Jest completeness rejected: ${error instanceof SyntaxError ? 'invalid JSON' : error.message}`);
    process.exitCode = 1;
  }
}
