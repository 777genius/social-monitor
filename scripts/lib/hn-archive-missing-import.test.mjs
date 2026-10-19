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
  const invocation = {
    inputRoot: '/input', day: plan.day, journalDir: '/journal',
    semanticKey: plan.semanticKey, planSha256: plan.planSha256,
    packetSha256: plan.packetSha256, correlationId: 'corr',
  };
  assert.throws(() => validateHnArchiveClaim({
    mode: 'import-hn-archive-missing', ...invocation,
  }, { ...plan, packetSha256: sha('other') }, invocation));
  assert.throws(() => validateHnArchiveClaim({
    mode: 'import-hn-archive-missing', ...invocation,
  }, plan, { ...invocation, inputRoot: '/other' }));
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

test('HN preserves semantic pass labels and canonical wire IDs', () => {
  const wire = { ...item, objectId: '42', retrievedForPass: 'ai-infrastructure',
    comments: item.comments.map(comment => ({ ...comment, id: String(comment.id) })) };
  const result = normalizeHnArchiveMissing({ ...manifest, items: [wire] }, plan.day, plan.selectedIds);
  assert.equal(result.items[0].externalId, 'hn:42');
  assert.equal(result.items[0].metadata.retrievedForPass, 'ai-infrastructure');
  assert.equal(result.conversationUnits[0].providerUnitId, 'hn:43');
});

test('HN rejects noncanonical or unsafe wire IDs', () => {
  for (const objectId of ['042', '4e1', '+42', '42.0', ' 42', '9007199254740993', 0, -1, 1.5]) {
    assert.throws(() => policy.qualifyHnArchiveItem({ ...item, objectId,
      externalId: `hn:${objectId}` }, plan.day, 0));
  }
  for (const id of ['043', '0', '-1', '4.3', '9007199254740993']) {
    assert.throws(() => policy.qualifyHnArchiveItem({ ...item,
      comments: [{ ...item.comments[0], id }] }, plan.day, 0));
  }
});

const associationKey = 'hnFirebaseCommentAssociationsV1';
function firebaseResponse(id, parent, createdAt, extra = {}) {
  const body = JSON.stringify({ id, parent, type: 'comment', time: Date.parse(createdAt) / 1000, ...extra });
  return { url: `https://hacker-news.firebaseio.com/v0/item/${id}.json`, body, sha256: sha(body) };
}
function associatedOlderItem() {
  const leaf = { ...item.comments[0], createdAt: '2026-10-17T07:55:00.000Z' };
  return { ...structuredClone(item), comments: [leaf], provenance: { ...item.provenance,
    [associationKey]: { schemaVersion: 1, storyId: item.objectId, chains: [{ commentId: leaf.id, responses: [
      firebaseResponse(leaf.id, 44, leaf.createdAt),
      firebaseResponse(44, item.objectId, '2026-10-17T07:50:00.000Z'),
    ] }] },
  } };
}
function changeResponse(wire, index, patch) {
  const responses = wire.provenance[associationKey].chains[0].responses;
  const raw = { ...JSON.parse(responses[index].body), ...patch };
  responses[index].body = JSON.stringify(raw);
  responses[index].sha256 = sha(responses[index].body);
}

test('HN verifies older nested comments without rewriting retained timestamps, text or depth', () => {
  const wire = associatedOlderItem(), original = structuredClone(wire);
  const result = normalizeHnArchiveMissing({ ...manifest, items: [wire] }, plan.day, plan.selectedIds);
  assert.equal(result.items[0].publishedAt.toISOString(), item.createdAt);
  assert.deepEqual(result.conversationUnits.map(unit => ({ id: unit.providerUnitId,
    publishedAt: unit.publishedAt.toISOString(), text: unit.body, depth: unit.depth,
    parent: unit.parentProviderUnitId, parentId: unit.metadata.parentId })), [{
    id: 'hn:43', publishedAt: original.comments[0].createdAt, text: original.comments[0].text,
    depth: 2, parent: 'hn:44', parentId: 44,
  }]);
  assert.deepEqual(wire, original);
});

test('HN accepts an exact older direct-parent proof without fabricating a comment parent unit', () => {
  const wire = associatedOlderItem();
  wire.comments[0].depth = 1;
  wire.provenance[associationKey].chains[0].responses = [
    firebaseResponse(43, item.objectId, wire.comments[0].createdAt),
  ];
  const [unit] = normalizeHnArchiveMissing({ ...manifest, items: [wire] }, plan.day, plan.selectedIds).conversationUnits;
  assert.equal(unit.publishedAt.toISOString(), wire.comments[0].createdAt);
  assert.equal(unit.metadata.parentId, item.objectId);
  assert.equal(unit.parentProviderUnitId, undefined);
  assert.equal(unit.role, 'top_level_comment');
});

