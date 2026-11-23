import type { HackerNewsClientPort, HackerNewsSearchOptions } from '../../libs/ingestion/adapters/source/hacker-news/hacker-news-client.port';

/** Explicit best-effort observations; callers must label every result as partial. */
export function observedHnArchiveClient(base: HackerNewsClientPort): {
  readonly client: HackerNewsClientPort; readonly incompleteSearches: () => number;
} {
  let incomplete = 0;
  const options = (value?: HackerNewsSearchOptions): HackerNewsSearchOptions => ({ ...value, requireComplete: false,
    onIncomplete: () => { incomplete += 1; value?.onIncomplete?.(); } });
  return {
    incompleteSearches: () => incomplete,
    client: {
      searchStories: (query, limit, value) => base.searchStories(query, limit, options(value)),
      searchComments: (query, limit, value) => base.searchComments(query, limit, options(value)),
      getStory: id => base.getStory(id),
      listStoryComments: request => base.listStoryComments(request),
      listStories: (listing, limit, onIncomplete) => base.listStories(listing, limit, onIncomplete),
    },
  };
}
