import { sourceItemProviderContentHash, type SourceItem } from '../../domain';
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
    let inserted = 0;
    let contentUpdated = 0;
    let skippedDuplicates = 0;
    const savedItems: SavedSourceItemRef[] = [];

    for (const item of command.items) {
      const snapshot = item.toSnapshot();
      const key = [
        command.tenantId,
        command.workspaceId,
        command.providerKey,
        snapshot.externalId,
      ].join(':');

      const existing = this.itemsByDeduplicationKey.get(key);
      const providerContentHash = sourceItemProviderContentHash({
        providerKey: command.providerKey,
        snapshot,
      });
      if (existing !== undefined) {
        const contentChanged =
          this.contentHashesByDeduplicationKey.get(key) !== providerContentHash;
        if (contentChanged) {
          this.itemsByDeduplicationKey.set(key, item);
          this.contentHashesByDeduplicationKey.set(key, providerContentHash);
          contentUpdated += 1;
        } else {
          skippedDuplicates += 1;
        }
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: existing.toSnapshot().id,
          inserted: false,
          mutationKind: contentChanged ? 'content_updated' : 'unchanged',
        });
        continue;
      }

      this.itemsByDeduplicationKey.set(key, item);
      this.contentHashesByDeduplicationKey.set(key, providerContentHash);
      inserted += 1;
      savedItems.push({
        externalId: snapshot.externalId,
        sourceItemId: snapshot.id,
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
