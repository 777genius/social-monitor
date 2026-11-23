import assert from 'node:assert/strict';
import test from 'node:test';
import { observedHnArchiveClient } from './hn-archive-observed-client.js';
import type { HackerNewsSearchOptions } from '../../libs/ingestion/adapters/source/hacker-news/hacker-news-client.port.js';

test('records incomplete searches without claiming complete provider coverage', async () => {
  let requested: HackerNewsSearchOptions | undefined;
  const base = { searchStories: async (_query: string, _limit: number, options?: HackerNewsSearchOptions) => {
    requested = options; options?.onIncomplete?.(); return [];
  } } as unknown as Parameters<typeof observedHnArchiveClient>[0];
  const sample = observedHnArchiveClient(base);
  await sample.client.searchStories('synthetic', 10, { requireComplete: true });
  assert.equal(requested?.requireComplete, false);
  assert.equal(sample.incompleteSearches(), 1);
});
