import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type {
  SavedSourceItemRef,
  SourceItemRepositoryPort,
  SaveSourceItemsCommand,
  SaveSourceItemsResult,
} from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { contentHashForSourceItem } from './prisma-ingestion-records';

export class PrismaSourceItemRepository implements SourceItemRepositoryPort {
  constructor(private readonly prisma: PrismaIngestionClient) {}

  async saveBatch(command: SaveSourceItemsCommand): Promise<SaveSourceItemsResult> {
    let inserted = 0;
    let skippedDuplicates = 0;
    const savedItems: SavedSourceItemRef[] = [];

    for (const item of command.items) {
      const snapshot = item.toSnapshot();
      const existing = await this.findExistingSourceItem({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        providerKey: command.providerKey,
        providerItemId: snapshot.externalId,
      });

      if (existing !== null) {
        skippedDuplicates += 1;
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: existing.id,
          inserted: false,
        });
        continue;
      }

      try {
        const created = await withPrismaWriteRetry(() => this.prisma.sourceItem.create({
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
            metadata: snapshot.metadata ?? {},
          },
        }));
        inserted += 1;
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: created.id,
          inserted: true,
        });
      } catch (error) {
        if (!isUniqueSourceItemConflict(error)) {
          throw error;
        }

        const duplicate = await this.findExistingSourceItem({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          providerKey: command.providerKey,
          providerItemId: snapshot.externalId,
        });
        if (duplicate === null) {
          throw error;
        }

        skippedDuplicates += 1;
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: duplicate.id,
          inserted: false,
        });
      }
    }

    return { inserted, skippedDuplicates, items: savedItems };
  }

  private findExistingSourceItem(query: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly providerKey: string;
    readonly providerItemId: string;
  }) {
    return this.prisma.sourceItem.findFirst({
      where: query,
    });
  }
}

const isUniqueSourceItemConflict = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { readonly code?: unknown }).code === 'P2002';
