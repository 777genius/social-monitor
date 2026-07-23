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
      const snapshot = item.toSnapshot();
      const key = sourceItemDeduplicationKey(command, snapshot.externalId);

      const existing = this.itemsByDeduplicationKey.get(key);
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
            : existing;
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

      this.itemsByDeduplicationKey.set(key, item);
      this.contentHashesByDeduplicationKey.set(key, providerContentHash);
      inserted += 1;
      savedItems.push({
        externalId: snapshot.externalId,
        sourceItemId: snapshot.id,
        persistedItem: item,
        inserted: true,
        mutationKind: 'inserted',
      });
    }

    return { inserted, contentUpdated, skippedDuplicates, items: savedItems };
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
