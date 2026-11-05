import type { JsonObject } from '@social-monitor/shared-kernel';
import type { ReaderValueCapture } from '../../domain/reader-value/reader-value-source';
import { sha256 } from './reader-value-source-snapshot';

/** Independent narrow consumer of the ingestion-owned retained snapshot contract. */
export const readReaderValueRetainedCapture = (metadata: JsonObject, providerKey: string,
  title: string, body: string, source: { readonly sourceItemId: string;
    readonly canonicalUrl: string } | undefined):
  { readonly capture: ReaderValueCapture; readonly availableAt: string } | undefined => {
  const raw = metadata.contentCapture;
  if (source === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const c = raw as Record<string, unknown>;
  const version = 'retained_source_content_capture.v1';
  if (Object.keys(c).sort().join() !== ['availability', 'availableAt', 'bodyLength',
    'bodySha256', 'origin', 'originalSegmentBoundaries', 'presentationComplete',
    'providerKey', 'sourceItemId', 'sourceSnapshotSha256', 'version'].sort().join() ||
      c.version !== version || c.origin !== 'retained_snapshot' ||
      c.sourceItemId !== source.sourceItemId || c.providerKey !== providerKey ||
      c.availability !== 'partial' || c.presentationComplete !== false ||
      c.originalSegmentBoundaries !== 'unknown' || c.bodyLength !== body.length ||
      c.bodySha256 !== sha256(body) || typeof c.availableAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(c.availableAt) ||
      !Number.isFinite(Date.parse(c.availableAt)) ||
      new Date(c.availableAt).toISOString().slice(0,19)!==c.availableAt.slice(0,19) ||
      c.sourceSnapshotSha256 !== sha256(JSON.stringify([version, 'retained_snapshot',
        source.sourceItemId, providerKey, source.canonicalUrl, title, body, c.availableAt,
        'partial', false, 'unknown']))) return undefined;
  return { availableAt: c.availableAt, capture: {
    representationVersion: version, availability: 'partial', segments: [{
      origin: 'retained_snapshot', sourceUrl: source.canonicalUrl, finalUrl: null,
      offset: 0, length: body.length, originalLength: body.length, truncated: false,
      fullTextSha256: sha256(body), extractionVersion: version,
    }],
  } };
};
