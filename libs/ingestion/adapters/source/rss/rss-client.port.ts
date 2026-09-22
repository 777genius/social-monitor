export type RssFeedItem = {
  readonly guid?: string;
  readonly link?: string;
  readonly title?: string;
  readonly content?: string;
  /** Explicit supplier completeness evidence; an XML tag name or length is not evidence. */
  readonly contentComplete?: boolean;
  readonly author?: string;
  readonly mediaThumbnailUrl?: string;
  readonly mediaContentUrl?: string;
  readonly mediaContentType?: string;
  readonly enclosureUrl?: string;
  readonly enclosureType?: string;
  readonly publishedAt?: Date;
};

export type RssReadFeedOptions = {
  readonly etag?: string;
  readonly lastModified?: string;
};

export type RssReadFeedResult = {
  readonly items: readonly RssFeedItem[];
  readonly etag?: string;
  readonly lastModified?: string;
  readonly notModified?: boolean;
};

export interface RssClientPort {
  readFeed(feedUrl: string, limit: number, options?: RssReadFeedOptions): Promise<RssReadFeedResult>;
}
