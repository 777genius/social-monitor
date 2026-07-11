import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import type {
  SavedSourceItemRef,
  SourceItemRepositoryPort,
  SaveSourceItemsCommand,
  SaveSourceItemsResult,
} from "../../../ports";
import type { PrismaIngestionClient } from "./prisma-ingestion-client";
import { contentHashForSourceItem } from "./prisma-ingestion-records";
import type { PrismaSourceItemRecord } from "./prisma-ingestion-records";

export class PrismaSourceItemRepository implements SourceItemRepositoryPort {
  constructor(private readonly prisma: PrismaIngestionClient) {}

  async saveBatch(
    command: SaveSourceItemsCommand,
  ): Promise<SaveSourceItemsResult> {
    let inserted = 0;
    let skippedDuplicates = 0;
    const savedItems: SavedSourceItemRef[] = [];
    const existingByProviderItemId =
      await this.findExistingSourceItems(command);

    for (const item of command.items) {
      const snapshot = item.toSnapshot();
      const existing = existingByProviderItemId.get(snapshot.externalId);

      if (existing !== undefined) {
        skippedDuplicates += 1;
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: existing.id,
          inserted: false,
        });
        continue;
      }

      try {
        const created = await withPrismaWriteRetry(() =>
          this.prisma.sourceItem.create({
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
          }),
        );
        inserted += 1;
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: created.id,
          inserted: true,
        });
        existingByProviderItemId.set(snapshot.externalId, created);
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
        existingByProviderItemId.set(snapshot.externalId, duplicate);
      }
    }

    return { inserted, skippedDuplicates, items: savedItems };
  }

  private async findExistingSourceItems(
    command: SaveSourceItemsCommand,
  ): Promise<Map<string, PrismaSourceItemRecord>> {
    const externalIds = [
      ...new Set(command.items.map((item) => item.toSnapshot().externalId)),
    ];
    if (externalIds.length === 0) {
      return new Map();
    }
    if (this.prisma.sourceItem.findMany === undefined) {
      const records = await Promise.all(
        externalIds.map((providerItemId) =>
          this.findExistingSourceItem({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            providerKey: command.providerKey,
            providerItemId,
          }),
        ),
      );

      return new Map(
        records.flatMap((record) =>
          record === null ? [] : [[record.providerItemId, record] as const],
        ),
      );
    }
    const records = await this.prisma.sourceItem.findMany({
      where: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        providerKey: command.providerKey,
        providerItemId: { in: externalIds },
      },
    });

    return new Map(records.map((record) => [record.providerItemId, record]));
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
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { readonly code?: unknown }).code === "P2002";
