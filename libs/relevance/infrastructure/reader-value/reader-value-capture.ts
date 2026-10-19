import type { JsonObject } from '@social-monitor/shared-kernel';
import type { ReaderValueCapture } from '../../domain/reader-value/reader-value-source';
import { sha256 } from './reader-value-source-snapshot';
import { readReaderValueRetainedCapture } from './reader-value-retained-capture';

type CaptureResult = { readonly capture: ReaderValueCapture; readonly availableAt: string | null };
type Segment = {
  readonly origin: 'provider_native' | 'linked_article'; readonly offset: number; readonly length: number;
  readonly originalLength: number; readonly fullTextSha256: string; readonly truncated: boolean;
  readonly sourceUrl: string; readonly finalUrl: string; readonly extractionVersion: string; readonly availableAt: string;
};

/** Narrow consumer of the ingestion-owned source_content_capture.v1 stored contract.
 * Legacy bodies retain unknown historical availability; first observedAt is never substituted.
 */
export function readReaderValueCapture(metadata: JsonObject, providerKey: string, title: string, body: string,
  source?: { readonly sourceItemId: string; readonly canonicalUrl: string }): CaptureResult {
  const fallback: CaptureResult = {
    capture: { representationVersion: 'legacy-source.v1', availability: 'legacy_combined', segments: [] }, availableAt: null,
  };
  const retained = readReaderValueRetainedCapture(metadata, providerKey, title, body, source);
  if (retained !== undefined) return retained;
  const value = object(metadata.contentCapture);
  if (!value || value.version !== 'source_content_capture.v1') return fallback;
  const native = segment(value.native, body.length);
  const article = value.article === undefined ? undefined : segment(value.article, body.length);
  if (!native || native.origin !== 'provider_native' || (value.article !== undefined && (!article || article.origin !== 'linked_article'))
    || (value.articleUrl !== null && typeof value.articleUrl !== 'string')) return fallback;
  const segments = [native, ...(article ? [article] : [])];
  const digestForTitle = (captureTitle: string) => sha256(JSON.stringify([value.version, captureTitle, body, value.articleUrl,
    ...segments.map((part) => JSON.stringify([part.origin, part.offset, part.length, part.originalLength,
      part.fullTextSha256, part.truncated, part.sourceUrl, part.finalUrl, part.extractionVersion])),
  ]));
  if (digestForTitle(title) !== value.sourceSnapshotSha256 && !verifiedLegacyXTitle({
    metadata, providerKey, title, body, value, native, canonicalUrl: source?.canonicalUrl, digestForTitle,
  })) return fallback;
  const descriptionOnly = ['github-repo-radar', 'github_radar', 'github-trending-page'].includes(providerKey);
  return {
    capture: {
      representationVersion: 'source_content_capture.v1',
      availability: segments.some((part) => part.truncated) ? 'truncated' : descriptionOnly ? 'description_only'
        : !article && value.articleUrl !== null ? 'partial'
          : article || native.extractionVersion === 'provider_native.complete.v1' ? 'complete' : 'unknown',
      segments: segments.map((part) => ({ origin: part.origin === 'provider_native' ? 'native' : 'article',
        sourceUrl: part.sourceUrl, finalUrl: part.finalUrl, offset: part.offset, length: part.length,
        originalLength: part.originalLength, truncated: part.truncated, fullTextSha256: part.fullTextSha256,
        extractionVersion: part.extractionVersion })),
    },
    // CP3 timestamps use UTC ISO; preserve microseconds where supplied by a future producer.
    availableAt: segments.map((part) => part.availableAt).sort(compareTimestamp).at(-1)!,
  };
}

function segment(value: unknown, bodyLength: number): Segment | undefined {
  const part = object(value);
  if (!part || !['provider_native', 'linked_article'].includes(String(part.origin))
    || !Number.isInteger(part.offset) || !Number.isInteger(part.length) || !Number.isInteger(part.originalLength)
    || typeof part.offset !== 'number' || typeof part.length !== 'number' || typeof part.originalLength !== 'number'
    || part.offset < 0 || part.length < 0 || part.offset + part.length > bodyLength || part.originalLength < part.length
    || typeof part.truncated !== 'boolean' || (!part.truncated && part.originalLength !== part.length)
    || typeof part.fullTextSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(part.fullTextSha256)
    || typeof part.sourceUrl !== 'string' || typeof part.finalUrl !== 'string' || typeof part.extractionVersion !== 'string'
    || typeof part.availableAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(part.availableAt)
    || !Number.isFinite(Date.parse(part.availableAt))) return undefined;
  return part as unknown as Segment;
}

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
function compareTimestamp(left: string, right: string): number {
  const canonical = (value: string) => value.slice(0, 19) + '.' + (value.slice(19, -1).replace('.', '')).padEnd(6, '0');
  const a = canonical(left), b = canonical(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The former X preview sliced UTF-16 through a surrogate pair before capture hashing.
 * Persistence replaced that lone surrogate with U+FFFD. Prove the exact old capture;
 * never re-sign current text or infer acquisition time from an observation.
 */
function verifiedLegacyXTitle(input: {
  readonly metadata: JsonObject; readonly providerKey: string; readonly title: string; readonly body: string;
  readonly value: Record<string, unknown>; readonly native: Segment; readonly canonicalUrl: string | undefined;
  readonly digestForTitle: (title: string) => string;
}): boolean {
  const { metadata, providerKey, title, body, value, native, canonicalUrl, digestForTitle } = input;
  if (providerKey !== 'x-twitter' || metadata.kind !== 'x_post' || typeof metadata.authorHandle !== 'string'
    || !metadata.authorHandle || !canonicalUrl || value.article !== undefined || value.articleUrl !== null
    || native.offset !== 0 || native.length !== body.length || native.originalLength !== body.length
    || native.truncated || native.extractionVersion !== 'provider_native.v1'
    || native.sourceUrl !== canonicalUrl || native.finalUrl !== canonicalUrl
    || sha256(body) !== native.fullTextSha256) return false;
  const text = body.replace(/\s+/gu, ' ').trim();
  const high = text.charCodeAt(92), low = text.charCodeAt(93);
  if (text.length <= 96 || high < 0xd800 || high > 0xdbff || low < 0xdc00 || low > 0xdfff) return false;
  const legacyTitle = `X post by @${metadata.authorHandle}: ${text.slice(0, 93)}...`;
  return Buffer.from(legacyTitle, 'utf8').toString('utf8') === title
    && digestForTitle(legacyTitle) === value.sourceSnapshotSha256
    && sha256(JSON.stringify([legacyTitle, native.fullTextSha256, canonicalUrl, null])) === value.nativeRevision;
}
