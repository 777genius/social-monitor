import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { hasReadableFeedText, hasReadableXmlText } from './rss-readable-content';
import { assertResolvedXmlEntities, RssEntityEvidenceError } from './rss-xml-entity-evidence';
import type { RssFeedItem, RssTextType } from './rss-client.port';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  // Numeric-looking GUIDs and Atom IDs are identities, never numbers.
  parseTagValue: false,
  htmlEntities: true,
  processEntities: {
    maxEntitySize: 8192, maxEntityCount: 128, maxTotalExpansions: 10_000,
    maxExpandedLength: 1_000_000,
  },
});
const rawXhtmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: false,
  processEntities: false,
  stopNodes: ['*.title', '*.content', '*.summary'],
});

/**
 * Treat provider XML as untrusted data: validation and bounded entity expansion
 * stay together with normalization so transport cannot accidentally skip them.
 */
export const parseRssFeedDocument = (body: string): {
  readonly items: readonly RssFeedItem[];
  readonly rejectedEntries: number;
} => {
    if (body.length > 16_000_000) throw new Error('RSS provider returned an oversized feed');
    const validation = XMLValidator.validate(body);
    if (validation !== true) {
      if (validation.err.code === 'InvalidChar' && validation.err.msg.includes("'&'")) {
        throw new RssEntityEvidenceError();
      }
      throw new Error('RSS provider returned malformed XML');
    }
    assertResolvedXmlEntities(body);
    const parsed: unknown = parser.parse(body);
    if (!hasFeedEnvelope(parsed)) {
      throw new Error('RSS provider returned an invalid RSS or Atom envelope');
    }

    const { items: entries, rejectedEntries } = parseFeedItems(parsed, body);
    return { items: entries, rejectedEntries };
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
  const rawEntries = entries.some((entry) => isRecord(entry) &&
    (['title', 'content', 'summary'] as const).some((name) => isXhtmlConstruct(entry[name])))
    ? arrayFromPath(rawXhtmlParser.parse(xml), ['feed', 'entry'])
    : [];
  return normalizeEntries(entries, (entry, index) => normalizeAtomEntry(entry, rawEntries[index]));
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
  content: readRssBody(item),
  author: readText(item.author) ?? readText(item['dc:creator']),
  ...rssMediaFields(item),
  publishedAt: parseDate(readText(item.pubDate) ?? readText(item['dc:date'])),
});

const readRssBody = (item: Readonly<Record<string, unknown>>): string | undefined => {
  const encoded = readText(item['content:encoded']);
  if (encoded !== undefined && hasReadableFeedText(encoded)) return encoded;
  // Keep the original parsed summary bytes when blank encoded HTML loses priority.
  const description = encoded === undefined
    ? readText(item.description) : readRawRssSummary(item.description);
  return description ?? encoded;
};

const readRawRssSummary = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim().length > 0 ? value : undefined;
  if (isRecord(value)) return readRawRssSummary(value['#text']);
  return readText(value);
};

const normalizeAtomEntry = (entry: Readonly<Record<string, unknown>>, rawEntry: unknown): RssFeedItem => {
  const raw = isRecord(rawEntry) ? rawEntry : {};
  const title = readAtomConstruct(entry.title, raw.title);
  const primaryContent = readAtomConstruct(entry.content, raw.content);
  const summary = readAtomConstruct(entry.summary, raw.summary);
  const primaryReadable = isReadableAtomConstruct(primaryContent, entry.content);
  const summaryReadable = isReadableAtomConstruct(summary, entry.summary);
  const contentName = primaryReadable ? 'content' : 'summary';
  const content = primaryReadable ? primaryContent : summaryReadable ? summary : primaryContent ?? summary;
  const common = {
    guid: readText(entry.id),
    link: readAtomLink(entry.link),
    title: title?.text,
    content: content?.text,
    author: readAtomAuthor(entry.author),
    ...atomMediaFields(entry),
    publishedAt: parseDate(readText(entry.published) ?? readText(entry.updated)),
  };
  if (title?.type === 'xhtml' || content?.type === 'xhtml') {
    const xhtmlReadability = {
      title: title?.type === 'xhtml' && hasReadableXmlText(entry.title),
      content: content?.type === 'xhtml' && hasReadableXmlText(entry[contentName]),
    };
    if (title?.type === 'xhtml') {
      return { ...common, titleType: 'xhtml', contentType: content?.type, xhtmlReadability };
    }
    return { ...common, titleType: title?.type, contentType: 'xhtml', xhtmlReadability };
  }
  return { ...common, titleType: title?.type, contentType: content?.type };
};

const isReadableAtomConstruct = (
  construct: { readonly text: string; readonly type: RssTextType } | undefined,
  parsed: unknown,
): boolean => construct !== undefined && (construct.type === 'xhtml'
  ? hasReadableXmlText(parsed)
  : hasReadableFeedText(construct.text, construct.type));

const isXhtmlType = (value: unknown): boolean =>
  /^(xhtml|application\/xhtml\+xml)$/iu.test(readText(value) ?? '');

const isXhtmlConstruct = (value: unknown): boolean =>
  isRecord(value) && isXhtmlType(value['@_type']);

const readAtomConstruct = (value: unknown, rawValue: unknown): { readonly text: string; readonly type: RssTextType } | undefined => {
  const declaredType = isRecord(value) ? readText(value['@_type'])?.toLowerCase() : undefined;
  const type: RssTextType = declaredType === 'html' || declaredType === 'text/html'
    ? 'html'
    : declaredType === 'xhtml' || declaredType === 'application/xhtml+xml'
      ? 'xhtml'
      : declaredType === undefined || declaredType === 'text' || declaredType === 'text/plain'
        ? 'text'
        : 'unsupported';
  const xhtmlMarkup = isRecord(rawValue) ? rawValue['#text'] : undefined;
  if (type === 'xhtml' && value !== undefined && rawValue === undefined) {
    throw new Error('Atom XHTML construct could not be recovered from XML');
  }
  const text = type === 'xhtml' ? (typeof xhtmlMarkup === 'string' && xhtmlMarkup.trim().length > 0 ? xhtmlMarkup : undefined) : readText(value);
  return text === undefined ? undefined : { text, type };
};

type RssMediaFields = Partial<Pick<RssFeedItem,
  'mediaThumbnailUrl' | 'mediaContentUrl' | 'mediaContentType' | 'enclosureUrl' | 'enclosureType'>>;

const rssMediaFields = (
  item: Readonly<Record<string, unknown>>,
): RssMediaFields => ({
  ...mediaFieldsFromMediaElements(item),
  ...enclosureFields(item.enclosure),
});

const atomMediaFields = (
  entry: Readonly<Record<string, unknown>>,
): RssMediaFields => ({
  ...mediaFieldsFromMediaElements(entry),
  ...enclosureFields(readAtomEnclosure(entry.link), '@_href'),
});

const mediaFieldsFromMediaElements = (
  value: Readonly<Record<string, unknown>>,
): RssMediaFields => {
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
): RssMediaFields => {
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
  const authors = Array.isArray(value) ? value : [value];
  for (const author of authors) {
    const name = isRecord(author)
      ? (readText(author.name) ?? readText(author.email))
      : readText(author);
    if (name !== undefined) return name;
  }

  return undefined;
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
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
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

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
