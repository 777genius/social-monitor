import { guardedContentGet } from '../../http/guarded-content-http';
import { validateFeedUrl } from './feed-url-policy';
import { parseRssFeedDocument } from './rss-feed-parser';
import type { RssClientPort, RssReadFeedOptions, RssReadFeedResult } from './rss-client.port';

export class HttpRssClient implements RssClientPort {
  constructor(
    private readonly timeoutMs = 10_000,
    private readonly get: typeof guardedContentGet = guardedContentGet,
  ) {}

  async readFeed(feedUrl: string, limit: number, options: RssReadFeedOptions = {}): Promise<RssReadFeedResult> {
    const validated = validateFeedUrl(feedUrl);
    if (!validated.ok) {
      throw new Error(validated.reason);
    }

    const response = await this.get({
      url: validated.url.toString(), timeoutMs: this.timeoutMs,
      maxBytes: 5 * 1024 * 1024, headers: requestHeaders(options),
    });

    const etag = response.headers.get('etag') ?? options.etag;
    const lastModified = response.headers.get('last-modified') ?? options.lastModified;

    if (response.status === 304) {
      return {
        items: [],
        etag,
        lastModified,
        notModified: true,
      };
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`RSS provider returned HTTP ${response.status}`);
    }

    const { items: entries, rejectedEntries } = parseRssFeedDocument(response.body);
    const window = options.targetPublishedWindow;
    const matching = window === undefined ? entries : entries.filter((item) =>
      item.publishedAt === undefined ||
      (item.publishedAt >= window.startInclusive && item.publishedAt < window.endExclusive),
    );
    const boundedLimit = normalizeLimit(limit);

    return {
      items: matching.slice(0, boundedLimit),
      ...(rejectedEntries > 0 ? { rejectedEntries } : {}),
      ...(window !== undefined && matching.length > boundedLimit ? { truncated: true } : {}),
      etag,
      lastModified,
    };
  }
}

const requestHeaders = (options: RssReadFeedOptions): Record<string, string> => {
  const headers: Record<string, string> = {
    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
    'user-agent': 'social-monitor-mvp/0.1',
  };

  if (options.etag !== undefined) {
    headers['if-none-match'] = options.etag;
  }

  if (options.lastModified !== undefined) {
    headers['if-modified-since'] = options.lastModified;
  }

  return headers;
};

const normalizeLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    return 1;
  }

  return Math.min(limit, 100);
};

