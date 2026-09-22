import { preserveVerifiedLegacyCapture } from '../../domain/value-objects/legacy-source-capture';
import { mergeArticleCaptureCompletion } from '../../domain/value-objects/merge-article-capture-completion';
import { isCurrentInMemoryScanLease } from '../lease/in-memory-scan-lease.adapter';
import { articleCaptureCompletionMatches, articleCaptureIsDue, prepareLegacyArticleCapture, reserveArticleCapture } from '../../domain/value-objects/article-capture-attempt';
import { readContentCapture } from '../../domain/value-objects/source-content-capture';
import type { ArticleCaptureRepository } from '../../ports/article-capture-repository';
import { prepareArticleCaptureAttempt } from '../../domain/value-objects/article-capture-attempt';
import { captureNativeText, preserveSourceCapture } from '../../domain/value-objects/source-content-capture';
import {
  assertGitHubTrendingDurableObservationCoherence,
  GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  githubTrendingSnapshotBatchObservedAt,
  sourceItemProviderContentHash,
  SourceItem,
} from '../../domain';
import type {
  SavedSourceItemRef,
  SaveSourceItemsCommand,
  SaveSourceItemsResult,
  SourceItemRepositoryPort,
} from '../../ports';

export class InMemorySourceItemRepository implements SourceItemRepositoryPort {
  private readonly itemsByDeduplicationKey = new Map<string, SourceItem>();
  private readonly contentHashesByDeduplicationKey = new Map<string, string>();

  async saveBatch(command: SaveSourceItemsCommand): Promise<SaveSourceItemsResult> {
    const observedAt = githubTrendingSnapshotBatchObservedAt({
      providerKey: command.providerKey,
      items: command.items.map((item) => item.toSnapshot()),
    });
    if (observedAt !== undefined) {
      for (const item of command.items) {
        const snapshot = item.toSnapshot();
        const existing = this.itemsByDeduplicationKey.get(
          sourceItemDeduplicationKey(command, snapshot.externalId),
        );
        if (existing !== undefined) {
          assertGitHubTrendingDurableObservationCoherence({
            providerKey: command.providerKey,
            incomingObservedAt: observedAt,
            persistedObservedAt: existing.toSnapshot().ingestedAt,
          });
        }
      }
    }
    let inserted = 0;
    let contentUpdated = 0;
    let skippedDuplicates = 0;
    const savedItems: SavedSourceItemRef[] = [];

    for (const item of command.items) {
      const raw = item.toSnapshot();
      let snapshot = command.providerKey === GITHUB_TRENDING_PAGE_PROVIDER_KEY ? raw : captureNativeText(raw, command.providerKey, raw.ingestedAt);
      const key = sourceItemDeduplicationKey(command, snapshot.externalId);

      const existing = this.itemsByDeduplicationKey.get(key);
      if (existing !== undefined && existing.toSnapshot().sourceBindingId === snapshot.sourceBindingId) {
        snapshot = preserveSourceCapture(snapshot, existing.toSnapshot());
        snapshot = preserveVerifiedLegacyCapture(snapshot, existing.toSnapshot(), command.providerKey,
          command.unchangedNativeExternalIds?.includes(snapshot.externalId) ?? false);
      }
      snapshot = prepareArticleCaptureAttempt(snapshot, raw.ingestedAt);
      const providerContentHash = sourceItemProviderContentHash({
        providerKey: command.providerKey,
        snapshot,
      });
      if (existing !== undefined) {
        const existingSnapshot = existing.toSnapshot();
        const contentChanged =
          this.contentHashesByDeduplicationKey.get(key) !== providerContentHash;
        const persistedItem =
          contentChanged &&
          command.providerKey !== GITHUB_TRENDING_PAGE_PROVIDER_KEY
            ? SourceItem.rehydrate({
                ...snapshot,
                id: existingSnapshot.id,
                ingestedAt: existingSnapshot.ingestedAt,
              })
            : command.providerKey === GITHUB_TRENDING_PAGE_PROVIDER_KEY ? existing : SourceItem.rehydrate({
                ...existingSnapshot, metadata: snapshot.metadata,
              });
        if (
          contentChanged &&
          command.providerKey !== GITHUB_TRENDING_PAGE_PROVIDER_KEY
        ) {
          this.itemsByDeduplicationKey.set(key, persistedItem);
          this.contentHashesByDeduplicationKey.set(key, providerContentHash);
          contentUpdated += 1;
        } else {
          skippedDuplicates += 1;
        }
        this.itemsByDeduplicationKey.set(key, persistedItem);
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: existingSnapshot.id,
          persistedItem,
          inserted: false,
          mutationKind:
            contentChanged &&
            command.providerKey !== GITHUB_TRENDING_PAGE_PROVIDER_KEY
              ? 'content_updated'
              : 'unchanged',
        });
        continue;
      }

