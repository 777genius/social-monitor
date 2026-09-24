export type RssTextType = 'text' | 'html' | 'xhtml' | 'unsupported';

export type RssFeedItem = {
  readonly guid?: string;
  readonly link?: string;
  readonly title?: string;
  /** Atom text constructs are literal; absent for RSS fields, which may contain HTML. */
  readonly titleType?: RssTextType;
  readonly content?: string;
  readonly contentType?: RssTextType;
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
  /** Feed entries the XML parser could not normalize into an item. */
  readonly rejectedEntries?: number;
  readonly etag?: string;
  readonly lastModified?: string;
  readonly notModified?: boolean;
  /** More matching entries existed than the requested item limit. */
  readonly truncated?: boolean;
};

export interface RssClientPort {
  readFeed(feedUrl: string, limit: number, options?: RssReadFeedOptions): Promise<RssReadFeedResult>;
}
