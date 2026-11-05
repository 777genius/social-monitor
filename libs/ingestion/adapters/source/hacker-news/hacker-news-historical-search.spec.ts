import { searchCompleteHackerNewsWindow } from './hacker-news-historical-search';

describe('Hacker News historical scan deadline', () => {
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
