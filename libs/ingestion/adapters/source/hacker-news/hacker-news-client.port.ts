export type HackerNewsStory = {
  readonly kind?: 'story' | 'comment';
  readonly id: number;
  readonly title?: string;
  readonly storyTitle?: string;
  readonly storyId?: number;
  readonly parentId?: number;
  readonly kids?: readonly number[];
  readonly depth?: number;
  readonly rank?: number;
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

export type HackerNewsSearchOptions = {
  readonly from?: Date;
  readonly to?: Date;
};

export type HackerNewsListStoryCommentsRequest = {
  readonly storyId: number;
  readonly limit: number;
  readonly depth: number;
};

export interface HackerNewsClientPort {
  searchStories(query: string, limit: number, options?: HackerNewsSearchOptions): Promise<readonly HackerNewsStory[]>;
  searchComments(query: string, limit: number, options?: HackerNewsSearchOptions): Promise<readonly HackerNewsStory[]>;
  getStory(id: number): Promise<HackerNewsStory | null>;
  listStoryComments(request: HackerNewsListStoryCommentsRequest): Promise<readonly HackerNewsStory[]>;
  listStories(listing: HackerNewsListing, limit: number): Promise<readonly HackerNewsStory[]>;
}
