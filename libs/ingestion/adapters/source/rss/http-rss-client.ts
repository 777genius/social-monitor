import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

import { validateFeedUrl } from './feed-url-policy';
import type { RssClientPort, RssFeedItem, RssReadFeedOptions, RssReadFeedResult, RssTextType } from './rss-client.port';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
});
const orderedXhtmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  processEntities: false,
});
const orderedXhtmlBuilder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,
});
type AtomConstructName = 'title' | 'content' | 'summary';
type XhtmlConstructs = Partial<Record<AtomConstructName, string>>;

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

    const body = await response.text();
    if (XMLValidator.validate(body) !== true) {
      throw new Error('RSS provider returned malformed XML');
    }
    const parsed: unknown = parser.parse(body);
    if (!hasFeedEnvelope(parsed)) {
      throw new Error('RSS provider returned an invalid RSS or Atom envelope');
    }

    const { items: entries, rejectedEntries } = parseFeedItems(parsed, body);
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

const parseFeedItems = (parsed: unknown, xml: string): { readonly items: readonly RssFeedItem[]; readonly rejectedEntries: number } => {
  if (!isRecord(parsed)) {
    return { items: [], rejectedEntries: 0 };
  }

  const rssItems = arrayFromPath(parsed, ['rss', 'channel', 'item']);
  if (rssItems.length > 0) {
    return normalizeEntries(rssItems, normalizeRssItem);
  }

  const entries = arrayFromPath(parsed, ['feed', 'entry']);
  const xhtml = entries.some((entry) => isRecord(entry) &&
    (['title', 'content', 'summary'] as const).some((name) => isXhtmlConstruct(entry[name])))
    ? readXhtmlConstructs(xml)
    : [];
  return normalizeEntries(entries, (entry, index) => normalizeAtomEntry(entry, xhtml[index]));
};

const normalizeEntries = (
  entries: readonly unknown[],
  normalize: (entry: Readonly<Record<string, unknown>>, index: number) => RssFeedItem,
): { readonly items: readonly RssFeedItem[]; readonly rejectedEntries: number } => ({
  items: entries.flatMap((entry, index) => isRecord(entry) ? [normalize(entry, index)] : []),
  rejectedEntries: entries.filter((entry) => !isRecord(entry)).length,
});

const hasFeedEnvelope = (parsed: unknown): boolean => {
  if (!isRecord(parsed)) return false;
  const roots = Object.keys(parsed).filter((key) => !key.startsWith('?'));
  if (roots.length !== 1) return false;
  if (roots[0] === 'rss') {
    return isRecord(parsed.rss) &&
      (isRecord(parsed.rss.channel) || parsed.rss.channel === '');
  }
  return roots[0] === 'feed' && (isRecord(parsed.feed) || parsed.feed === '');
};

const normalizeRssItem = (item: Readonly<Record<string, unknown>>): RssFeedItem => ({
  guid: readText(item.guid),
  link: readText(item.link),
  title: readText(item.title),
  content: readText(item['content:encoded']) ?? readText(item.description),
  author: readText(item.author) ?? readText(item['dc:creator']),
  ...rssMediaFields(item),
  publishedAt: parseDate(readText(item.pubDate) ?? readText(item['dc:date'])),
});

const normalizeAtomEntry = (entry: Readonly<Record<string, unknown>>, xhtml: XhtmlConstructs = {}): RssFeedItem => {
  const title = readAtomConstruct(entry.title, xhtml.title);
  const content = readAtomConstruct(entry.content, xhtml.content) ?? readAtomConstruct(entry.summary, xhtml.summary);
  return {
    guid: readText(entry.id),
    link: readAtomLink(entry.link),
    title: title?.text,
    titleType: title?.type,
    content: content?.text,
    contentType: content?.type,
    author: readAtomAuthor(entry.author),
    ...atomMediaFields(entry),
    publishedAt: parseDate(readText(entry.published) ?? readText(entry.updated)),
  };
};

const isXhtmlType = (value: unknown): boolean =>
  /^(xhtml|application\/xhtml\+xml)$/iu.test(readText(value) ?? '');

const isXhtmlConstruct = (value: unknown): boolean =>
  isRecord(value) && isXhtmlType(value['@_type']);

const orderedElements = (nodes: unknown, name: string): readonly Readonly<Record<string, unknown>>[] =>
  Array.isArray(nodes) ? nodes.filter((node: unknown): node is Readonly<Record<string, unknown>> =>
    isRecord(node) && Array.isArray(node[name])) : [];

/** Parse only when Atom uses XHTML, keeping its original text nodes and entity spelling. */
const readXhtmlConstructs = (xml: string): readonly XhtmlConstructs[] => {
  const feed = orderedElements(orderedXhtmlParser.parse(xml), 'feed')[0];
  return orderedElements(feed?.feed, 'entry')
    .map((entry) => {
      const constructs: XhtmlConstructs = {};
      for (const name of ['title', 'content', 'summary'] as const) {
        const element = orderedElements(entry.entry, name)
          .find((node) => isRecord(node[':@']) && isXhtmlType(node[':@']['@_type']));
        if (element !== undefined) {
          constructs[name] = orderedXhtmlBuilder.build(element[name]);
        }
      }
      return constructs;
    });
};

const readAtomConstruct = (value: unknown, xhtmlMarkup?: string): { readonly text: string; readonly type: RssTextType } | undefined => {
  const declaredType = isRecord(value) ? readText(value['@_type'])?.toLowerCase() : undefined;
  const type: RssTextType = declaredType === 'html' || declaredType === 'text/html'
    ? 'html'
    : declaredType === 'xhtml' || declaredType === 'application/xhtml+xml'
      ? 'xhtml'
      : declaredType === undefined || declaredType === 'text' || declaredType === 'text/plain'
        ? 'text'
        : 'unsupported';
  if (type === 'xhtml' && xhtmlMarkup === undefined) {
    throw new Error('Atom XHTML construct could not be recovered from XML');
  }
  const text = type === 'xhtml' ? xhtmlMarkup?.trim() || undefined : readText(value);
  return text === undefined ? undefined : { text, type };
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
