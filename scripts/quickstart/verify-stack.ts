import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { readPublicDefaults } from './local-config';
import type { BootstrapState } from './bootstrap-state';

async function main(): Promise<void> {
  const directory = resolve(process.argv[2] ?? '');
  const origin = new URL(process.argv[3] ?? '');
  const output = process.argv[4];
  const collectionOnly = process.argv.includes('--collection-only');
  assert(basename(directory).startsWith('TEST-'), 'E2E requires an explicitly TEST-only installation');
  assert(['localhost', '127.0.0.1'].includes(origin.hostname), 'E2E only contacts loopback');
  assert(origin.protocol === 'http:' && origin.pathname === '/', 'Expected a local origin');
  const defaults = await readPublicDefaults();
  const headers = {
    'x-tenant-id': defaults.SOCIAL_MONITOR_TENANT_ID,
    'x-workspace-id': defaults.SOCIAL_MONITOR_WORKSPACE_ID,
  };
  const get = (path: string, extra: Record<string, string> = {}) => fetch(new URL(path, origin), {
    headers: { ...headers, ...extra }, signal: AbortSignal.timeout(30_000),
  });
  assert.equal((await get('/ready')).status, 200);
  const page = await get('/summaries');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /flutter_bootstrap/u);
  assert.equal((await get('/flutter_bootstrap.js')).status, 200);
  assert.equal((await get('/api/interests')).status, 200);
  assert.equal((await get('/api/interests', { origin: 'https://foreign.example.test' })).status, 403);
  // Fetch implementations may replace the Host header; exercise the actual wire header.
  const foreignHostStatus = await new Promise<number>((resolveStatus, reject) => {
    const request = httpRequest(new URL('/ready', origin), { headers: { host: 'foreign.example.test' } }, (response) => {
      response.resume();
      resolveStatus(response.statusCode ?? 0);
    });
    request.setTimeout(30_000, () => request.destroy(new Error('TEST host probe timed out')));
    request.on('error', reject);
    request.end();
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await get('/api/interests', {
    'x-workspace-id': '00000000-0000-7000-8000-000000000999',
  })).status, 403);
  const state = JSON.parse(await readFile(join(directory, 'bootstrap.json'), 'utf8')) as BootstrapState;
  assert(state.interestId, 'Starter interest must exist');
  if (!collectionOnly) assert(state.readerSummaryId && state.readerSummaryJobId, 'First-run summary must be complete');
  assert.equal(Object.keys(state.sources).length, 2);
  const fetched: Record<string, number> = {};
  for (const [provider, entry] of Object.entries(state.sources)) {
    assert(entry.scanJobId, 'Initial scan ID must be persisted');
    const response = await get(`/api/scan-requests/${entry.scanJobId}/status`);
    assert.equal(response.status, 200);
    const scan = await response.json() as { status: string; latestAttempt: { fetched: number } };
    assert.equal(scan.status, 'succeeded');
    assert(scan.latestAttempt.fetched > 0, `${provider} must collect live content`);
    fetched[provider] = scan.latestAttempt.fetched;
  }
  let citations = 0;
  if (!collectionOnly) {
    const summaryResponse = await get(`/api/reader-summaries/${state.readerSummaryId}`);
    assert.equal(summaryResponse.status, 200);
    const summary = await summaryResponse.json() as {
      readerSummaryId: string; headline: string; executiveSummary: string; citations: unknown[];
      tenantId: string; workspaceId: string;
    };
    assert.equal(summary.readerSummaryId, state.readerSummaryId);
    assert.equal(summary.tenantId, defaults.SOCIAL_MONITOR_TENANT_ID);
    assert.equal(summary.workspaceId, defaults.SOCIAL_MONITOR_WORKSPACE_ID);
    assert(summary.headline.trim().length > 0 && summary.executiveSummary.trim().length > 0);
    assert(summary.citations.length > 0, 'Published first summary must retain evidence');
    citations = summary.citations.length;
  }
  const checksum = execFileSync('cksum', { input: directory, encoding: 'utf8' }).trim().split(/\s/u)[0];
  assert(checksum && /^\d+$/u.test(checksum));
  const container = `sm-${checksum}-postgres-1`;
  const sql = `SELECT json_build_object(
    'interests', (SELECT count(*) FROM interests),
    'bindings', (SELECT count(*) FROM source_bindings),
    'policies', (SELECT count(*) FROM scan_policies),
    'sourceItems', (SELECT count(*) FROM source_items),
    'feedItems', (SELECT count(*) FROM feed_items),
    'assessments', (SELECT count(*) FROM reader_value_assessments),
    'publications', (SELECT count(*) FROM reader_summary_publications),
    'unsafeRuntimeRoles', (SELECT count(*) FROM pg_roles WHERE
      rolname IN ('social_monitor_app','social_monitor_system_app') AND
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)))`;
  const database = JSON.parse(execFileSync('docker', [
    'exec', container, 'psql', '-U', 'social_monitor', '-d', 'social_monitor', '-qAt', '-c', sql,
  ], { encoding: 'utf8', timeout: 30_000 })) as Record<string, number>;
  assert.equal(database.bindings, 2);
  assert.equal(database.policies, 2);
  assert.equal(database.unsafeRuntimeRoles, 0);
  for (const field of collectionOnly ? ['sourceItems', 'feedItems'] : ['sourceItems', 'feedItems', 'assessments', 'publications']) {
    assert((database[field] ?? 0) > 0, `Database must retain ${field}`);
  }
  const evidence = {
    schemaVersion: 1, phase: collectionOnly ? 'collection' : 'ai-summary', checkedAt: new Date().toISOString(), origin: origin.origin,
    readerSummaryId: state.readerSummaryId, readerSummaryJobId: state.readerSummaryJobId,
    interestId: state.interestId, bindings: Object.values(state.sources).map((entry) => entry.bindingId).sort(),
    fetched, citations, database,
    configurationSha256: createHash('sha256').update(await readFile(join(directory, 'settings.json'))).digest('hex'),
  };
  if (output !== undefined) await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(evidence));
}

void main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error.message : 'TEST stack verification failed.');
  process.exitCode = 1;
});
