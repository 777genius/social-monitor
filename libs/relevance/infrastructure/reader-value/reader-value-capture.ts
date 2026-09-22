import type { JsonObject } from '@social-monitor/shared-kernel';
import type { ReaderValueCapture } from '../../domain/reader-value/reader-value-source';
import { sha256 } from './reader-value-source-snapshot';

type CaptureResult = { readonly capture: ReaderValueCapture; readonly availableAt: string | null };
type Segment = {
  readonly origin: 'provider_native' | 'linked_article'; readonly offset: number; readonly length: number;
  readonly originalLength: number; readonly fullTextSha256: string; readonly truncated: boolean;
  readonly sourceUrl: string; readonly finalUrl: string; readonly extractionVersion: string; readonly availableAt: string;
};

/** Narrow consumer of the ingestion-owned source_content_capture.v1 stored contract.
 * Legacy bodies retain unknown historical availability; first observedAt is never substituted.
 */
export function readReaderValueCapture(metadata: JsonObject, providerKey: string, title: string, body: string): CaptureResult {
  const fallback: CaptureResult = {
    capture: { representationVersion: 'legacy-source.v1', availability: 'legacy_combined', segments: [] }, availableAt: null,
  };
  const value = object(metadata.contentCapture);
  if (!value || value.version !== 'source_content_capture.v1') return fallback;
  const native = segment(value.native, body.length);
  const article = value.article === undefined ? undefined : segment(value.article, body.length);
  if (!native || native.origin !== 'provider_native' || (value.article !== undefined && (!article || article.origin !== 'linked_article'))
    || (value.articleUrl !== null && typeof value.articleUrl !== 'string')) return fallback;
  const segments = [native, ...(article ? [article] : [])];
  const digest = sha256(JSON.stringify([value.version, title, body, value.articleUrl,
    ...segments.map((part) => JSON.stringify([part.origin, part.offset, part.length, part.originalLength,
      part.fullTextSha256, part.truncated, part.sourceUrl, part.finalUrl, part.extractionVersion])),
  ]));
  if (digest !== value.sourceSnapshotSha256) return fallback;
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
