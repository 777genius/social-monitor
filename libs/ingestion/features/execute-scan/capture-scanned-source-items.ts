import type { Clock, IdGenerator, JsonObject } from '@social-monitor/shared-kernel';
import { SourceItem } from '../../domain/entities/source-item';
import { finishArticleCapture, readArticleCaptureAttempt, releaseUndispatchedArticleCapture, type ArticleCaptureOutcome } from '../../domain/value-objects/article-capture-attempt';
import { readContentCapture, requiresLiveArticleCredentials, sanitizeCaptureUrl } from '../../domain/value-objects/source-content-capture';
import type { ArticleCaptureRepository, ArticleCaptureScope } from '../../ports/article-capture-repository';
import type { FetchedSourceItem } from '../../ports/source-fetcher.port';
import type { ScanLease } from '../../ports/scan-lease.port';
import { noopSourceItemEnrichment, type SourceItemEnrichmentPort } from '../../ports/source-item-enrichment.port';
import type { SavedSourceItemRef, SourceItemRepositoryPort } from '../../ports/source-item-repository.port';
import { sanitizeFetchedSourceItem } from './scan-source-sanitization';

export const captureScannedSourceItems = async (params: {
  readonly scope: ArticleCaptureScope;
  readonly repository: SourceItemRepositoryPort & ArticleCaptureRepository;
  readonly enrichment: SourceItemEnrichmentPort;
  readonly items: readonly FetchedSourceItem[];
  readonly capturedAt: Date;
  readonly unchangedNativeExternalIds?: readonly string[];
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly lease: ScanLease;
  readonly correlationId: string;
  /** Ephemeral only: never persist values from this map. */
  readonly liveArticleFetchUrls?: ReadonlyMap<string, string>;
}) => {
  // This is the first durable boundary, including no-extraction scans.
  const native = params.items.map((item) => SourceItem.ingest({
    ...item,
    ...sanitizeFetchedSourceItem(item),
    id: params.ids.generate(), tenantId: params.scope.tenantId,
    workspaceId: params.scope.workspaceId, sourceBindingId: params.scope.sourceBindingId,
    ingestedAt: params.capturedAt,
  }));
  const saved = await params.repository.saveBatch({ ...params.scope, items: native, unchangedNativeExternalIds: params.unchangedNativeExternalIds });
  const refs = new Map(saved.items.map((ref) => [ref.externalId, ref]));
  const deadline = Math.min(params.clock.now().getTime() + 60_000, params.lease.expiresAt.getTime() - 10_000);
  let enriched = 0;
  let failed = 0;
  let skipped = 0;
  // This lookup is independent of candidate memory and runs for an empty/304
  // response. Native persistence precedes HTTP so newer URLs invalidate claims.
  const due = params.enrichment === noopSourceItemEnrichment ? [] : await params.repository.findDueArticleCaptures({ ...params.scope, now: params.clock.now(), limit: 20 });
  const reservations: SourceItem[] = [];
  for (const candidate of due) {
    const remaining = deadline - params.clock.now().getTime();
    if (remaining <= 0) { skipped += 1; continue; }
    const snapshot = candidate.toSnapshot();
    const capture = readContentCapture(snapshot);
    if (capture?.articleUrl == null) continue;
    const liveUrl = params.liveArticleFetchUrls?.get(snapshot.externalId);
    if (requiresLiveArticleCredentials(snapshot) &&
        (liveUrl === undefined || sanitizeCaptureUrl(liveUrl) !== capture.articleUrl)) {
      // A sanitized URL is durable identity, not an egress capability. Wait
      // for a matching URL from a live provider response without reserving or
      // spending the bounded attempt budget.
      skipped += 1;
      continue;
    }
    const reserved = await params.repository.reserveArticleCapture({
      ...params.scope, externalId: snapshot.externalId,
      expectedNativeRevision: capture.nativeRevision, expectedArticleUrl: capture.articleUrl,
      reservationToken: params.ids.generate(), lease: params.lease, now: params.clock.now(),
    });
    if (reserved === null) continue;
    reservations.push(reserved);
  }
  const remaining = deadline - params.clock.now().getTime();
  const result = reservations.length === 0 || remaining <= 0 ? undefined : await params.enrichment.enrich({
    ...params.scope, scanJobId: params.lease.scanJobId, correlationId: params.correlationId,
    capturedAt: params.capturedAt, clock: params.clock,
    signal: AbortSignal.timeout(remaining), deadlineAt: new Date(deadline),
    liveArticleFetchUrls: params.liveArticleFetchUrls,
    items: reservations.map((item) => item.toSnapshot()),
  });
  // An adapter is an outer boundary. Sanitize its output again before any
  // completion/attempt metadata can cross into persistence.
  const outcomes = new Map(result?.items.map((item) => {
    const safe = sanitizeFetchedSourceItem(item);
    return [safe.externalId, safe] as const;
  }) ?? []);
  for (const reserved of reservations) {
    const original = reserved.toSnapshot();
    const expected = readArticleCaptureAttempt(original)!;
    const capture = readContentCapture(original)!;
    const item = outcomes.get(original.externalId) ?? original;
    const success = readContentCapture(item)?.article !== undefined;
    const undispatched = result === undefined || isBudgetSkipped(item);
    const completed = SourceItem.rehydrate(undispatched
      ? releaseUndispatchedArticleCapture(original, params.clock.now())
      : finishArticleCapture({ ...original, ...item }, success
        ? { kind: 'succeeded' }
        : captureFailureOutcome(item, params.clock.now()), params.clock.now()));
    const persisted = await params.repository.completeArticleCapture({
      ...params.scope, item: completed, expected, lease: params.lease, now: params.clock.now(),
    });
    if (persisted === null) continue;
    if (success) enriched += 1;
    else if (undispatched) skipped += 1;
    else failed += 1;
    const previous = refs.get(original.externalId);
    const changed = readContentCapture(persisted.toSnapshot())?.sourceSnapshotSha256 !== capture.sourceSnapshotSha256;
    const ref: SavedSourceItemRef = {
      externalId: original.externalId, sourceItemId: original.id, persistedItem: persisted,
      inserted: previous?.inserted ?? false,
      mutationKind: previous?.mutationKind === 'inserted' ? 'inserted'
        : changed || previous?.mutationKind === 'content_updated' ? 'content_updated' : 'unchanged',
    };
    // Unchanged due failures need no projection, but their attempt is durable.
    if (previous !== undefined || changed) refs.set(original.externalId, ref);
  }
  const items = [...refs.values()];
  return {
    items: items.map((ref) => ref.persistedItem),
    saveResult: {
      inserted: items.filter((ref) => ref.inserted).length,
      contentUpdated: items.filter((ref) => ref.mutationKind === 'content_updated').length,
      skippedDuplicates: items.filter((ref) => ref.mutationKind === 'unchanged').length,
      items,
    },
    enriched: { items: items.map((ref) => ref.persistedItem.toSnapshot()), enriched, failed, skipped },
  };
};

