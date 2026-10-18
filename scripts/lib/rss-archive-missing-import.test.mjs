import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    try { return await nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('./') && !specifier.endsWith('.ts')) {
        return nextResolve(specifier + '.ts', context);
      }
      throw error;
    }
  }
`)}`, import.meta.url);
const policy = await import('./rss-archive-missing-policy.ts');
const normalizer = await import('./rss-archive-missing-normalizer.ts');
const { rssArchiveJournalReceipt, rssArchiveSemanticKey, validateRssArchiveClaim } = policy;
const { executeRssArchiveMissingImport, normalizeRssArchiveMissing } = normalizer;

const sha = (value) => createHash('sha256').update(value).digest('hex');
const scope = {
  tenantId: '20000000-0000-4000-8000-000000000001',
  workspaceId: '20000000-0000-4000-8000-000000000002',
  interestId: '20000000-0000-4000-8000-000000000003',
  sourceBindingId: '20000000-0000-4000-8000-000000000004',
  scanPolicyId: '20000000-0000-4000-8000-000000000005',
};
const manifest = {
  generatedAt: '2026-10-17T09:00:00.000Z', jobId: 'retained-rss',
  window: { from: '2026-09-20', to: '2026-10-17' }, count: 2, enrichedWithLink: 1,
  items: [
    {
      guid: 'guid-with-link', publishedUtcDate: '2026-10-17', title: 'Linked',
      provenance: { reconciliationPacket: 'authentic' },
      link: 'https://example.test/linked', description: 'Linked description',
    },
    {
      guid: 'google-news-guid-only', publishedUtcDate: '2026-10-17', title: 'Guid only',
      provenance: { reconciliationPacket: 'authentic' }, link: null,
      description: 'Guid-only description',
    },
  ],
  itemsSha256: sha('rss-items'),
};
const plan = {
  schemaVersion: 1, kind: 'rss-archive-missing.v1', day: '2026-10-17',
  providerKey: 'rss', coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS',
  semanticKey: rssArchiveSemanticKey({
    day: '2026-10-17', itemsSha256: sha('rss-items'),
    selectedIds: ['guid-with-link', 'google-news-guid-only'],
  }),
  planSha256: sha('rss-plan'),
  packetSha256: sha('rss-packet'), manifestSha256: sha('rss-manifest'),
  itemsSha256: manifest.itemsSha256, scope, bindingConfig: '{}',
  bindingConfigSha256: sha('{}'),
  selectedIds: ['guid-with-link', 'google-news-guid-only'],
  candidateIds: ['guid-with-link', 'google-news-guid-only'],
};

test('RSS refuses claim and plan digest mismatches before any write', async () => {
  let writes = 0;
  await assert.rejects(executeRssArchiveMissingImport({ ...plan, planSha256: sha('wrong') }, manifest, {
    existingIds: async () => [],
    insertMissing: async () => { writes += 1; return 1; },
    present: async () => 2,
  }, plan.planSha256));
  assert.equal(writes, 0);
  const invocation = {
    inputRoot: '/input', day: plan.day, journalDir: '/journal',
    semanticKey: plan.semanticKey, planSha256: plan.planSha256,
    packetSha256: plan.packetSha256, correlationId: 'corr',
  };
  assert.throws(() => validateRssArchiveClaim({
    mode: 'import-rss-archive-missing', ...invocation,
  }, { ...plan, packetSha256: sha('other') }, invocation));
  assert.throws(() => validateRssArchiveClaim({
    mode: 'import-rss-archive-missing', ...invocation,
  }, plan, { ...invocation, journalDir: '/other' }));
});

test('RSS refuses packet day mismatch and preserves guid-only day precision', () => {
  assert.throws(() => normalizeRssArchiveMissing(manifest, '2026-10-16', plan.selectedIds));
  const result = normalizeRssArchiveMissing(manifest, plan.day, plan.selectedIds);
  assert.equal(result.items[1].externalId, 'google-news-guid-only');
  assert.equal(result.items[1].canonicalUrl, 'https://news.google.com/rss/articles/google-news-guid-only');
  assert.equal(result.items[1].metadata.publishedPrecision, 'day');
  assert.equal(result.items[1].metadata.canonicalUrlSource, 'google-news-guid-fallback');
});

