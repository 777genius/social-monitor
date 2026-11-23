import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { generateHnArchiveManifest, readHnArchiveBody } from './hn-archive-manifest-generation.js';
import { parseHnMissingReconciliation } from './hn-archive-reconciliation.js';

const createdAt = '2026-11-18T12:00:00.000Z';
const candidate = { id: 42, day: '2026-11-18', createdAt, pass: 'fixture-pass' };
const second = (time: string) => Date.parse(time) / 1000;
const input = () => ({ days: { '2026-11-18': { missingCount: 1, missing: [
  { id: '42', created_at_i: second(createdAt), pass: 'fixture-pass' },
] } }, totals: { missing: 1 } });
const story = () => ({ id: 42, type: 'story', created_at: createdAt, title: 'Synthetic story',
  author: 'fixture-author', url: 'https://example.invalid/story', text: null, points: 10, children: [] as unknown[] });
const comment = (id: number, createdAt: string, children: unknown[] = []) => ({
  id, type: 'comment', author: 'fixture-author', text: 'Synthetic comment', created_at: createdAt, children,
});
const generate = (read: (url: string) => Promise<string>, candidates = [candidate]) =>
  generateHnArchiveManifest({ candidates, from: '2026-11-18', to: '2026-11-18',
    generatedAt: new Date('2026-11-21T12:00:00Z'), jobId: 'synthetic', reconciliationSha256: 'a'.repeat(64), read });

test('reconciliation rejects duplicate, out-of-day and count drift before provider calls', () => {
  assert.deepEqual(parseHnMissingReconciliation(input()).candidates, [candidate]);
  const duplicate = input();
  duplicate.days['2026-11-18'].missing.push({ ...duplicate.days['2026-11-18'].missing[0]! });
  duplicate.days['2026-11-18'].missingCount = 2;
  duplicate.totals.missing = 2;
  assert.throws(() => parseHnMissingReconciliation(duplicate));
  const wrongDay = input();
  wrongDay.days['2026-11-18'].missing[0]!.created_at_i += 86_400;
  assert.throws(() => parseHnMissingReconciliation(wrongDay));
  const wrongCount = input();
  wrongCount.totals.missing = 2;
  assert.throws(() => parseHnMissingReconciliation(wrongCount));
  const missingDay = { days: { ...input().days, '2026-11-20': { missingCount: 0, missing: [] } }, totals: { missing: 1 } };
  assert.throws(() => parseHnMissingReconciliation(missingDay), /missing days/);
});

test('refuses a still-open archive day before requesting provider data', async () => {
  let calls = 0;
  await assert.rejects(generateHnArchiveManifest({ candidates: [candidate], from: candidate.day, to: candidate.day,
    generatedAt: new Date('2026-11-18T23:59:59Z'), jobId: 'synthetic', reconciliationSha256: 'a'.repeat(64),
    read: async () => { calls += 1; return JSON.stringify(story()); } }));
  assert.equal(calls, 0);
});

test('preserves original story time and attests the parent chain for a predating comment', async () => {
  const after = '2026-11-18T12:01:00.000Z';
  const before = '2026-11-18T11:59:00.000Z';
  const root = story();
  root.children = [comment(100, after, [comment(101, before)])];
  const requests: string[] = [];
  const result = await generate(async url => {
    requests.push(url);
    if (url.endsWith('/items/42')) return JSON.stringify(root);
    if (url.endsWith('/101.json')) return JSON.stringify({ id: 101, type: 'comment', parent: 100, time: second(before) });
    if (url.endsWith('/100.json')) return JSON.stringify({ id: 100, type: 'comment', parent: 42, time: second(after) });
    throw new Error('Unexpected provider request');
  });
  assert.equal(result.count, 1);
  assert.equal(result.items[0]!.createdAt, createdAt);
  assert.equal(result.items[0]!.commentCount, 2);
  assert.equal(result.items[0]!.comments[1]!.depth, 2);
  assert.equal(result.items[0]!.provenance.reconciliationSha256, 'a'.repeat(64));
  assert.equal(result.items[0]!.provenance.hnFirebaseCommentAssociationsV1?.chains[0]?.responses.length, 2);
  assert.equal(result.itemsSha256, createHash('sha256').update(JSON.stringify(result.items)).digest('hex'));
  assert.equal(requests.length, 3);
});

test('marks the comment cap rather than claiming an untruncated tree', async () => {
  const root = story();
  root.children = Array.from({ length: 201 }, (_, index) => comment(index + 100, '2026-11-18T12:01:00.000Z'));
  const result = await generate(async () => JSON.stringify(root));
  assert.equal(result.items[0]!.commentCount, 200);
  assert.equal(result.items[0]!.provenance.omittedComments, 1);
});

test('rejects mismatched provider identity, timestamp, or incomplete ancestry', async () => {
  const mismatch = story(); mismatch.id = 43;
  await assert.rejects(generate(async () => JSON.stringify(mismatch)));
  const wrongTime = story(); wrongTime.created_at = '2026-11-18T12:00:01.000Z';
  await assert.rejects(generate(async () => JSON.stringify(wrongTime)));
  const invalidDate = story(); invalidDate.children = [comment(101, '2026-02-30T12:00:00Z')];
  await assert.rejects(generate(async () => JSON.stringify(invalidDate)));
  const lostPrecision = story(); lostPrecision.children = [comment(101, '2026-11-18T12:01:00.000001Z')];
  await assert.rejects(generate(async () => JSON.stringify(lostPrecision)));
  const root = story(); root.children = [comment(101, '2026-11-18T11:59:00.000Z')];
  await assert.rejects(generate(async url => url.endsWith('/items/42') ? JSON.stringify(root) :
    JSON.stringify({ id: 101, type: 'comment', parent: 999, time: second('2026-11-18T11:59:00.000Z') })));
});

test('stops scheduling further provider requests after a failure and waits for in-flight requests', async () => {
  let started = 0; let settled = 0;
  const candidates = Array.from({ length: 8 }, (_, index) => ({ ...candidate, id: index + 1 }));
  await assert.rejects(generate(async () => {
    started += 1;
    const position = started;
    if (position === 1) throw new Error('Synthetic failure');
    await new Promise(resolve => setTimeout(resolve, 15));
    settled += 1;
    throw new Error('Synthetic in-flight failure');
  }, candidates));
  assert.equal(started, 4);
  assert.equal(settled, 3);
});

test('refuses non-provider URLs before attempting a request', async () => {
  await assert.rejects(readHnArchiveBody('https://example.invalid/api/v1/items/42'));
  await assert.rejects(readHnArchiveBody('https://hn.algolia.com/api/v1/items/42?redirect=1'));
});
