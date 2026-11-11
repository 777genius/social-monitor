import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { RegistrySourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter';
import { InMemorySourceProviderRegistry } from '@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry';
import { RedditSourceProvider } from '@social-monitor/ingestion/adapters/source/reddit/reddit-source.provider';
import { CleanRealDaySourceConfigReader, cleanDaySourceQuery } from './clean-real-day-source-config-reader';

describe('clean-day config reader observation', () => {
  it('applies the fresh boundary to Reddit after a retry crosses midnight', async () => {
    let time = new Date('2026-07-07T23:59:00Z');
    const target = { sourceBindingId: 'binding', providerKey: 'reddit', config: {
      targetPublishedWindow: { startInclusive: '2026-07-07T00:00:00Z', endExclusive: '2026-07-08T00:00:00Z',
        observedAt: '2026-07-07T12:00:00Z' },
      scanPasses: [{ mode: 'listing', subreddit: 'OpenAI', listing: 'new' },
        { mode: 'listing', subreddit: 'ClaudeAI', listing: 'new' }],
    } };
    const reader = new CleanRealDaySourceConfigReader([target], { now: () => time });
    const provider = new RedditSourceProvider({
      async listSubredditPosts(request) {
        if (request.subreddit === 'ClaudeAI') throw new Error('lane failed');
        return { posts: [] };
      },
      async searchPosts() { return { posts: [] }; },
      async listPostComments() { return { comments: [] }; },
    }, { async getAccessToken() { return 'test-token'; } });
    const scan = async () => {
      const config = await reader.readConfig({ sourceBindingId: 'binding' });
      if (config === null) throw new Error('missing config');
      const context = { tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test'),
        sourceBindingId: 'binding', scanJobId: 'scan', correlationId: 'correlation', config };
      return provider.scan(provider.planScan({ mode: 'search', query: 'AI' }, context), context);
    };
    expect((await scan()).collection).toEqual({ complete: false, backfillPending: true });
    time = new Date('2026-07-08T00:00:00Z');
    await expect(scan()).rejects.toThrow('lane failed');
  });

  it('keeps fresh Reddit observation through registry merging of CLI-shaped query parameters', async () => {
    let time = new Date('2026-07-07T23:59:00Z');
    const target = { sourceBindingId: 'binding', providerKey: 'reddit', config: {
      targetPublishedWindow: { startInclusive: '2026-07-07T00:00:00Z', endExclusive: '2026-07-08T00:00:00Z',
        observedAt: '2026-07-07T12:00:00Z' },
      scanPasses: [{ mode: 'listing', subreddit: 'OpenAI', listing: 'new' },
        { mode: 'listing', subreddit: 'ClaudeAI', listing: 'new' }],
      maxItems: 7,
    } };
    const reader = new CleanRealDaySourceConfigReader([target], { now: () => time });
    const seen: number[] = [];
    const provider = new RedditSourceProvider({
      async listSubredditPosts(request) {
        seen.push(request.limit);
        if (request.subreddit === 'ClaudeAI') throw new Error('lane failed');
        return { posts: [] };
      },
      async searchPosts() { return { posts: [] }; },
      async listPostComments() { return { comments: [] }; },
    }, { async getAccessToken() { return 'test-token'; } });
    const fetcher = new RegistrySourceFetcherAdapter(new InMemorySourceProviderRegistry([provider], []), reader);
    const originalQuery = { mode: 'search' as const, query: 'AI', parameters: target.config };
    const query = cleanDaySourceQuery('reddit', originalQuery);
    expect(query.parameters).toEqual({ scanPasses: target.config.scanPasses, maxItems: 7 });
    expect(originalQuery.parameters.targetPublishedWindow).toBe(target.config.targetPublishedWindow);
    expect(cleanDaySourceQuery('hacker-news', originalQuery)).toBe(originalQuery);
    const scan = () => fetcher.fetch({ tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test'),
      sourceBindingId: 'binding', scanJobId: 'scan', correlationId: 'correlation', providerKey: 'reddit',
      sourceQuery: query });
    expect((await scan()).telemetry?.collectionComplete).toBe(false);
    expect(seen[0]).toBe(4);
    time = new Date('2026-07-08T00:00:00Z');
    await expect(scan()).rejects.toThrow('lane failed');
  });

  it('refreshes Reddit observation for each attempt without changing other callers', async () => {
    let time = new Date('2026-07-07T23:59:00Z');
    const target = { sourceBindingId: 'binding', providerKey: 'reddit', config: { targetPublishedWindow: {
      startInclusive: '2026-07-07T00:00:00Z', endExclusive: '2026-07-08T00:00:00Z',
      observedAt: '2026-07-07T12:00:00Z',
    } } };
    const reader = new CleanRealDaySourceConfigReader([target], { now: () => time });
    const first = await reader.readConfig({ sourceBindingId: 'binding' });
    expect(first?.targetPublishedWindow).toMatchObject({ observedAt: '2026-07-07T23:59:00.000Z' });
    time = new Date('2026-07-08T00:00:00Z');
    const retry = await reader.readConfig({ sourceBindingId: 'binding' });
    expect(retry?.targetPublishedWindow).toMatchObject({ observedAt: '2026-07-08T00:00:00.000Z' });
    const ordinary = new CleanRealDaySourceConfigReader([target]);
    expect((await ordinary.readConfig({ sourceBindingId: 'binding' }))?.targetPublishedWindow)
      .toMatchObject({ observedAt: '2026-07-07T12:00:00Z' });
  });
});