test('RSS accepts key-omitted guid-only items and canonicalizes nulls', () => {
  const raw = {
    generatedAt: '2026-10-17T09:00:00.000Z', jobId: 'retained-rss',
    window: { from: '2026-09-20', to: '2026-10-17' }, count: 1, enrichedWithLink: 0,
    items: [{
      guid: 'google-news-keyless', publishedUtcDate: '2026-10-17', title: 'Keyless',
      provenance: { reconciliationPacket: 'authentic' },
    }],
    itemsSha256: sha('keyless'),
  };
  const result = normalizeRssArchiveMissing(raw, '2026-10-17', ['google-news-keyless']);
  assert.equal(result.items[0].body, '');
  assert.equal(result.items[0].canonicalUrl, 'https://news.google.com/rss/articles/google-news-keyless');
  assert.equal(result.items[0].metadata.description, null);
  assert.equal(result.items[0].metadata.canonicalUrlSource, 'google-news-guid-fallback');
  assert.throws(() => normalizeRssArchiveMissing(
    { ...raw, items: [{ ...raw.items[0], extra: 1 }] }, '2026-10-17', ['google-news-keyless']));
});

test('RSS re-run is idempotent over already-present native IDs', async () => {
  const first = await executeRssArchiveMissingImport(plan, manifest, {
    existingIds: async () => [], insertMissing: async () => 2, present: async () => 2,
  });
  const second = await executeRssArchiveMissingImport(plan, manifest, {
    existingIds: async () => plan.selectedIds,
    insertMissing: async () => { throw new Error('must not insert'); },
    present: async () => 2,
  });
  assert.deepEqual(first, { inserted: 2, alreadyPresent: 0, postWritePresent: 2 });
  assert.deepEqual(second, { inserted: 0, alreadyPresent: 2, postWritePresent: 2 });
});

test('RSS journal receipt has exactly the required keys', () => {
  assert.deepEqual(Object.keys(rssArchiveJournalReceipt({
    plan, coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS', status: 'complete',
    inserted: 2, alreadyPresent: 0, postWritePresent: 2,
  })).sort(), [
    'alreadyPresent', 'bindingConfigSha256', 'candidateIds', 'coverage', 'day',
    'inserted', 'itemsSha256', 'planSha256', 'packetSha256', 'postWritePresent',
    'providerKey', 'schemaVersion', 'scope', 'semanticKey', 'status',
  ].sort());
});

test('RSS fallback URL percent-encodes raw GUIDs', () => {
  const guid = 'https://news.google.com/rss/articles/CBMi?oc=5#frag';
  const raw = {
    generatedAt: '2026-10-17T09:00:00.000Z', jobId: 'retained-rss',
    window: { from: '2026-09-20', to: '2026-10-17' }, count: 1, enrichedWithLink: 0,
    items: [{
      guid, publishedUtcDate: '2026-10-17', title: 'Encoded guid',
      provenance: { reconciliationPacket: 'authentic' },
    }],
    itemsSha256: sha('encoded-guid'),
  };
  const result = normalizeRssArchiveMissing(raw, '2026-10-17', [guid]);
  assert.equal(result.items[0].canonicalUrl,
    `https://news.google.com/rss/articles/${encodeURIComponent(guid)}`);
  assert.notEqual(result.items[0].canonicalUrl, `https://news.google.com/rss/articles/${guid}`);
});

test('RSS planner pins packetSha256 to exact packet.json file bytes', async () => {
  const { writeRssArchiveMissingPackets } = await import('../plan-rss-archive-missing-packets.ts');
  process.env.MISSING_IMPORT_SCOPE_JSON = JSON.stringify(scope);
  process.env.MISSING_IMPORT_BINDING_CONFIG = '{}';
  const root = await mkdtemp(join(tmpdir(), 'rss-packets-'));
  const manifestPath = join(root, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest));
  const [directory] = await writeRssArchiveMissingPackets(manifestPath, join(root, 'packets'));
  const packetBytes = await readFile(join(directory, 'packet.json'));
  const planned = JSON.parse(await readFile(join(directory, 'plan.json'), 'utf8'));
  assert.equal(sha(packetBytes), planned.packetSha256);
  assert.equal(planned.semanticKey, plan.semanticKey);
});