const invalidAssociations = [
  ['missing proof', wire => { delete wire.provenance[associationKey]; }],
  ['boolean proof', wire => { wire.provenance[associationKey] = true; }],
  ['arbitrary parent', wire => { delete wire.provenance[associationKey]; wire.provenance.parent = item.objectId; }],
  ['wrong root', wire => { wire.provenance[associationKey].storyId = 99; }],
  ['foreign final parent', wire => { changeResponse(wire, 1, { parent: 99 }); }],
  ['cycle', wire => { changeResponse(wire, 1, { parent: 43 }); }],
  ['wrong leaf', wire => { changeResponse(wire, 0, { id: 99 }); }],
  ['changed leaf time', wire => { changeResponse(wire, 0, { time: 1 }); }],
  ['wrong provider type', wire => { changeResponse(wire, 0, { type: 'story' }); }],
  ['string parent', wire => { changeResponse(wire, 0, { parent: '44' }); }],
  ['missing parent response', wire => { wire.provenance[associationKey].chains[0].responses.pop(); }],
  ['wrong depth', wire => { wire.comments[0].depth = 3; }],
  ['excessive depth', wire => { wire.comments[0].depth = 65;
    const chain = wire.provenance[associationKey].chains[0]; chain.responses = Array(65).fill(chain.responses[0]); }],
  ['tampered raw bytes', wire => { wire.provenance[associationKey].chains[0].responses[0].body += ' '; }],
  ['invalid raw hash', wire => { wire.provenance[associationKey].chains[0].responses[0].sha256 = 'a'.repeat(64); }],
  ['foreign response URL', wire => { wire.provenance[associationKey].chains[0].responses[0].url = 'https://example.test/item/43.json'; }],
  ['oversize response', wire => { const response = wire.provenance[associationKey].chains[0].responses[0];
    response.body += ' '.repeat(64 * 1024); response.sha256 = sha(response.body); }],
  ['duplicate leaf proofs', wire => { const chains = wire.provenance[associationKey].chains; chains.push(structuredClone(chains[0])); }],
  ['injected derived parent', wire => { wire.comments[0].verifiedParentId = 42; }],
];
for (const [label, mutate] of invalidAssociations) {
  test(`HN rejects ${label} before dependency reads or writes`, async () => {
    const wire = associatedOlderItem(); mutate(wire);
    const calls = [];
    await assert.rejects(executeHnArchiveMissingImport(plan, { ...manifest, items: [wire] }, {
      existingIds: async () => { calls.push('read'); return []; },
      insertMissing: async () => { calls.push('insert'); return 1; },
      present: async () => { calls.push('present'); return 1; },
      projectComments: async () => { calls.push('comments'); return 1; },
    }));
    assert.deepEqual(calls, []);
  });
}

test('HN rejects inconsistent retained ancestor identity even when its raw response hash is valid', () => {
  const wire = associatedOlderItem();
  wire.comments.push({ ...wire.comments[0], id: 44, depth: 1, createdAt: '2026-10-17T07:51:00.000Z' });
  wire.commentCount = 2;
  assert.throws(() => normalizeHnArchiveMissing({ ...manifest, items: [wire] }, plan.day, plan.selectedIds),
    /retained identity\/time\/depth mismatch/);
});

test('HN rejects conflicting provider observations across otherwise valid parent chains', () => {
  const wire = associatedOlderItem();
  wire.comments.push({ ...wire.comments[0], id: 45 }); wire.commentCount = 2;
  wire.provenance[associationKey].chains.push({ commentId: 45, responses: [
    firebaseResponse(45, 44, wire.comments[1].createdAt),
    firebaseResponse(44, item.objectId, '2026-10-17T07:51:00.000Z'),
  ] });
  assert.throws(() => normalizeHnArchiveMissing({ ...manifest, items: [wire] }, plan.day, plan.selectedIds),
    /conflicting provider observations/);
});

test('HN chronological archives remain unchanged and older comments cannot use an unrelated proof', () => {
  assert.deepEqual(policy.qualifyHnArchiveItem(item, plan.day, 0), item);
  const wire = associatedOlderItem();
  wire.comments.push({ ...wire.comments[0], id: 45 }); wire.commentCount = 2;
  assert.throws(() => normalizeHnArchiveMissing({ ...manifest, items: [wire] }, plan.day, plan.selectedIds),
    /predates story without provider association/);
});

test('HN planner binds exact association response bytes into the packet digest', async () => {
  const { planHnArchiveMissingPackets } = await import('../plan-hn-archive-missing-packets.ts');
  const env = { MISSING_IMPORT_SCOPE_JSON: JSON.stringify(scope), MISSING_IMPORT_BINDING_CONFIG: '{}' };
  const wire = associatedOlderItem();
  const [first] = planHnArchiveMissingPackets({ ...manifest, items: [wire] }, env);
  const response = wire.provenance[associationKey].chains[0].responses[0];
  response.body += '\n'; response.sha256 = sha(response.body);
  const [second] = planHnArchiveMissingPackets({ ...manifest, items: [wire] }, env);
  assert.notEqual(first.plan.packetSha256, second.plan.packetSha256);
  assert.notEqual(first.plan.planSha256, second.plan.planSha256);
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

test('HN planner pins packetSha256 to exact packet.json file bytes', async () => {
  const { writeHnArchiveMissingPackets } = await import('../plan-hn-archive-missing-packets.ts');
  process.env.MISSING_IMPORT_SCOPE_JSON = JSON.stringify(scope);
  process.env.MISSING_IMPORT_BINDING_CONFIG = '{}';
  const root = await mkdtemp(join(tmpdir(), 'hn-packets-'));
  const manifestPath = join(root, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest));
  const [directory] = await writeHnArchiveMissingPackets(manifestPath, join(root, 'packets'));
  const packetBytes = await readFile(join(directory, 'packet.json'));
  const planned = JSON.parse(await readFile(join(directory, 'plan.json'), 'utf8'));
  assert.equal(sha(packetBytes), planned.packetSha256);
  assert.equal(planned.semanticKey, plan.semanticKey);
});
