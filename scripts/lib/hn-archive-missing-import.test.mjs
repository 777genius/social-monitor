import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
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
const policy = await import('./hn-archive-missing-policy.ts');
const normalizer = await import('./hn-archive-missing-normalizer.ts');
const { hnArchiveJournalReceipt, hnArchiveSemanticKey, validateHnArchiveClaim } = policy;
const { executeHnArchiveMissingImport, normalizeHnArchiveMissing } = normalizer;

const sha = (value) => createHash('sha256').update(value).digest('hex');
const scope = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  workspaceId: '10000000-0000-4000-8000-000000000002',
  interestId: '10000000-0000-4000-8000-000000000003',
  sourceBindingId: '10000000-0000-4000-8000-000000000004',
  scanPolicyId: '10000000-0000-4000-8000-000000000005',
};
const item = {
  externalId: 'hn:42', objectId: 42, title: 'A retained story',
  url: 'https://example.test/story', author: 'alice', points: 7,
  createdAt: '2026-10-17T08:00:00.000Z', publishedUtcDate: '2026-10-17',
  storyText: 'Authentic story text', commentCount: 1,
  comments: [{
    id: 43, author: 'bob', createdAt: '2026-10-17T08:05:00.000Z',
    depth: 2, text: 'Authentic comment text',
  }],
  retrievedForPass: 1, provenance: { archive: 'hn-algolia', packet: 'authentic' },
};
const manifest = {
  generatedAt: '2026-10-17T09:00:00.000Z', jobId: 'retained-hn',
  window: { from: '2026-09-20', to: '2026-10-17' }, count: 1,
  fetchErrors: 0, items: [item], itemsSha256: sha('items'),
};
const plan = {
  schemaVersion: 1, kind: 'hn-archive-missing.v1', day: '2026-10-17',
  providerKey: 'hacker-news', coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS',
  semanticKey: hnArchiveSemanticKey({ day: '2026-10-17', itemsSha256: sha('items'), selectedIds: ['hn:42'] }),
  planSha256: sha('plan'), packetSha256: sha('packet'),
  manifestSha256: sha('manifest'), itemsSha256: manifest.itemsSha256, scope,
  bindingConfig: '{}', bindingConfigSha256: sha('{}'),
  selectedIds: ['hn:42'], candidateIds: ['hn:42'],
};

test('HN refuses claim and plan digest mismatches before any write', async () => {
  let writes = 0;
  await assert.rejects(executeHnArchiveMissingImport({ ...plan, planSha256: sha('wrong') }, manifest, {
    existingIds: async () => [],
    insertMissing: async () => { writes += 1; return 1; },
    present: async () => 1,
    projectComments: async () => 1,
  }, plan.planSha256));
  assert.equal(writes, 0);
  assert.throws(() => validateHnArchiveClaim({
    mode: 'import-hn-archive-missing', inputRoot: '/input', day: plan.day,
    journalDir: '/journal', semanticKey: plan.semanticKey,
    planSha256: plan.planSha256, packetSha256: plan.packetSha256, correlationId: 'corr',
  }, { ...plan, packetSha256: sha('other') }));
});

test('HN refuses packet day mismatch and round-trips comment fields', () => {
  assert.throws(() => normalizeHnArchiveMissing(manifest, '2026-10-16', ['hn:42']));
  const result = normalizeHnArchiveMissing(manifest, plan.day, plan.selectedIds);
  assert.deepEqual(result.conversationUnits.map(({ providerUnitId, body, publishedAt, depth }) =>
    ({ providerUnitId, body, publishedAt, depth })), [{
    providerUnitId: 'hn:43', body: 'Authentic comment text',
    publishedAt: new Date('2026-10-17T08:05:00.000Z'), depth: 2,
  }]);
});

test('HN re-run is idempotent over already-present native IDs', async () => {
  const first = await executeHnArchiveMissingImport(plan, manifest, {
    existingIds: async () => [], insertMissing: async () => 1,
    present: async () => 1, projectComments: async () => 1,
  });
  const second = await executeHnArchiveMissingImport(plan, manifest, {
    existingIds: async () => ['hn:42'],
    insertMissing: async () => { throw new Error('must not insert'); },
    present: async () => 1,
    projectComments: async () => { throw new Error('must not reproject'); },
  });
  assert.deepEqual(first, { inserted: 1, alreadyPresent: 0, postWritePresent: 1 });
  assert.deepEqual(second, { inserted: 0, alreadyPresent: 1, postWritePresent: 1 });
});

test('HN journal receipt has exactly the required keys', () => {
  assert.deepEqual(Object.keys(hnArchiveJournalReceipt({
    plan, coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS', status: 'complete',
    inserted: 1, alreadyPresent: 0, postWritePresent: 1,
  })).sort(), [
    'alreadyPresent', 'bindingConfigSha256', 'candidateIds', 'coverage', 'day',
    'inserted', 'itemsSha256', 'planSha256', 'packetSha256', 'postWritePresent',
    'providerKey', 'schemaVersion', 'scope', 'semanticKey', 'status',
  ].sort());
});