export const supportsArticleCapture = (repository: SourceItemRepositoryPort): repository is SourceItemRepositoryPort & ArticleCaptureRepository =>
  repository.findDueArticleCaptures !== undefined && repository.reserveArticleCapture !== undefined && repository.completeArticleCapture !== undefined;

const captureFailureOutcome = (item: FetchedSourceItem, now: Date): ArticleCaptureOutcome => {
  const raw = item.metadata?.articleContent;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { kind: 'retryable_failed', reasonCode: 'extraction_failed' };
  }
  const failure = raw as JsonObject;
  const reasonCode = typeof failure.reasonCode === 'string' ? failure.reasonCode : 'extraction_unavailable';
  if (failure.retryable !== true) return { kind: 'permanent_failed', reasonCode };
  const header = typeof failure.retryAfter === 'string' ? failure.retryAfter.trim() : '';
  const timestamp = /^\d+$/.test(header) ? now.getTime() + Number(header) * 1000 : Date.parse(header);
  return { kind: 'retryable_failed', reasonCode,
    ...(Number.isFinite(timestamp) && timestamp >= now.getTime() && timestamp <= 8.64e15 ? { retryAfter: new Date(timestamp) } : {}),
  };
};

const isBudgetSkipped = (item: FetchedSourceItem): boolean => {
  const content = item.metadata?.articleContent;
  return typeof content === 'object' && content !== null && !Array.isArray(content) && 'reasonCode' in content && content.reasonCode === 'scan_budget_exhausted';
};
