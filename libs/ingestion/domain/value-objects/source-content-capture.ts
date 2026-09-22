import { createHash } from 'node:crypto';
import { sanitizeUrlCredentials, type JsonObject } from '@social-monitor/shared-kernel';

export const CONTENT_CAPTURE_VERSION = 'source_content_capture.v1';
export const ARTICLE_REPRESENTATION_VERSION = 'readability.text.v2';
export const ARTICLE_FETCH_POLICY_VERSION = 'article_fetch_policy.v1';
export const SOURCE_STORAGE_CHARACTERS = 256_000;
export const PRESENTATION_BODY_CHARACTERS = 64_000;
const articleSeparator = '\n\nArticle text:\n';
const articleSeparatorAfterLineBreak = '\nArticle text:\n';

type CaptureText = {
  readonly title: string;
  readonly body: string;
  readonly canonicalUrl: string;
  readonly metadata?: JsonObject;
};

export const markLiveArticleCredentialsRequired = <T extends CaptureText>(item: T): T => ({
  ...item,
  metadata: {
    ...item.metadata,
    articleFetchPolicy: {
      version: ARTICLE_FETCH_POLICY_VERSION,
      liveUrlRequired: true,
    },
  },
});

export const requiresLiveArticleCredentials = (item: CaptureText): boolean => {
  const policy = item.metadata?.articleFetchPolicy;
  return typeof policy === 'object' && policy !== null && !Array.isArray(policy) &&
    'version' in policy && policy.version === ARTICLE_FETCH_POLICY_VERSION &&
    'liveUrlRequired' in policy && policy.liveUrlRequired === true;
};
export type CaptureSegment = {
  readonly origin: 'provider_native' | 'linked_article';
  readonly offset: number;
  readonly length: number;
  readonly originalLength: number;
  readonly fullTextSha256: string;
  readonly truncated: boolean;
  readonly availableAt: string;
  readonly sourceUrl: string;
  readonly finalUrl: string;
  readonly extractionVersion: string;
};
export type SourceContentCapture = {
  readonly version: typeof CONTENT_CAPTURE_VERSION;
  readonly nativeRevision: string;
  readonly sourceSnapshotSha256: string;
  readonly articleUrl: string | null;
  readonly availableAt: string;
  readonly presentationComplete: boolean;
  readonly native: CaptureSegment;
  readonly article?: CaptureSegment;
};

export const captureSha256 = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

/**
 * The URL used at fetch time deliberately retains its query string. Signed
 * article URLs are valid egress inputs, but are never a durable capture
 * identity. Callers must use articleRequestUrl for anything persisted.
 */
export const articleFetchUrl = (providerKey: string, item: CaptureText): string | undefined => {
  if (providerKey === 'rss' && item.metadata?.nativeContentComplete === true && item.body.trim().length > 0) return undefined;
  const candidate = providerKey === 'hacker-news' ? item.metadata?.externalUrl
    : providerKey === 'reddit' ? item.metadata?.linkedUrl
      : providerKey === 'rss' ? item.canonicalUrl : undefined;
  if (typeof candidate !== 'string') return undefined;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    if (['news.ycombinator.com', 'reddit.com', 'www.reddit.com', 'old.reddit.com'].includes(url.hostname)) return undefined;
    url.hash = '';
    return url.toString();
  } catch { return undefined; }
};

/** A credential-free, stable article identity suitable for durable metadata. */
export const articleRequestUrl = (providerKey: string, item: CaptureText): string | undefined => {
  const url = articleFetchUrl(providerKey, item);
  return url === undefined ? undefined : sanitizeCaptureUrl(url);
};

/**
 * Capture URLs are stored and hashed with content provenance. Keep ordinary
 * query parameters (they can identify an article), but discard credential-like
 * parameters, userinfo and fragments before that representation is created.
 */
export const sanitizeCaptureUrl = (value: string): string => {
  return sanitizeUrlCredentials(value);
};

export const unicodePrefix = (value: string, limit: number): string => {
  if (value.length <= limit) return value;
  const code = value.charCodeAt(limit - 1);
  return value.slice(0, code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit);
};

