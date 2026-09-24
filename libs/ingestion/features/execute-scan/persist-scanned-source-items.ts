import type { Clock, IdGenerator } from '@social-monitor/shared-kernel';
import { SourceItem } from '../../domain/entities/source-item';
import type { ArticleCaptureScope } from '../../ports/article-capture-repository';
import type { FetchedSourceItem } from '../../ports/source-fetcher.port';
import type { ScanLease } from '../../ports/scan-lease.port';
import type { SourceItemEnrichmentPort } from '../../ports/source-item-enrichment.port';
import type { SourceItemRepositoryPort } from '../../ports/source-item-repository.port';
import { captureScannedSourceItems, supportsArticleCapture } from './capture-scanned-source-items';
import { mergeEnrichedSourceCandidates, rehydratePersistedSourceItems } from './execute-scan-persisted-source-items';
import { sanitizeFetchedSourceItem } from './scan-source-sanitization';
import type { SourceCandidateScreening } from './source-candidate-memory-coordinator';

export const persistScannedSourceItems = async (params: {
  readonly scope: ArticleCaptureScope;
  readonly repository: SourceItemRepositoryPort;
  readonly enrichment: SourceItemEnrichmentPort;
  readonly items: readonly FetchedSourceItem[];
  readonly screening: SourceCandidateScreening;
  readonly capturedAt: Date;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly lease: ScanLease;
  readonly correlationId: string;
  /** Ephemeral only: never persist values from this map. */
  readonly liveArticleFetchUrls?: ReadonlyMap<string, string>;
}) => {
  if (['hacker-news', 'reddit', 'rss'].includes(params.scope.providerKey) && supportsArticleCapture(params.repository)) {
    const captured = await captureScannedSourceItems({
      ...params, repository: params.repository,
      unchangedNativeExternalIds: params.screening.classificationReliable
        ? params.screening.classifications.filter((entry) => !entry.legacyFallback &&
            ['unchanged', 'engagement_changed', 'observation_due'].includes(entry.kind)).map((entry) => entry.externalId)
        : [],
    });
    return { ...captured, persistedItems: captured.items };
  }
  const enriched = params.screening.itemsToEnrich.length === 0
    ? { items: [], enriched: 0, skipped: 0, failed: 0 }
      : await params.enrichment.enrich({
      ...params.scope, scanJobId: params.lease.scanJobId, correlationId: params.correlationId,
      items: params.screening.itemsToEnrich, capturedAt: params.capturedAt, clock: params.clock,
      liveArticleFetchUrls: params.liveArticleFetchUrls,
    });
  const fetchedItems = mergeEnrichedSourceCandidates({
    fetchedItems: params.items, itemsRequiringEnrichment: params.screening.itemsToEnrich,
    enrichedItems: enriched.items.map(sanitizeFetchedSourceItem),
  });
  const items = fetchedItems.map((item) => SourceItem.ingest({
    ...item, ...sanitizeFetchedSourceItem(item),
    id: params.ids.generate(), tenantId: params.scope.tenantId,
    workspaceId: params.scope.workspaceId, sourceBindingId: params.scope.sourceBindingId, ingestedAt: params.capturedAt,
  }));
  const saveResult = items.length === 0 ? { inserted: 0, contentUpdated: 0, skippedDuplicates: 0, items: [] }
    : await params.repository.saveBatch({ ...params.scope, items });
  return { enriched, saveResult, persistedItems: rehydratePersistedSourceItems(items, saveResult.items) };
};
