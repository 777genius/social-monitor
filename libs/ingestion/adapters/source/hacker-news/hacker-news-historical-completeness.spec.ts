import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { requireCompleteRecoveryFetch, requireCompleteRecoveryScan } from '../../../../../scripts/lib/hn-rss-recovery-acquisition';
import { parseRecoveryArgs } from '../../../../../scripts/lib/hn-rss-recovery-plan';
import { runRecoveryInDisposableJournalForTest } from '../../../../../scripts/run-hn-rss-recovery';
import { InMemorySourceProviderRegistry } from '../in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../registry-source-fetcher.adapter';

import type { HackerNewsClientPort, HackerNewsListStoryCommentsRequest, HackerNewsSearchOptions, HackerNewsStory } from './hacker-news-client.port';
import { HackerNewsSourceProvider } from './hacker-news-source.provider';
import { HttpHackerNewsClient } from './http-hacker-news-client';

const from = new Date('2026-09-23T16:00:00.000Z');
const to = new Date('2026-09-23T17:00:00.000Z');
const second = (iso: string): number => Date.parse(iso) / 1000;
const story = (id: number): HackerNewsStory => ({ id, kind: 'story', title: 'Boundary story',
  time: second('2026-09-23T16:30:00Z'), score: 4 });
const context = (config: Record<string, unknown>) => ({
  tenantId: tenantId('tenant-1'), workspaceId: workspaceId('workspace-1'),
  sourceBindingId: 'binding-1', scanJobId: 'scan-1', correlationId: 'correlation-1',
  config: { targetPublishedWindow: { startInclusive: from.toISOString(), endExclusive: to.toISOString() }, ...config },
});

class WindowClient implements HackerNewsClientPort {
  readonly searchOptions: HackerNewsSearchOptions[] = [];
  readonly commentRequests: HackerNewsListStoryCommentsRequest[] = [];
  stories: readonly HackerNewsStory[] = [story(1)];
  comments: readonly HackerNewsStory[] = [];
  readonly itemsById = new Map<number, HackerNewsStory | null>();
  readonly storyReads: number[] = [];
  failedStoryId: number | undefined;
  failComments = false;

  async searchStories(_query: string, _limit: number, options?: HackerNewsSearchOptions): Promise<readonly HackerNewsStory[]> {
    if (options !== undefined) this.searchOptions.push(options);
    return this.stories;
  }
  async searchComments(): Promise<readonly HackerNewsStory[]> { return this.comments; }
  async getStory(id: number): Promise<HackerNewsStory | null> {
    this.storyReads.push(id);
    if (id === this.failedStoryId) throw new Error('synthetic parent API failure');
    return this.itemsById.has(id) ? this.itemsById.get(id) ?? null : null;
  }
  async listStoryComments(request: HackerNewsListStoryCommentsRequest): Promise<readonly HackerNewsStory[]> {
    this.commentRequests.push(request);
    if (this.failComments) throw new Error('provider failed');
    return this.comments;
  }
  async listStories(): Promise<readonly HackerNewsStory[]> { throw new Error('live listing used'); }
}

const comment = (id: number, parentId?: number): HackerNewsStory => ({
  id, kind: 'comment', ...(parentId === undefined ? {} : { parentId }),
  time: second('2026-09-23T16:30:00Z'), text: 'Synthetic matched comment',
});
const commentPassConfig = { maxItems: 10, scanPasses: [
  { mode: 'search', target: 'comment', query: 'synthetic', maxItems: 10 },
] };
const scanComments = async (client: WindowClient) => {
  const provider = new HackerNewsSourceProvider(client, new FixedClock(to));
  const scope = context(commentPassConfig);
  return provider.scan(provider.planScan({ mode: 'search', query: 'synthetic' }, scope), scope);
};