export const readContentCapture = (item: CaptureText): SourceContentCapture | undefined => {
  const value = item.metadata?.contentCapture;
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('version' in value) || value.version !== CONTENT_CAPTURE_VERSION) return undefined;
  const capture = value as unknown as SourceContentCapture;
  if (!validSegment(capture.native, item.body.length) || capture.native.origin !== 'provider_native' ||
      (capture.article !== undefined && (!validSegment(capture.article, item.body.length) || capture.article.origin !== 'linked_article')) ||
      !isSha256(capture.nativeRevision) || !isSha256(capture.sourceSnapshotSha256) ||
      (capture.articleUrl !== null && typeof capture.articleUrl !== 'string')) return undefined;
  if (capture.sourceSnapshotSha256 !== snapshotDigest(item, capture)) return undefined;
  return capture;
};
const validSegment = (value: CaptureSegment | undefined, bodyLength: number): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Number.isInteger(value.offset) && Number.isInteger(value.length) &&
  value.offset >= 0 && value.length >= 0 && value.offset + value.length <= bodyLength &&
  Number.isInteger(value.originalLength) && value.originalLength >= 0 && typeof value.truncated === 'boolean' &&
  typeof value.sourceUrl === 'string' && typeof value.finalUrl === 'string' && typeof value.extractionVersion === 'string' &&
  isSha256(value.fullTextSha256) && typeof value.availableAt === 'string' &&
  Number.isFinite(Date.parse(value.availableAt));
const isSha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export const captureNativeText = <T extends CaptureText>(item: T, providerKey: string, capturedAt: Date): T => {
  if (readContentCapture(item) !== undefined) return item;
  const body = unicodePrefix(item.body, SOURCE_STORAGE_CHARACTERS);
  const url = articleRequestUrl(providerKey, item) ?? null;
  const native: CaptureSegment = {
    origin: 'provider_native', offset: 0, length: body.length, originalLength: item.body.length,
    fullTextSha256: captureSha256(item.body), truncated: body.length !== item.body.length,
    availableAt: capturedAt.toISOString(), sourceUrl: item.canonicalUrl, finalUrl: item.canonicalUrl,
    extractionVersion: providerKey === 'rss' && item.metadata?.nativeContentComplete === true
      ? 'provider_native.complete.v1' : 'provider_native.v1',
  };
  return withCapture({ ...item, body }, {
    version: CONTENT_CAPTURE_VERSION,
    nativeRevision: captureSha256(JSON.stringify([item.title, native.fullTextSha256, item.canonicalUrl, url])),
    articleUrl: url, native,
  });
};

export const captureArticleText = <T extends CaptureText>(item: T, article: {
  readonly text: string;
  readonly sourceUrl: string;
  readonly finalUrl: string;
  readonly originalLength: number;
  readonly fullTextSha256: string;
  readonly truncated: boolean;
  readonly extractionVersion: string;
  readonly acquiredAt: Date;
}): T => {
  const capture = readContentCapture(item);
  if (capture === undefined) throw new Error('Article capture requires a native capture');
  const nativeText = item.body.slice(capture.native.offset, capture.native.offset + capture.native.length);
  // Segment hashes and lengths describe retained bytes. Whitespace-equivalent
  // strings are not interchangeable for capture provenance.
  const same = nativeText === article.text;
  const preferredSeparator = nativeText.endsWith('\n') ? articleSeparatorAfterLineBreak : articleSeparator;
  const separator = nativeText.length === 0 || same || nativeText.length + preferredSeparator.length > SOURCE_STORAGE_CHARACTERS
    ? '' : preferredSeparator;
  const offset = same ? 0 : nativeText.length + separator.length;
  const articleText = same ? nativeText : unicodePrefix(article.text, Math.max(0, SOURCE_STORAGE_CHARACTERS - offset));
  const body = same ? nativeText : nativeText + separator + articleText;
  return withCapture({ ...item, body }, {
    ...capture,
    article: {
      origin: 'linked_article', offset, length: articleText.length,
      originalLength: article.originalLength, fullTextSha256: article.fullTextSha256,
      truncated: article.truncated || articleText.length < article.text.length,
      sourceUrl: article.sourceUrl, finalUrl: article.finalUrl,
      extractionVersion: article.extractionVersion, availableAt: article.acquiredAt.toISOString(),
    },
  });
};

