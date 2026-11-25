import type { JsonObject } from '@social-monitor/shared-kernel';
import type { SourceItemProps } from '../entities/source-item';
import { articleRequestUrl, captureSha256, readContentCapture } from './source-content-capture';

// A legacy rich body has no trustworthy segment boundaries. In particular,
// text that happens to contain "Article text:" is never parsed as provenance.
export const preserveVerifiedLegacyCapture = (
  incoming: SourceItemProps,
  existing: SourceItemProps,
  providerKey: string,
  nativeUnchangedProven: boolean,
): SourceItemProps => {
  if (existing.sourceBindingId !== incoming.sourceBindingId || readContentCapture(existing) !== undefined) return incoming;
  const article = record(existing.metadata?.articleContent);
  const prior = record(existing.metadata?.contentCapture);
  const native = readContentCapture(incoming);
  if (article?.status !== 'enriched' || native === undefined || native.article !== undefined) return incoming;
  const sameNative = nativeUnchangedProven || (prior?.provenance === 'legacy_combined' && prior.nativeRevision === native.nativeRevision);
  if (!sameNative || existing.canonicalUrl !== incoming.canonicalUrl || existing.title !== incoming.title ||
      articleRequestUrl(providerKey, existing) !== articleRequestUrl(providerKey, incoming)) return incoming;
  const capture = {
    version: 'source_content_capture.v1', provenance: 'legacy_combined',
    nativeRevision: native.nativeRevision, articleUrl: native.articleUrl,
    extractionVersion: 'legacy_combined.v1', availableAt: null,
    presentationComplete: false,
    sourceSnapshotSha256: legacyDigest(incoming.title, existing.body, incoming.canonicalUrl, native.articleUrl),
  };
  return { ...incoming, body: existing.body, metadata: {
    ...incoming.metadata, articleContent: article, contentCapture: capture,
    // There is no recoverable provider-native segment for due extraction.
    articleCaptureAttempt: null,
  } };
};

export const legacySourceSnapshotSha256 = (snapshot: Pick<SourceItemProps, 'metadata' | 'body' | 'title' | 'canonicalUrl'>): string | undefined => {
  const capture = record(snapshot.metadata?.contentCapture);
  if (capture?.version !== 'source_content_capture.v1' || capture.provenance !== 'legacy_combined' ||
      (capture.articleUrl !== null && typeof capture.articleUrl !== 'string')) return undefined;
  const digest = legacyDigest(snapshot.title, snapshot.body, snapshot.canonicalUrl, capture.articleUrl);
  return capture.sourceSnapshotSha256 === digest ? digest : undefined;
};

const legacyDigest = (title: string, body: string, canonicalUrl: string, articleUrl: string | null): string =>
  captureSha256(JSON.stringify(['source_content_capture.v1', 'legacy_combined.v1', title, body, canonicalUrl, articleUrl]));
const record = (value: unknown): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
