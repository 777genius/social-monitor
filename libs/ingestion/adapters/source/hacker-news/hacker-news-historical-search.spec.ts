import { searchCompleteHackerNewsWindow } from './hacker-news-historical-search';
import { collectHackerNewsScanPasses } from './hacker-news-multi-pass-collector';
import type { HackerNewsClientPort } from './hacker-news-client.port';

describe('Hacker News historical scan deadline', () => {
  it('passes one deadline through every configured historical search pass', async () => {
    const deadlines: AbortSignal[] = [];
    const client: HackerNewsClientPort = {
      searchStories: async (_query, _limit, options) => {
        if (options?.deadline !== undefined) deadlines.push(options.deadline);
        return [];
      },
      searchComments: async () => [],
      getStory: async () => null,
      listStoryComments: async () => [],
      listStories: async () => [],
    };
    const from = new Date('2026-07-07T00:00:00Z');
    const to = new Date('2026-07-08T00:00:00Z');
    await collectHackerNewsScanPasses(client, { now: () => to }, {
      plan: { query: { mode: 'search', query: 'topic' }, maxItems: 10 },
      passes: [
        { mode: 'search', target: 'story', query: 'first' },
        { mode: 'search', target: 'story', query: 'second' },
      ],
      maxItemAgeHours: undefined,
      searchOptions: { from, to, requireComplete: true },
      recencyFilterHours: undefined,
      fallbackIncludeComments: false,
      fallbackMaxCommentedStories: undefined,
      fallbackMaxCommentsPerPost: undefined,
      fallbackCommentDepth: 0,
      targetWindow: { startInclusive: from, endExclusive: to },
    });
    expect(deadlines).toHaveLength(2);
    expect(deadlines[0]).toBe(deadlines[1]);
  });

  it('rejects an elapsed scan-wide deadline before dispatching a request', async () => {
    const spy = jest.spyOn(AbortSignal, 'timeout')
      .mockReturnValueOnce(AbortSignal.abort());
    const fetchPage = jest.fn();
    try {
      await expect(searchCompleteHackerNewsWindow(
        new URL('https://hn.algolia.com/api/v1/search_by_date'),
        new Date('2026-07-07T00:00:00Z'),
        new Date('2026-07-08T00:00:00Z'),
        fetchPage,
      )).rejects.toThrow('duration budget exhausted');
      expect(fetchPage).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
