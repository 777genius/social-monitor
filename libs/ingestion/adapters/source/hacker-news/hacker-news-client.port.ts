export type HackerNewsStory = {
  readonly kind?: 'story' | 'comment';
  readonly id: number;
  readonly title?: string;
  readonly storyTitle?: string;
  readonly storyId?: number;
  readonly parentId?: number;
  readonly url?: string;
  readonly by?: string;
  readonly time?: number;
  readonly text?: string;
  readonly score?: number;
  readonly comments?: number;
  readonly deleted?: boolean;
  readonly dead?: boolean;
};

export type HackerNewsListing = 'top' | 'new' | 'best' | 'ask' | 'show' | 'job';

export interface HackerNewsClientPort {
  searchStories(query: string, limit: number): Promise<readonly HackerNewsStory[]>;
  searchComments(query: string, limit: number): Promise<readonly HackerNewsStory[]>;
  listStories(listing: HackerNewsListing, limit: number): Promise<readonly HackerNewsStory[]>;
}
