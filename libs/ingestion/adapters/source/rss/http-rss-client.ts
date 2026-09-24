import { guardedContentGet } from '../../http/guarded-content-http';
import { XMLParser } from 'fast-xml-parser';

import { validateFeedUrl } from './feed-url-policy';
import { atomXhtmlContents } from './atom-xhtml-content';
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

    const response = await guardedContentGet({
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

    const xml = response.body;
    const parsed = parser.parse(xml);

    return {
      items: parseFeedItems(parsed, xml).slice(0, normalizeLimit(limit)),
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

const parseFeedItems = (parsed: unknown, xml: string): readonly RssFeedItem[] => {
  if (!isRecord(parsed)) {
    return [];
  }

  const rssItems = arrayFromPath(parsed, ['rss', 'channel', 'item']);
  if (rssItems.length > 0) {
    return rssItems.flatMap((item) => normalizeRssItem(item));
  }

  const entries = arrayFromPath(parsed, ['feed', 'entry']);
  const hasXhtml = entries.some((entry) => isRecord(entry) &&
    [entry.content, entry.summary].some((value) => isRecord(value) && value['@_type'] === 'xhtml'));
  const xhtml = hasXhtml ? atomXhtmlContents(xml) : [];
  return entries.flatMap((entry, index) => normalizeAtomEntry(entry, xhtml[index]));
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
    ...rssMediaFields(item),
    publishedAt: parseDate(readText(item.pubDate) ?? readText(item['dc:date'])),
  }];
};

const normalizeAtomEntry = (entry: unknown, xhtml?: string): readonly RssFeedItem[] => {
  if (!isRecord(entry)) {
    return [];
  }

  return [{
    guid: readText(entry.id),
    link: readAtomLink(entry.link),
    title: readText(entry.title),
    content: xhtml ?? readText(entry.content) ?? readText(entry.summary),
    author: readAtomAuthor(entry.author),
    ...atomMediaFields(entry),
    publishedAt: parseDate(readText(entry.published) ?? readText(entry.updated)),
  }];
};

const rssMediaFields = (
  item: Readonly<Record<string, unknown>>,
): Partial<RssFeedItem> => ({
  ...mediaFieldsFromMediaElements(item),
  ...enclosureFields(item.enclosure),
});

const atomMediaFields = (
  entry: Readonly<Record<string, unknown>>,
): Partial<RssFeedItem> => ({
  ...mediaFieldsFromMediaElements(entry),
  ...enclosureFields(readAtomEnclosure(entry.link), '@_href'),
});

const mediaFieldsFromMediaElements = (
  value: Readonly<Record<string, unknown>>,
): Partial<RssFeedItem> => {
  const thumbnailUrl = readElementAttribute(value['media:thumbnail'], '@_url');
  const content = firstRecord(value['media:content']);
  const contentUrl = readElementAttribute(content, '@_url');
  const contentType = readElementAttribute(content, '@_type');

  return {
    ...(thumbnailUrl === undefined ? {} : { mediaThumbnailUrl: thumbnailUrl }),
    ...(contentUrl === undefined ? {} : { mediaContentUrl: contentUrl }),
    ...(contentType === undefined ? {} : { mediaContentType: contentType }),
  };
};

const enclosureFields = (
  value: unknown,
  urlAttribute: '@_url' | '@_href' = '@_url',
): Partial<RssFeedItem> => {
  const enclosure = firstRecord(value);
  const enclosureUrl = readElementAttribute(enclosure, urlAttribute);
  const enclosureType = readElementAttribute(enclosure, '@_type');

  return {
    ...(enclosureUrl === undefined ? {} : { enclosureUrl }),
    ...(enclosureType === undefined ? {} : { enclosureType }),
  };
};

const readAtomEnclosure = (value: unknown): unknown => {
  const links = Array.isArray(value) ? value : [value];
  return links.find((link) => isRecord(link) && link['@_rel'] === 'enclosure');
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

const readElementAttribute = (
  value: unknown,
  key: '@_url' | '@_href' | '@_type',
): string | undefined => {
  const record = firstRecord(value);
  return record === undefined ? undefined : readText(record[key]);
};

const firstRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isRecord(candidate) ? candidate : undefined;
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