describe('Hacker News historical completeness', () => {
  it('signals an eleventh in-window story after maxItems and requests complete coverage', async () => {
    const client = new WindowClient();
    client.stories = Array.from({ length: 11 }, (_, index) => story(index + 1));
    const provider = new HackerNewsSourceProvider(client, new FixedClock(to));
    const scope = context({ maxItems: 10 });
    const result = await provider.scan(provider.planScan({ mode: 'search', query: 'boundary' }, scope), scope);
    expect(result.items).toHaveLength(11);
    expect(result.warnings).toContain('Hacker News historical search incomplete: maxItems exceeded');
    expect(client.searchOptions[0]).toMatchObject({ from, to, requireComplete: true });
  });

  it('signals pass and merged maxItems overflow even when the pass returns all hits', async () => {
    const client = new WindowClient();
    client.stories = Array.from({ length: 11 }, (_, index) => story(index + 1));
    const provider = new HackerNewsSourceProvider(client, new FixedClock(to));
    const scope = context({ maxItems: 10, scanPasses: [{ mode: 'search', target: 'story', query: 'boundary', maxItems: 10 }] });
    const result = await provider.scan(provider.planScan({ mode: 'search', query: 'boundary' }, scope), scope);
    expect(result.items).toHaveLength(10);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('historical pass incomplete'),
      'Hacker News historical scan incomplete: maxItems exceeded',
    ]));
  });

  it('projects only in-window expanded comments at inclusive and exclusive boundaries', async () => {
    const client = new WindowClient();
    client.comments = [
      { id: 11, kind: 'comment', storyId: 1, parentId: 1, time: second('2026-09-23T16:00:00Z'), text: 'at start' },
      { id: 12, kind: 'comment', storyId: 1, parentId: 1, time: second('2026-09-23T16:59:59Z'), text: 'before end' },
      { id: 13, kind: 'comment', storyId: 1, parentId: 1, time: second('2026-09-23T17:00:00Z'), text: 'at end' },
      { id: 14, kind: 'comment', storyId: 1, parentId: 1, time: second('2026-09-24T01:00:00Z'), text: 'next day' },
    ];
    const provider = new HackerNewsSourceProvider(client, new FixedClock(to));
    const scope = context({ includeComments: true });
    const result = await provider.scan(provider.planScan({ mode: 'search', query: 'boundary' }, scope), scope);
    expect(result.conversationUnits?.map((unit) => unit.providerUnitId)).toEqual(['hn:11', 'hn:12']);
    expect(client.commentRequests[0]).toMatchObject({ storyId: 1, requireComplete: true });
    expect(result.warnings).toEqual([]);
  });

  it('signals comment expansion limits and provider errors as incomplete', async () => {
    const client = new WindowClient();
    client.stories = [story(1), story(2)];
    const provider = new HackerNewsSourceProvider(client, new FixedClock(to));
    const scope = context({ includeComments: true, maxCommentedStories: 1 });
    const limited = await provider.scan(provider.planScan({ mode: 'search', query: 'boundary' }, scope), scope);
    expect(limited.warnings).toContain('Hacker News comment expansion incomplete: maxCommentedStories exceeded');
    client.failComments = true;
    const failed = await provider.scan(provider.planScan({ mode: 'search', query: 'boundary' }, scope), scope);
    expect(failed.warnings).toEqual(expect.arrayContaining([expect.stringContaining('comment enrichment degraded')]));
  });

  it('resolves a null story_id through a deleted parent and dedupes repeated hits and lookups', async () => {
    const client = new WindowClient();
    client.comments = [comment(10, 20), comment(10, 20), comment(11, 20)];
    client.itemsById.set(20, { id: 20, kind: 'comment', parentId: 1, deleted: true });
    client.itemsById.set(1, { ...story(1), time: second('2026-09-22T16:00:00Z') });

    const result = await scanComments(client);

    expect(result.items.map((item) => item.externalId)).toEqual(['hn:1']);
    expect(result.conversationUnits?.map((unit) => unit.providerUnitId)).toEqual(['hn:10', 'hn:11']);
    expect(result.conversationUnits?.[0]).toMatchObject({ rootExternalId: 'hn:1', parentProviderUnitId: 'hn:20' });
    expect(client.storyReads).toEqual([20, 1]);
    expect(result.warnings).toEqual([]);
  });

  it('fetches an old supporting root with its original date and only in-window comments', async () => {
    const client = new WindowClient();
    client.comments = [comment(10, 20), { ...comment(11, 20), time: second('2026-09-22T17:00:00Z') }];
    client.itemsById.set(20, { id: 20, kind: 'comment', parentId: 1, deleted: true });
    client.itemsById.set(1, { ...story(1), time: second('2026-09-22T16:00:00Z') });
    const provider = requireCompleteRecoveryScan(new HackerNewsSourceProvider(client, new FixedClock(to)));
    const fetcher = requireCompleteRecoveryFetch(new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([provider], []),
      { async readConfig() { return context(commentPassConfig).config; } },
    ));

    const result = await fetcher.fetch({
      tenantId: tenantId('tenant-1'), workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1', scanJobId: 'scan-1', correlationId: 'correlation-1',
      providerKey: 'hacker-news', sourceQuery: { mode: 'search', query: 'synthetic' },
    });

    expect(result.items.map((item) => [item.externalId, item.publishedAt.toISOString()]))
      .toEqual([['hn:1', '2026-09-22T16:00:00.000Z']]);
    expect(result.conversationUnits?.map((unit) => [unit.providerUnitId, unit.publishedAt.toISOString()]))
      .toEqual([['hn:10', '2026-09-23T16:30:00.000Z']]);
    expect(result.warnings).toEqual([]);
    expect(client.storyReads).toEqual([20, 1]);
  });

  it('does not resolve a null story_id outside the requested interval', async () => {
    const client = new WindowClient();
    client.comments = [{ ...comment(10, 20), time: second('2026-09-23T17:00:00Z') }];

    const result = await scanComments(client);

    expect(result.items).toEqual([]);
    expect(result.conversationUnits).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(client.storyReads).toEqual([]);
  });

  it('marks a resolved in-window comment without text as incomplete', async () => {
    const client = new WindowClient();
    client.comments = [{ ...comment(10, 20), storyTitle: 'Synthetic story', text: undefined }];
    client.itemsById.set(20, { id: 20, kind: 'comment', parentId: 1, deleted: true });
    client.itemsById.set(1, { ...story(1), title: 'Synthetic story' });

    const result = await scanComments(client);

    expect(client.storyReads).toEqual([20, 1]);
    expect(result.items).toEqual([]);
    expect(result.conversationUnits).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining('comment was not projectable (comment:10)')]);
  });

  it('rejects an Algolia markup-only comment before retaining its supporting root', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = jest.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/search_by_date')) {
          return new Response(JSON.stringify({
            hits: [{ objectID: '10', story_id: 1, parent_id: 1,
              story_title: 'Synthetic story', comment_text: '<p> </p>',
              created_at_i: second('2026-09-23T16:30:00Z') }],
            nbHits: 1, nbPages: 1, page: 0, exhaustiveNbHits: true,
          }), { status: 200 });
        }
        if (url.endsWith('/item/1.json')) return new Response(JSON.stringify({
          id: 1, type: 'story', title: 'Synthetic story', time: second('2026-09-22T16:00:00Z'),
        }), { status: 200 });
        throw new Error(`Unexpected synthetic URL: ${url}`);
      }) as unknown as typeof fetch;

      const provider = new HackerNewsSourceProvider(new HttpHackerNewsClient(), new FixedClock(to));
      const scope = context(commentPassConfig);
      const result = await provider.scan(provider.planScan({ mode: 'search', query: 'synthetic' }, scope), scope);

      expect(result.items).toEqual([]);
      expect(result.conversationUnits).toEqual([]);
      expect(result.warnings).toEqual([expect.stringContaining('comment was not projectable (comment:10)')]);
      await expect(requireCompleteRecoveryScan(provider).scan(
        provider.planScan({ mode: 'search', query: 'synthetic' }, scope), scope,
      )).rejects.toThrow('partial acquisition');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('marks a markup-only expanded comment as incomplete in a historical window', async () => {
    const client = new WindowClient();
    client.comments = [{ ...comment(10, 1), text: '<p> </p>' }];
    const provider = new HackerNewsSourceProvider(client, new FixedClock(to));
    const scope = context({ includeComments: true });

    const result = await provider.scan(provider.planScan({ mode: 'search', query: 'boundary' }, scope), scope);

    expect(result.items.map((item) => item.externalId)).toEqual(['hn:1']);
    expect(result.conversationUnits).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining('comment was not projectable (comment:10)')]);
  });

  it('marks a nonprojectable expanded comment as incomplete for a historical window', async () => {
    const client = new WindowClient();
    client.comments = [{ ...comment(10, 1), text: undefined }];
    const provider = new HackerNewsSourceProvider(client, new FixedClock(to));
    const scope = context({ includeComments: true });

    const result = await provider.scan(provider.planScan({ mode: 'search', query: 'boundary' }, scope), scope);

    expect(result.items.map((item) => item.externalId)).toEqual(['hn:1']);
    expect(result.conversationUnits).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining('comment was not projectable (comment:10)')]);
  });

  it('keeps historical maxItems incomplete when null-root comments exceed the pass limit', async () => {
    const client = new WindowClient();
    client.comments = Array.from({ length: 11 }, (_, index) => comment(100 + index, index + 1));
    for (let id = 1; id <= 11; id += 1) client.itemsById.set(id, story(id));

    const result = await scanComments(client);

    expect(result.items).toHaveLength(10);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('historical pass incomplete: maxItems exceeded'),
      'Hacker News historical scan incomplete: maxItems exceeded',
    ]));
  });

  it.each([
    ['missing parent id', comment(10), [] as readonly [number, HackerNewsStory | null][]],
    ['orphan parent', comment(10, 20), [[20, null]] as readonly [number, HackerNewsStory | null][]],
    ['missing root after a parent', comment(10, 20), [[20, { id: 20, kind: 'comment', parentId: 1 }], [1, null]] as readonly [number, HackerNewsStory | null][]],
    ['deleted parent without ancestry', comment(10, 20), [[20, { id: 20, kind: 'comment', deleted: true }]] as readonly [number, HackerNewsStory | null][]],
    ['parent cycle', comment(10, 20), [[20, { id: 20, kind: 'comment', parentId: 21 }], [21, { id: 21, kind: 'comment', parentId: 20 }]] as readonly [number, HackerNewsStory | null][]],
    ['unprojectable root', comment(10, 1), [[1, { id: 1, kind: 'story', deleted: true }]] as readonly [number, HackerNewsStory | null][]],
  ])('marks %s as incomplete instead of silently dropping the comment', async (_name, hit, parents) => {
    const client = new WindowClient();
    client.comments = [hit];
    for (const [id, parent] of parents) client.itemsById.set(id, parent);

    const result = await scanComments(client);

    expect(result.conversationUnits).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining('incomplete')]);
  });

  it('bounds parent traversal and reports a parent API failure', async () => {
    const client = new WindowClient();
    client.comments = [comment(10, 20)];
    for (let id = 20; id < 54; id += 1) {
      client.itemsById.set(id, { id, kind: 'comment', parentId: id + 1 });
    }
    const bounded = await scanComments(client);
    expect(client.storyReads).toHaveLength(32);
    expect(bounded.warnings).toEqual([expect.stringContaining('parent depth exceeded')]);

    const failed = new WindowClient();
    failed.comments = [comment(10, 20)];
    failed.failedStoryId = 20;
    const result = await scanComments(failed);
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining('parent lookup failed')]);

    const failedRoot = new WindowClient();
    failedRoot.comments = [comment(10, 20)];
    failedRoot.itemsById.set(20, { id: 20, kind: 'comment', parentId: 1 });
    failedRoot.failedStoryId = 1;
    const rootResult = await scanComments(failedRoot);
    expect(rootResult.warnings).toEqual([expect.stringContaining('parent lookup failed')]);
  });

  it('refuses a real completion receipt for an unresolved null story_id', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'hn-null-root-'));
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = jest.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/search_by_date')) {
          return new Response(JSON.stringify({
            hits: [{ objectID: '10', story_id: null, parent_id: 20,
              comment_text: 'Synthetic matched comment', created_at_i: second('2026-09-23T16:30:00Z') }],
            nbHits: 1, nbPages: 1, page: 0, exhaustiveNbHits: true,
          }), { status: 200 });
        }
        if (url.endsWith('/item/20.json')) return new Response('null', { status: 200 });
        throw new Error(`Unexpected synthetic URL: ${url}`);
      }) as unknown as typeof fetch;
      const provider = requireCompleteRecoveryScan(new HackerNewsSourceProvider(new HttpHackerNewsClient(), new FixedClock(to)));
      const argv = [
        '--tenant-id', '00000000-0000-7000-8000-000000000101',
        '--workspace-id', '00000000-0000-7000-8000-000000000102',
        '--source-binding-id', '00000000-0000-7000-8000-000000000103',
        '--provider', 'hacker-news', '--from', from.toISOString(), '--to', to.toISOString(),
        '--journal-dir', directory,
      ];
      const binding = {
        interestId: '00000000-0000-7000-8000-000000000104',
        scanPolicyId: '00000000-0000-7000-8000-000000000105',
        interestQuery: 'synthetic',
        config: { mode: 'search', query: 'synthetic', ...commentPassConfig },
      };
      const dependencies = {
        readBinding: async () => binding,
        acquire: async () => {
          const scope = context({ ...binding.config, targetPublishedWindow: {
            startInclusive: from.toISOString(), endExclusive: to.toISOString(),
          } });
          const result = await provider.scan(provider.planScan({ mode: 'search', query: 'synthetic' }, scope), scope);
          return { fetched: result.items.length, inserted: 0, projected: 0, skippedDuplicates: 0, warningCount: result.warnings.length };
        },
      };
      const plan = await runRecoveryInDisposableJournalForTest(parseRecoveryArgs(argv, to), dependencies);
      await expect(runRecoveryInDisposableJournalForTest(
        parseRecoveryArgs([...argv, '--apply', '--plan-sha256', String(plan.planSha256)], to), dependencies,
      )).rejects.toThrow('partial acquisition');
      expect(readdirSync(directory).some((name) => name.endsWith('.completed.json'))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses a completion receipt for an HTTP comment hit missing text after root resolution', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'hn-missing-comment-text-'));
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = jest.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/search_by_date')) {
          return new Response(JSON.stringify({
            hits: [{ objectID: '10', story_id: null, parent_id: 20,
              story_title: 'Synthetic story', created_at_i: second('2026-09-23T16:30:00Z') }],
            nbHits: 1, nbPages: 1, page: 0, exhaustiveNbHits: true,
          }), { status: 200 });
        }
        if (url.endsWith('/item/20.json')) return new Response(JSON.stringify({
          id: 20, type: 'comment', parent: 1, deleted: true,
        }), { status: 200 });
        if (url.endsWith('/item/1.json')) return new Response(JSON.stringify({
          id: 1, type: 'story', title: 'Synthetic story', time: second('2026-09-23T16:00:00Z'),
        }), { status: 200 });
        throw new Error(`Unexpected synthetic URL: ${url}`);
      }) as unknown as typeof fetch;
      const provider = requireCompleteRecoveryScan(new HackerNewsSourceProvider(new HttpHackerNewsClient(), new FixedClock(to)));
      const argv = [
        '--tenant-id', '00000000-0000-7000-8000-000000000101',
        '--workspace-id', '00000000-0000-7000-8000-000000000102',
        '--source-binding-id', '00000000-0000-7000-8000-000000000103',
        '--provider', 'hacker-news', '--from', from.toISOString(), '--to', to.toISOString(),
        '--journal-dir', directory,
      ];
      const binding = {
        interestId: '00000000-0000-7000-8000-000000000104',
        scanPolicyId: '00000000-0000-7000-8000-000000000105',
        interestQuery: 'synthetic',
        config: { mode: 'search', query: 'synthetic', ...commentPassConfig },
      };
      const dependencies = {
        readBinding: async () => binding,
        acquire: async () => {
          const scope = context(binding.config);
          const result = await provider.scan(provider.planScan({ mode: 'search', query: 'synthetic' }, scope), scope);
          return { fetched: result.items.length, inserted: 0, projected: 0, skippedDuplicates: 0, warningCount: result.warnings.length };
        },
      };
      const plan = await runRecoveryInDisposableJournalForTest(parseRecoveryArgs(argv, to), dependencies);
      await expect(runRecoveryInDisposableJournalForTest(
        parseRecoveryArgs([...argv, '--apply', '--plan-sha256', String(plan.planSha256)], to), dependencies,
      )).rejects.toThrow('partial acquisition');
      expect(readdirSync(directory).some((name) => name.endsWith('.completed.json'))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
