import type { SourceItem } from '../../domain';
import type {
  SavedSourceItemRef,
  SaveSourceItemsCommand,
  SaveSourceItemsResult,
  SourceItemRepositoryPort,
} from '../../ports';

export class InMemorySourceItemRepository implements SourceItemRepositoryPort {
  private readonly itemsByDeduplicationKey = new Map<string, SourceItem>();

  async saveBatch(command: SaveSourceItemsCommand): Promise<SaveSourceItemsResult> {
    let inserted = 0;
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
      if (existing !== undefined) {
        skippedDuplicates += 1;
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: existing.toSnapshot().id,
          inserted: false,
        });
        continue;
      }

      this.itemsByDeduplicationKey.set(key, item);
      inserted += 1;
      savedItems.push({
        externalId: snapshot.externalId,
        sourceItemId: snapshot.id,
        inserted: true,
      });
    }

    return { inserted, skippedDuplicates, items: savedItems };
  }

  all(): readonly SourceItem[] {
    return [...this.itemsByDeduplicationKey.values()];
  }
}
