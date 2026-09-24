import { createHash } from 'node:crypto';
import { err, ok, redactSensitiveText, validateOutboundUrl, type Result } from '@social-monitor/shared-kernel';

import type { SourceContentSafetyPolicy } from '../../domain/source-content-safety';
import type { ReaderValueCapture, ReaderValueSource, ReaderValueSourceSnapshot } from '../../domain/reader-value/reader-value-source';

export const READER_VALUE_SANITIZER_VERSION = 'source-safety.whitespace-preserving.v1';
export const READER_VALUE_SNAPSHOT_BODY_LIMIT = 256_000;

/** Digest the complete original representation before any redaction or truncation. */
export function captureReaderValueSourceSnapshot(
  source: ReaderValueSource,
  safety: SourceContentSafetyPolicy,
): Result<ReaderValueSourceSnapshot, 'unsafe_source'> {
  for (const url of [source.canonicalUrl, ...source.capture.segments.flatMap((segment) =>
    [segment.sourceUrl, segment.finalUrl].filter((value): value is string => value !== null))]) {
    const checked = validateOutboundUrl(url, { label: 'Reader value source', allowedProtocols: ['http:', 'https:'] });
    if (!checked.ok || checked.url.username || checked.url.password) return err('unsafe_source');
  }
  const sourceSnapshotSha256 = sha256(JSON.stringify({
    version: 'reader-value-source.v1',
    providerKey: source.providerKey,
    canonicalUrl: source.canonicalUrl,
    title: source.title,
    body: source.body,
    capture: stableCapture(source.capture, false),
  }));
  const sanitized = safety.evaluate({
    title: source.title, bodyPreview: source.body, providerKey: source.providerKey,
    preserveWhitespace: true,
  });
  const body = sanitized.sanitizedBodyPreview ?? '';
  const retainedTitle = unicodePrefix(sanitized.sanitizedTitle, READER_VALUE_SNAPSHOT_BODY_LIMIT);
  const retainedBody = unicodePrefix(body, READER_VALUE_SNAPSHOT_BODY_LIMIT);
  return ok({
    sourceSnapshotSha256,
    interestSha256: sha256(source.interest),
    sanitizedTextSha256: sha256(JSON.stringify({ title: sanitized.sanitizedTitle, body })),
    title: retainedTitle,
    body: retainedBody,
    interest: redactSensitiveText(source.interest),
    capture: stableCapture(source.capture, true),
    availableAt: source.availableAt,
    originalTitleLength: source.title.length,
    originalBodyLength: source.body.length,
    retainedSnapshotTruncated: retainedTitle.length !== sanitized.sanitizedTitle.length || retainedBody.length !== body.length,
    safety: sanitized.status,
  });
}

export const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

/** Limit UTF-16 units without splitting a surrogate pair. */
export function unicodePrefix(value: string, maxUnits: number): string {
  let end = Math.min(value.length, maxUnits);
  if (end > 0 && end < value.length && /[\uD800-\uDBFF]/u.test(value.charAt(end - 1))
    && /[\uDC00-\uDFFF]/u.test(value.charAt(end))) end -= 1;
  return value.slice(0, end);
}

function stableCapture(capture: ReaderValueCapture, sanitize: boolean): ReaderValueCapture {
  const url = (value: string | null): string | null => value === null || !sanitize ? value : redactSensitiveText(value);
  return {
    representationVersion: capture.representationVersion,
    availability: capture.availability,
    segments: capture.segments.map((segment) => ({
      origin: segment.origin,
      sourceUrl: url(segment.sourceUrl), finalUrl: url(segment.finalUrl),
      offset: segment.offset, length: segment.length, originalLength: segment.originalLength,
      truncated: segment.truncated,
      ...(segment.fullTextSha256 === undefined ? {} : { fullTextSha256: segment.fullTextSha256 }),
      ...(segment.extractionVersion === undefined ? {} : { extractionVersion: segment.extractionVersion }),
    })),
  };
}

/** Validation-only callers can still reject inputs without requesting durable custody. */
export function prepareReaderValueSourceSnapshot(source: ReaderValueSource, safety: SourceContentSafetyPolicy):
  Result<ReaderValueSourceSnapshot, 'empty_input' | 'configuration_invalid' | 'unsafe_source'> {
  const result = captureReaderValueSourceSnapshot(source, safety);
  if (!result.ok) return result;
  if (source.interest.trim().length === 0) return err('configuration_invalid');
  if (result.value.safety === 'blocked') return err('empty_input');
  return result;
}
