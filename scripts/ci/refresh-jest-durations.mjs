#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sequencer from './jest-duration-sequencer.cjs';
import { loadShardReports, unitPath, verifyShardReports } from './verify-jest-shard-completeness.mjs';

const fail = (message) => { throw new Error(message); };
export function validateBinding(binding, sourceSha) {
  if (!/^[0-9a-f]{40}$/u.test(sourceSha) || !binding || binding.head_sha !== sourceSha ||
      binding.conclusion !== 'success' || !Number.isSafeInteger(binding.run_id) || binding.run_id < 1 ||
      !/^[0-9a-f]{64}$/u.test(binding.report_archive_sha256)) fail('failed or mismatched source binding');
  return { runId: binding.run_id, headSha: binding.head_sha, conclusion: 'success',
    archiveSha256: binding.report_archive_sha256 };
}

export function refreshDurations({ reports, binding, sourceSha, reportRoot, currentInventory }) {
  const source = validateBinding(binding, sourceSha);
  if (!reports.length) fail('missing execution reports');
  const inventory = reports[0].inventory.map((path) => unitPath(path, reportRoot));
  // Reuse the landed PR1 proof without altering it: full identical inventories,
  // all successful assertions, unique execution union and all shards present.
  const proof = verifyShardReports({ reports, trackedPaths: inventory, root: reportRoot, shardCount: reports.length });
  const measured = new Map();
  for (const report of reports) {
    for (const suite of report.execution.testResults) {
      if (!Number.isSafeInteger(suite.startTime) || !Number.isSafeInteger(suite.endTime) ||
          suite.startTime < 0 || suite.endTime < suite.startTime) fail('missing or invalid actual suite timestamps');
      measured.set(unitPath(suite.name, reportRoot), suite.endTime - suite.startTime);
    }
  }
  const current = currentInventory === undefined ? inventory : currentInventory.map((path) => unitPath(path, '.'));
  if (new Set(current).size !== current.length || !current.length) fail('invalid current inventory');
  const currentSet = new Set(current);
  const unknown = current.filter((path) => !measured.has(path)).sort();
  const deleted = [...measured.keys()].filter((path) => !currentSet.has(path)).sort();
  const durationsMs = Object.fromEntries([...measured].filter(([path]) => currentSet.has(path)).sort(([a], [b]) => a < b ? -1 : 1));
  const manifest = { schemaVersion: 1, source, durationsMs };
  sequencer.parseManifest(JSON.stringify(manifest));
  return { manifest, proof, unknown, deleted };
}

function boundedJson(path, maxBytes) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) fail('invalid JSON input file');
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function main(args) {
  const allowed = new Set(['--reports', '--binding', '--source-sha', '--report-root', '--out', '--current-inventory']);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || options[args[index]] !== undefined || !args[index + 1]) fail('invalid refresh arguments');
    options[args[index]] = args[index + 1];
  }
  if ([...allowed].slice(0, 5).some((key) => !options[key])) fail('usage: --reports DIR --binding FILE --source-sha SHA --report-root ROOT --out FILE [--current-inventory FILE]');
  const reports = loadShardReports(options['--reports']);
  const result = refreshDurations({ reports, binding: boundedJson(options['--binding'], 65536),
    sourceSha: options['--source-sha'], reportRoot: options['--report-root'],
    currentInventory: options['--current-inventory'] ? boundedJson(options['--current-inventory'], 4 * 1024 * 1024) : undefined });
  result.manifest.source.reportSha256 = reports.map(({ shard }) => {
    const path = resolve(options['--reports'], `backend-unit-report-${shard}`, 'execution.json');
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  });
  // Generated compact data: two measurements per line, comfortably below source cap.
  const entries = Object.entries(result.manifest.durationsMs);
  const rows = [];
  for (let index = 0; index < entries.length; index += 2) {
    rows.push('  ' + entries.slice(index, index + 2).map(([path, ms]) => `${JSON.stringify(path)}:${ms}`).join(',') + (index + 2 < entries.length ? ',' : ''));
  }
  writeFileSync(options['--out'], `{"schemaVersion":1,"source":${JSON.stringify(result.manifest.source)},"durationsMs":{\n${rows.join('\n')}\n}}\n`);
  console.log(JSON.stringify({ ...result.proof, measured: entries.length, unknown: result.unknown, deleted: result.deleted,
    source: result.manifest.source }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
