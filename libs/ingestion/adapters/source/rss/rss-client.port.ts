export type RssFeedItem = {
  readonly guid?: string;
  readonly link?: string;
  readonly title?: string;
  readonly content?: string;
  readonly author?: string;
  readonly publishedAt?: Date;
};

export interface RssClientPort {
  readFeed(feedUrl: string, limit: number): Promise<readonly RssFeedItem[]>;
}
