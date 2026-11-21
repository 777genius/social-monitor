import assert from 'node:assert/strict';
import test from 'node:test';
import { observedHnArchiveClient } from './hn-archive-observed-client.js';

test('records incomplete searches without claiming complete provider coverage', async () => {
  let requested: any;
  const base: any = { searchStories: async (_query: string, _limit: number, options: any) => {
    requested = options; options.onIncomplete(); return [];
  } };
  const sample = observedHnArchiveClient(base);
  await sample.client.searchStories('synthetic', 10, { requireComplete: true });
  assert.equal(requested.requireComplete, false);
  assert.equal(sample.incompleteSearches(), 1);
});
