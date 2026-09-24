import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { HackerNewsClientPort, HackerNewsListStoryCommentsRequest, HackerNewsSearchOptions, HackerNewsStory } from './hacker-news-client.port';
import { HackerNewsSourceProvider } from './hacker-news-source.provider';

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
  failComments = false;

  async searchStories(_query: string, _limit: number, options?: HackerNewsSearchOptions): Promise<readonly HackerNewsStory[]> {
    if (options !== undefined) this.searchOptions.push(options);
    return this.stories;
  }
  async searchComments(): Promise<readonly HackerNewsStory[]> { return this.comments; }
  async getStory(): Promise<HackerNewsStory | null> { return story(1); }
  async listStoryComments(request: HackerNewsListStoryCommentsRequest): Promise<readonly HackerNewsStory[]> {
    this.commentRequests.push(request);
    if (this.failComments) throw new Error('provider failed');
    return this.comments;
  }
  async listStories(): Promise<readonly HackerNewsStory[]> { throw new Error('live listing used'); }
}

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
});
