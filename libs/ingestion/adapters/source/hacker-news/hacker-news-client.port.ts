export type HackerNewsStory = {
  readonly id: number;
  readonly title?: string;
  readonly url?: string;
  readonly by?: string;
  readonly time?: number;
  readonly text?: string;
  readonly deleted?: boolean;
  readonly dead?: boolean;
};

export type HackerNewsListing = 'top' | 'new' | 'best' | 'ask' | 'show' | 'job';

export interface HackerNewsClientPort {
  searchStories(query: string, limit: number): Promise<readonly HackerNewsStory[]>;
  listStories(listing: HackerNewsListing, limit: number): Promise<readonly HackerNewsStory[]>;
}