      this.itemsByDeduplicationKey.set(key, SourceItem.rehydrate(snapshot));
      this.contentHashesByDeduplicationKey.set(key, providerContentHash);
      inserted += 1;
      savedItems.push({
        externalId: snapshot.externalId,
        sourceItemId: snapshot.id,
        persistedItem: SourceItem.rehydrate(snapshot),
        inserted: true,
        mutationKind: 'inserted',
      });
    }

    return { inserted, contentUpdated, skippedDuplicates, items: savedItems };
  }

  async findDueArticleCaptures(command: Parameters<ArticleCaptureRepository['findDueArticleCaptures']>[0]): Promise<readonly SourceItem[]> {
    let initialized = 0;
    for (const [key, item] of this.itemsByDeduplicationKey) {
      const snapshot = item.toSnapshot();
      if (initialized >= 20) break;
      if (key !== sourceItemDeduplicationKey(command, snapshot.externalId) || snapshot.sourceBindingId !== command.sourceBindingId ||
          snapshot.metadata?.contentCapture !== undefined) continue;
      const prepared = prepareLegacyArticleCapture(snapshot, command.providerKey, command.now);
      if (prepared === snapshot) continue;
      initialized += 1;
      this.itemsByDeduplicationKey.set(key, SourceItem.rehydrate(prepared));
      this.contentHashesByDeduplicationKey.set(key, sourceItemProviderContentHash({ providerKey: command.providerKey, snapshot: prepared }));
    }
    return [...this.itemsByDeduplicationKey.entries()]
      .filter(([key, item]) => {
        const snapshot = item.toSnapshot();
        return key === sourceItemDeduplicationKey(command, snapshot.externalId) &&
          snapshot.sourceBindingId === command.sourceBindingId && articleCaptureIsDue(prepareLegacyArticleCapture(snapshot, command.providerKey, command.now), command.now);
      })
      .map(([, item]) => SourceItem.rehydrate(prepareLegacyArticleCapture(item.toSnapshot(), command.providerKey, command.now)))
      .sort((a, b) => a.toSnapshot().publishedAt.getTime() - b.toSnapshot().publishedAt.getTime() ||
        (a.toSnapshot().id < b.toSnapshot().id ? -1 : 1))
      .slice(0, Math.min(20, Math.max(1, Math.floor(command.limit))));
  }

  async reserveArticleCapture(command: Parameters<ArticleCaptureRepository['reserveArticleCapture']>[0]): Promise<SourceItem | null> {
    if (!isCurrentInMemoryScanLease(command.lease, command.now)) return null;
    const key = sourceItemDeduplicationKey(command, command.externalId);
    const item = this.itemsByDeduplicationKey.get(key);
    if (item === undefined || command.lease.tenantId !== command.tenantId || command.lease.workspaceId !== command.workspaceId) return null;
    const snapshot = prepareLegacyArticleCapture(item.toSnapshot(), command.providerKey, command.now);
    const capture = readContentCapture(snapshot);
    if (snapshot.sourceBindingId !== command.sourceBindingId || capture?.nativeRevision !== command.expectedNativeRevision ||
        capture.articleUrl !== command.expectedArticleUrl) return null;
    const reserved = reserveArticleCapture(snapshot, { now: command.now, token: command.reservationToken,
      scanJobId: command.lease.scanJobId, scanFence: command.lease.fencingToken, leaseUntil: command.lease.expiresAt });
    if (reserved === undefined) return null;
    const result = SourceItem.rehydrate(reserved);
    this.itemsByDeduplicationKey.set(key, result);
    return result;
  }

  async completeArticleCapture(command: Parameters<ArticleCaptureRepository['completeArticleCapture']>[0]): Promise<SourceItem | null> {
    if (!isCurrentInMemoryScanLease(command.lease, command.now)) return null;
    const incoming = command.item.toSnapshot();
    const key = sourceItemDeduplicationKey(command, incoming.externalId);
    const item = this.itemsByDeduplicationKey.get(key);
    if (item === undefined || command.lease.expiresAt <= command.now || command.lease.fencingToken !== command.expected.scanFence ||
        command.lease.scanJobId !== command.expected.scanJobId || command.lease.tenantId !== command.tenantId || command.lease.workspaceId !== command.workspaceId) return null;
    const current = item.toSnapshot();
    const capture = readContentCapture(incoming);
    if (current.id !== incoming.id || current.sourceBindingId !== command.sourceBindingId ||
        capture?.nativeRevision !== command.expected.nativeRevision || capture.articleUrl !== command.expected.articleUrl ||
        !articleCaptureCompletionMatches(current, command.expected, command.now)) return null;
    const merged = mergeArticleCaptureCompletion(current, incoming, command.providerKey);
    if (merged === undefined) return null;
    const result = SourceItem.rehydrate(merged);
    this.itemsByDeduplicationKey.set(key, result);
    this.contentHashesByDeduplicationKey.set(key, sourceItemProviderContentHash({ providerKey: command.providerKey, snapshot: merged }));
    return result;
  }

  all(): readonly SourceItem[] {
    return [...this.itemsByDeduplicationKey.values()];
  }
}

const sourceItemDeduplicationKey = (
  command: Pick<
    SaveSourceItemsCommand,
    'tenantId' | 'workspaceId' | 'providerKey'
  >,
  externalId: string,
): string =>
  [
    command.tenantId,
    command.workspaceId,
    command.providerKey,
    externalId,
  ].join(':');
