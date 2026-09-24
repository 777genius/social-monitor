export type RssTextType = 'text' | 'html' | 'xhtml' | 'unsupported';

type RssFeedItemFields = {
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

type XhtmlReadability = { readonly title: boolean; readonly content: boolean };
type NonXhtmlTextType = Exclude<RssTextType, 'xhtml'>;

/** A client must supply an XML-semantic decision for every XHTML construct it returns. */
export type RssFeedItem = RssFeedItemFields & (
  | { readonly titleType: 'xhtml'; readonly contentType?: RssTextType; readonly xhtmlReadability: XhtmlReadability }
  | { readonly titleType?: RssTextType; readonly contentType: 'xhtml'; readonly xhtmlReadability: XhtmlReadability }
  | { readonly titleType?: NonXhtmlTextType; readonly contentType?: NonXhtmlTextType; readonly xhtmlReadability?: never }
);

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
