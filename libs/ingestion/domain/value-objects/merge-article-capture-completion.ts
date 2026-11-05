import type { SourceItemProps } from '../entities/source-item';
import { articleRequestUrl, mergeCaptureMetadata, readContentCapture } from './source-content-capture';

// A capture owns body segments and capture diagnostics, never provider facts.
// Apply its result to the locked/current snapshot, not the dispatch snapshot.
export const mergeArticleCaptureCompletion = (
  current: SourceItemProps,
  incoming: SourceItemProps,
  providerKey: string,
): SourceItemProps | undefined => {
  const prior = readContentCapture(current);
  const next = readContentCapture(incoming);
  if (prior === undefined || next === undefined ||
      current.id !== incoming.id || current.tenantId !== incoming.tenantId ||
      current.workspaceId !== incoming.workspaceId || current.sourceBindingId !== incoming.sourceBindingId ||
      current.externalId !== incoming.externalId || current.canonicalUrl !== incoming.canonicalUrl ||
      current.title !== incoming.title || current.metadata?.kind !== incoming.metadata?.kind || prior.nativeRevision !== next.nativeRevision ||
      prior.articleUrl !== next.articleUrl ||
      (articleRequestUrl(providerKey, current) ?? null) !== next.articleUrl ||
      current.body.slice(prior.native.offset, prior.native.offset + prior.native.length) !==
        incoming.body.slice(next.native.offset, next.native.offset + next.native.length)) return undefined;
  const metadata = mergeCaptureMetadata(current.metadata, incoming.metadata);
  const sourceUrlKey = providerKey === 'hacker-news' ? 'externalUrl'
    : providerKey === 'reddit' ? 'linkedUrl' : undefined;
  // A reserved item may predate the sanitizing enrichment adapter. Its fetch
  // URL remains useful only until this completion; replace that provider field
  // with the safe capture identity while preserving unrelated concurrent facts.
  const safeSourceUrl = sourceUrlKey === undefined ? undefined : incoming.metadata?.[sourceUrlKey];
  return {
    ...current,
    body: incoming.body,
    metadata: sourceUrlKey === undefined || typeof safeSourceUrl !== 'string' ? metadata : {
      ...metadata,
      [sourceUrlKey]: safeSourceUrl,
    },
  };
};
