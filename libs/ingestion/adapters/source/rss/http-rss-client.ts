import { XMLParser } from 'fast-xml-parser';

import { validateFeedUrl } from './feed-url-policy';
import type { RssClientPort, RssFeedItem, RssReadFeedOptions, RssReadFeedResult } from './rss-client.port';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
});

export class HttpRssClient implements RssClientPort {
  constructor(private readonly timeoutMs = 10_000) {}

  async readFeed(feedUrl: string, limit: number, options: RssReadFeedOptions = {}): Promise<RssReadFeedResult> {
    const validated = validateFeedUrl(feedUrl);
    if (!validated.ok) {
      throw new Error(validated.reason);
    }

    const response = await fetch(validated.url.toString(), {
      headers: requestHeaders(options),
      redirect: 'follow',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (response.url.trim().length > 0) {
      const finalUrl = validateFeedUrl(response.url);
      if (!finalUrl.ok) {
        throw new Error(`Feed URL redirect rejected: ${finalUrl.reason}`);
      }
    }

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

    if (!response.ok) {
      throw new Error(`RSS provider returned HTTP ${response.status}`);
    }

    const parsed = parser.parse(await response.text());

    return {
      items: parseFeedItems(parsed).slice(0, normalizeLimit(limit)),
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

const parseFeedItems = (parsed: unknown): readonly RssFeedItem[] => {
  if (!isRecord(parsed)) {
    return [];
  }

  const rssItems = arrayFromPath(parsed, ['rss', 'channel', 'item']);
  if (rssItems.length > 0) {
    return rssItems.flatMap((item) => normalizeRssItem(item));
  }

  return arrayFromPath(parsed, ['feed', 'entry']).flatMap((entry) => normalizeAtomEntry(entry));
};

const normalizeRssItem = (item: unknown): readonly RssFeedItem[] => {
  if (!isRecord(item)) {
    return [];
  }

  return [{
    guid: readText(item.guid),
    link: readText(item.link),
    title: readText(item.title),
    content: readText(item['content:encoded']) ?? readText(item.description),
    author: readText(item.author) ?? readText(item['dc:creator']),
    publishedAt: parseDate(readText(item.pubDate) ?? readText(item['dc:date'])),
  }];
};

const normalizeAtomEntry = (entry: unknown): readonly RssFeedItem[] => {
  if (!isRecord(entry)) {
    return [];
  }

  return [{
    guid: readText(entry.id),
    link: readAtomLink(entry.link),
    title: readText(entry.title),
    content: readText(entry.content) ?? readText(entry.summary),
    author: readAtomAuthor(entry.author),
    publishedAt: parseDate(readText(entry.published) ?? readText(entry.updated)),
  }];
};

const arrayFromPath = (root: Readonly<Record<string, unknown>>, path: readonly string[]): readonly unknown[] => {
  let current: unknown = root;
  for (const key of path) {
    if (!isRecord(current)) {
      return [];
    }
    current = current[key];
  }

  if (Array.isArray(current)) {
    return current;
  }

  return current === undefined ? [] : [current];
};

const readAtomLink = (value: unknown): string | undefined => {
  const links = Array.isArray(value) ? value : [value];
  const firstLink = links.find((link) => {
    if (!isRecord(link)) {
      return typeof link === 'string';
    }

    return link['@_rel'] === undefined || link['@_rel'] === 'alternate';
  });

  if (isRecord(firstLink)) {
    return readText(firstLink['@_href']);
  }

  return readText(firstLink);
};

const readAtomAuthor = (value: unknown): string | undefined => {
  if (isRecord(value)) {
    return readText(value.name) ?? readText(value.email);
  }

  return readText(value);
};

const readText = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text.length > 0 ? text : undefined;
  }

  if (isRecord(value)) {
    return readText(value['#text']);
  }

  return undefined;
};

const parseDate = (value: string | undefined): Date | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp);
};

const normalizeLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    return 1;
  }

  return Math.min(limit, 100);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
