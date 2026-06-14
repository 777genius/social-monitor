import type { SourceItem } from '../../domain';
import type { SaveSourceItemsCommand, SaveSourceItemsResult, SourceItemRepositoryPort } from '../../ports';

export class InMemorySourceItemRepository implements SourceItemRepositoryPort {
  private readonly itemsByDeduplicationKey = new Map<string, SourceItem>();

  async saveBatch(command: SaveSourceItemsCommand): Promise<SaveSourceItemsResult> {
    let inserted = 0;
    let skippedDuplicates = 0;

    for (const item of command.items) {
      const snapshot = item.toSnapshot();
      const key = [
        command.tenantId,
        command.workspaceId,
        command.providerKey,
        snapshot.externalId,
      ].join(':');

      if (this.itemsByDeduplicationKey.has(key)) {
        skippedDuplicates += 1;
        continue;
      }

      this.itemsByDeduplicationKey.set(key, item);
      inserted += 1;
    }

    return { inserted, skippedDuplicates };
  }

  all(): readonly SourceItem[] {
    return [...this.itemsByDeduplicationKey.values()];
  }
}
