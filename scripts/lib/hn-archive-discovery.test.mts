import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverHnArchiveDay } from './hn-archive-discovery.js';

const day = '2026-11-18';
const start = Date.parse(`${day}T00:00:00.000Z`);
const item = (id: number, hour: number) => ({ externalId: `hn:${id}`, publishedAt: new Date(start + hour * 3_600_000) });

test('splits overflow, deduplicates supporting roots and excludes existing identities', async () => {
  const windows: number[] = [];
  const result = await discoverHnArchiveDay({ day, existing: new Set(['hn:2']), scan: async (from, to) => {
    windows.push(from.getTime());
    if (to.getTime() - from.getTime() === 86_400_000) return { items: [], warnings: [
      'Hacker News historical pass incomplete: maxItems exceeded (story_search)',
      'Hacker News historical scan incomplete: maxItems exceeded',
    ], collection: { complete: false, backfillPending: true } };
    return { items: [item(1, 1), item(2, 20), item(3, -1)], warnings: [] };
  } });
  assert.deepEqual(result.missing, [{ id: '1', created_at_i: (start + 3_600_000) / 1000, pass: 'configured-provider' }]);
  assert.equal(result.scans, 3);
  assert.deepEqual(windows, [start, start, start + 43_200_000]);
});

test('refuses partial provider coverage, conflicting timestamps and invalid days', async () => {
  await assert.rejects(discoverHnArchiveDay({ day, existing: new Set(), scan: async () => ({ items: [], warnings: ['network failure'] }) }));
  await assert.rejects(discoverHnArchiveDay({ day, existing: new Set(), scan: async () => ({ items: [], warnings: [],
    collection: { complete: false, backfillPending: true } }) }));
  await assert.rejects(discoverHnArchiveDay({ day, existing: new Set(), scan: async () => ({ items: [item(1, 1), item(1, 2)], warnings: [] }) }));
  await assert.rejects(discoverHnArchiveDay({ day: '2026-02-30', existing: new Set(), scan: async () => ({ items: [], warnings: [] }) }));
});

test('explicit observation runs cover four bounded windows', async () => {
  const windows: number[] = [];
  const result = await discoverHnArchiveDay({ day, existing: new Set(), initialWindowHours: 6,
    scan: async (from, to) => {
      assert.equal(to.getTime() - from.getTime(), 6 * 3_600_000);
      windows.push(from.getTime());
      return { items: [], warnings: [] };
    } });
  assert.equal(result.scans, 4);
  assert.deepEqual(windows, [0, 6, 12, 18].map(hour => start + hour * 3_600_000));
});
