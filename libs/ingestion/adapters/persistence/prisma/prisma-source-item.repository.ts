import type { SourceItemRepositoryPort, SaveSourceItemsCommand, SaveSourceItemsResult } from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { contentHashForSourceItem } from './prisma-ingestion-records';

export class PrismaSourceItemRepository implements SourceItemRepositoryPort {
  constructor(private readonly prisma: PrismaIngestionClient) {}

  async saveBatch(command: SaveSourceItemsCommand): Promise<SaveSourceItemsResult> {
    let inserted = 0;
    let skippedDuplicates = 0;

    for (const item of command.items) {
      const snapshot = item.toSnapshot();
      const existing = await this.prisma.sourceItem.findFirst({
        where: {
          tenantId: command.tenantId,
          providerKey: command.providerKey,
          providerItemId: snapshot.externalId,
        },
      });

      if (existing !== null) {
        skippedDuplicates += 1;
        continue;
      }

      await this.prisma.sourceItem.create({
        data: {
          id: snapshot.id,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          sourceBindingId: snapshot.sourceBindingId,
          providerKey: command.providerKey,
          providerItemId: snapshot.externalId,
          canonicalUrl: snapshot.canonicalUrl,
          title: snapshot.title,
          body: snapshot.body,
          authorHandle: snapshot.authorHandle ?? null,
          publishedAt: snapshot.publishedAt,
          contentHash: contentHashForSourceItem(snapshot),
          observedAt: snapshot.ingestedAt,
          metadata: {},
        },
      });
      inserted += 1;
    }

    return { inserted, skippedDuplicates };
  }
}
