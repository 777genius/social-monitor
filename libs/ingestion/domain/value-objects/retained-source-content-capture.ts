import { captureSha256 } from './source-content-capture';

export const RETAINED_SOURCE_CAPTURE_VERSION = 'retained_source_content_capture.v1';
export type RetainedCaptureSource = {
  readonly id: string; readonly providerKey: string; readonly canonicalUrl: string;
  readonly title: string; readonly body: string;
};
export type RetainedSourceContentCapture = {
  readonly version: typeof RETAINED_SOURCE_CAPTURE_VERSION;
  readonly origin: 'retained_snapshot'; readonly sourceItemId: string;
  readonly providerKey: string; readonly availableAt: string;
  readonly availability: 'partial'; readonly presentationComplete: false;
  readonly originalSegmentBoundaries: 'unknown'; readonly sourceSnapshotSha256: string;
  readonly bodySha256: string; readonly bodyLength: number;
};

/** Captures retained bytes now. It does not reconstruct provider/article acquisition. */
export const captureRetainedSourceContent = (
  source: RetainedCaptureSource, databaseClock: string,
): RetainedSourceContentCapture => {
  if (!validClock(databaseClock) || source.title.length + source.body.length === 0) {
    throw new Error('Retained capture requires nonempty bytes and database wall time');
  }
  return {
    version: RETAINED_SOURCE_CAPTURE_VERSION, origin: 'retained_snapshot',
    sourceItemId: source.id, providerKey: source.providerKey, availableAt: databaseClock,
    availability: 'partial', presentationComplete: false,
    originalSegmentBoundaries: 'unknown', bodySha256: captureSha256(source.body),
    bodyLength: source.body.length, sourceSnapshotSha256: retainedDigest(source, databaseClock),
  };
};

export const readRetainedSourceContentCapture = (
  source: RetainedCaptureSource & { readonly metadata?: Readonly<Record<string, unknown>> },
): RetainedSourceContentCapture | undefined => {
  const value = source.metadata?.contentCapture;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const c = value as Record<string, unknown>;
  if (Object.keys(c).sort().join() !== [
    'availability', 'availableAt', 'bodyLength', 'bodySha256', 'origin',
    'originalSegmentBoundaries', 'presentationComplete', 'providerKey',
    'sourceItemId', 'sourceSnapshotSha256', 'version',
  ].sort().join() || c.version !== RETAINED_SOURCE_CAPTURE_VERSION ||
      c.origin !== 'retained_snapshot' || c.sourceItemId !== source.id ||
      c.providerKey !== source.providerKey || c.availability !== 'partial' ||
      c.presentationComplete !== false || c.originalSegmentBoundaries !== 'unknown' ||
      !validClock(c.availableAt) || c.bodyLength !== source.body.length ||
      c.bodySha256 !== captureSha256(source.body) ||
      c.sourceSnapshotSha256 !== retainedDigest(source, c.availableAt)) return undefined;
  return c as unknown as RetainedSourceContentCapture;
};

const retainedDigest = (source: RetainedCaptureSource, clock: string): string =>
  captureSha256(JSON.stringify([RETAINED_SOURCE_CAPTURE_VERSION, 'retained_snapshot',
    source.id, source.providerKey, source.canonicalUrl, source.title, source.body, clock,
    'partial', false, 'unknown']));
const validClock = (clock: unknown): clock is string => typeof clock === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(clock) &&
  Number.isFinite(Date.parse(clock)) && new Date(clock).toISOString().slice(0,19)===clock.slice(0,19);
