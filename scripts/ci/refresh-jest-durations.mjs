#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

function boundedBytes(path, maxBytes) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes ||
      realpathSync(path) !== resolve(path)) fail('invalid JSON input file');
  const bytes = readFileSync(path);
  if (bytes.length > maxBytes) fail('oversized JSON input file');
  return bytes;
}
const boundedJson = (path, maxBytes) => JSON.parse(boundedBytes(path, maxBytes).toString('utf8'));

export function refreshMultiDurations({ declaration, inputRoot, currentInventory }) {
  sequencer.validateSources(declaration?.sources);
  if (typeof declaration.fullTransferArchiveSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(declaration.fullTransferArchiveSha256)) fail('missing full transfer archive binding');
  const sources = [];
  let durationsMs;
  for (const declared of [...declaration.sources].sort((a, b) => a.runId - b.runId)) {
    const reportFiles = [...declared.reportFiles].sort((a, b) => a.path < b.path ? -1 : 1);
    for (const file of reportFiles) {
      const digest = createHash('sha256').update(boundedBytes(resolve(inputRoot, file.path), 128 * 1024 * 1024)).digest('hex');
      if (digest !== file.sha256) fail('source report digest mismatch');
    }
    const reports = loadShardReports(resolve(inputRoot, declared.reports), 6);
    const result = refreshDurations({ reports, sourceSha: declared.headSha, reportRoot: declared.reportRoot,
      binding: { head_sha: declared.headSha, run_id: declared.runId, conclusion: declared.conclusion,
        report_archive_sha256: declaration.fullTransferArchiveSha256 } });
    // The legacy verifier also accepts pending assertions; weights require all
    // assertions to have actually passed in each independently complete run.
    if (reports.some(({ execution }) => execution.testResults.some((suite) =>
      suite.assertionResults.some((assertion) => assertion.status !== 'passed')))) fail('unsuccessful source assertions');
    const measured = result.manifest.durationsMs;
    if (durationsMs && JSON.stringify(Object.keys(durationsMs)) !== JSON.stringify(Object.keys(measured))) fail('inconsistent source inventories');
    durationsMs = Object.fromEntries(Object.entries(measured).map(([path, ms]) => [path, Math.max(ms, durationsMs?.[path] ?? 0)]));
    sources.push({ runId: declared.runId, headSha: declared.headSha, conclusion: declared.conclusion,
      shardCount: 6, reports: declared.reports, reportRoot: declared.reportRoot,
      reportFiles: reportFiles.map(({ path, sha256 }) => ({ path, sha256 })),
      githubArtifacts: [...declared.githubArtifacts].sort((a, b) => a.name < b.name ? -1 : 1).map((artifact) => ({
        id: artifact.id, name: artifact.name, digest: artifact.digest, expired: false,
        workflow_run: { id: artifact.workflow_run.id, head_sha: artifact.workflow_run.head_sha },
      })), proof: result.proof });
  }
  if (currentInventory !== undefined) {
    if (!Array.isArray(currentInventory)) fail('invalid current inventory');
    const current = currentInventory.map((path) => unitPath(path, '.')).sort();
    if (JSON.stringify(current) !== JSON.stringify(Object.keys(durationsMs))) fail('current inventory differs from source inventories');
  }
  const manifest = { schemaVersion: 2, policy: 'max-of-two-successful-runs',
    fullTransferArchiveSha256: declaration.fullTransferArchiveSha256,
    inventorySha256: sequencer.inventoryDigest(Object.keys(durationsMs)), sources, durationsMs };
  sequencer.parseManifest(JSON.stringify(manifest));
  return { manifest, proofs: sources.map(({ runId, proof }) => ({ runId, ...proof })), unknown: [], deleted: [] };
}

export function main(args) {
  const allowed = new Set(['--reports', '--binding', '--source-sha', '--report-root', '--out', '--current-inventory', '--sources']);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || options[args[index]] !== undefined || !args[index + 1]) fail('invalid refresh arguments');
    options[args[index]] = args[index + 1];
  }
  const legacy = [...allowed].slice(0, 4);
  if (!options['--out'] || (options['--sources'] ? legacy.some((key) => options[key]) : legacy.some((key) => !options[key]))) {
    fail('usage: --sources FILE --out FILE [--current-inventory FILE] OR --reports DIR --binding FILE --source-sha SHA --report-root ROOT --out FILE [--current-inventory FILE]');
  }
  const currentInventory = options['--current-inventory'] ? boundedJson(options['--current-inventory'], 4 * 1024 * 1024) : undefined;
  // This refresh CLI intentionally reads the actual historical four-report source.
  // Pipeline completeness independently supplies --shards 6; never relabel provenance.
  let result;
  if (options['--sources']) {
    result = refreshMultiDurations({ declaration: boundedJson(options['--sources'], 65536),
      inputRoot: dirname(resolve(options['--sources'])), currentInventory });
  } else {
    const reports = loadShardReports(options['--reports'], 4);
    result = refreshDurations({ reports, binding: boundedJson(options['--binding'], 65536),
      sourceSha: options['--source-sha'], reportRoot: options['--report-root'], currentInventory });
    result.manifest.source.reportSha256 = reports.map(({ shard }) => {
      const path = resolve(options['--reports'], `backend-unit-report-${shard}`, 'execution.json');
      return createHash('sha256').update(boundedBytes(path, 128 * 1024 * 1024)).digest('hex');
    });
  }
  // Generated compact data: two measurements per line, comfortably below source cap.
  const entries = Object.entries(result.manifest.durationsMs);
  const rows = [];
  for (let index = 0; index < entries.length; index += 2) {
    rows.push('  ' + entries.slice(index, index + 2).map(([path, ms]) => `${JSON.stringify(path)}:${ms}`).join(',') + (index + 2 < entries.length ? ',' : ''));
  }
  const metadata = { ...result.manifest };
  delete metadata.durationsMs;
  const prefix = JSON.stringify(metadata).slice(0, -1);
  writeFileSync(options['--out'], `${prefix},"durationsMs":{\n${rows.join('\n')}\n}}\n`);
  console.log(JSON.stringify({ ...result.proof, proofs: result.proofs, measured: entries.length,
    unknown: result.unknown, deleted: result.deleted, ...metadata }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