// Both repository implementations apply this before computing effective revision.
export const preserveSourceCapture = <T extends CaptureText>(incoming: T, existing: CaptureText): T => {
  const next = readContentCapture(incoming);
  const prior = readContentCapture(existing);
  if (next === undefined || prior === undefined) return incoming;
  const native = next.nativeRevision === prior.nativeRevision
    ? { ...next.native, availableAt: prior.native.availableAt } : next.native;
  const sameOpportunity = next.nativeRevision === prior.nativeRevision && next.articleUrl === prior.articleUrl;
  const input = sameOpportunity && incoming.metadata?.articleCaptureAttempt === undefined && existing.metadata?.articleCaptureAttempt !== undefined
    ? { ...incoming, metadata: { ...incoming.metadata, articleCaptureAttempt: existing.metadata.articleCaptureAttempt } } : incoming;
  let result = withCapture(input, { ...next, native });
  if (next.articleUrl !== prior.articleUrl || prior.article === undefined) return result;
  if (next.article !== undefined) {
    if (sameArticleRepresentation(next.article, prior.article)) {
      result = withCapture(result, { ...next, native, article: { ...next.article, availableAt: prior.article.availableAt } });
    }
    return result;
  }
  const article = prior.article;
  if (article.extractionVersion !== ARTICLE_REPRESENTATION_VERSION) return result;
  result = captureArticleText(result, {
    text: existing.body.slice(article.offset, article.offset + article.length),
    sourceUrl: article.sourceUrl, finalUrl: article.finalUrl,
    originalLength: article.originalLength, fullTextSha256: article.fullTextSha256,
    truncated: article.truncated, extractionVersion: article.extractionVersion,
    acquiredAt: new Date(article.availableAt),
  });
  return { ...result, metadata: { ...result.metadata, articleContent: existing.metadata?.articleContent ?? null } };
};

const stableSegment = (segment: CaptureSegment): string => JSON.stringify([
  segment.origin, segment.offset, segment.length, segment.originalLength, segment.fullTextSha256,
  segment.truncated, segment.sourceUrl, segment.finalUrl, segment.extractionVersion,
]);

const sameArticleRepresentation = (left: CaptureSegment, right: CaptureSegment): boolean =>
  left.fullTextSha256 === right.fullTextSha256 && left.length === right.length &&
  left.originalLength === right.originalLength && left.truncated === right.truncated &&
  left.sourceUrl === right.sourceUrl && left.finalUrl === right.finalUrl &&
  left.extractionVersion === right.extractionVersion;

const snapshotDigest = (item: CaptureText, capture: Pick<SourceContentCapture, 'native' | 'article' | 'articleUrl'>): string =>
  captureSha256(JSON.stringify([
    CONTENT_CAPTURE_VERSION, item.title, item.body, capture.articleUrl, stableSegment(capture.native),
    ...(capture.article === undefined ? [] : [stableSegment(capture.article)]),
  ]));

const withCapture = <T extends CaptureText>(item: T, capture: Omit<SourceContentCapture,
  'sourceSnapshotSha256' | 'availableAt' | 'presentationComplete'>): T => {
  const segments = [capture.native, ...(capture.article === undefined ? [] : [capture.article])];
  const complete: SourceContentCapture = {
    ...capture,
    sourceSnapshotSha256: snapshotDigest(item, capture),
    availableAt: segments.map((segment) => segment.availableAt).sort().at(-1)!,
    presentationComplete: item.body.length <= PRESENTATION_BODY_CHARACTERS && !segments.some((segment) => segment.truncated),
  };
  return { ...item, metadata: { ...item.metadata, contentCapture: complete as unknown as JsonObject } };
};

// Observation/attempt changes are durable without changing the effective content
// revision or overwriting provider facts owned by the engagement projection.
export const mergeCaptureMetadata = (previous: JsonObject | undefined, next: JsonObject | undefined): JsonObject => ({
  ...previous,
  ...Object.fromEntries(['contentCapture', 'articleCaptureAttempt', 'articleContent']
    .flatMap((key) => next?.[key] === undefined ? [] : [[key, next[key]]])),
});
