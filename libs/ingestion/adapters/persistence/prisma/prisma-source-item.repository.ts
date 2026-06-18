import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
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

      try {
        await withPrismaWriteRetry(() => this.prisma.sourceItem.create({
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
        }));
        inserted += 1;
      } catch (error) {
        if (!isUniqueSourceItemConflict(error)) {
          throw error;
        }

        skippedDuplicates += 1;
      }
    }

    return { inserted, skippedDuplicates };
  }
}

const isUniqueSourceItemConflict = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { readonly code?: unknown }).code === 'P2002';
