export type RssFeedItem = {
  readonly guid?: string;
  readonly link?: string;
  readonly title?: string;
  readonly content?: string;
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
  readonly targetPublishedWindow?: {
    readonly startInclusive: Date;
    readonly endExclusive: Date;
  };
};

export type RssReadFeedResult = {
  readonly items: readonly RssFeedItem[];
  readonly etag?: string;
  readonly lastModified?: string;
  readonly notModified?: boolean;
  /** More matching entries existed than the requested item limit. */
  readonly truncated?: boolean;
};

export interface RssClientPort {
  readFeed(feedUrl: string, limit: number, options?: RssReadFeedOptions): Promise<RssReadFeedResult>;
}
