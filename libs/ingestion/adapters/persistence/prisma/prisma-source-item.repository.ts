import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import {
  sourceItemProviderContentHash,
  type SourceItemProps,
} from "../../../domain";
import type {
  SavedSourceItemRef,
  SourceItemRepositoryPort,
  SaveSourceItemsCommand,
  SaveSourceItemsResult,
} from "../../../ports";
import type { PrismaIngestionClient } from "./prisma-ingestion-client";
import {
  contentHashForSourceItem,
} from "./prisma-ingestion-records";
import type { PrismaSourceItemRecord } from "./prisma-ingestion-records";

export class PrismaSourceItemRepository implements SourceItemRepositoryPort {
  constructor(private readonly prisma: PrismaIngestionClient) {}

  async saveBatch(
    command: SaveSourceItemsCommand,
  ): Promise<SaveSourceItemsResult> {
    let inserted = 0;
    let contentUpdated = 0;
    let skippedDuplicates = 0;
    const savedItems: SavedSourceItemRef[] = [];
    const existingByProviderItemId =
      await this.findExistingSourceItems(command);

    for (const item of command.items) {
      const snapshot = item.toSnapshot();
      const existing = existingByProviderItemId.get(snapshot.externalId);
      const providerContentHash = sourceItemProviderContentHash({
        providerKey: command.providerKey,
        snapshot,
      });

      if (existing !== undefined) {
        const update = await this.updateExisting({
          existing,
          snapshot,
          providerContentHash,
        });
        existingByProviderItemId.set(snapshot.externalId, update.record);
        if (update.contentChanged) {
          contentUpdated += 1;
        } else {
          skippedDuplicates += 1;
        }
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: existing.id,
          inserted: false,
          mutationKind: update.contentChanged
            ? "content_updated"
            : "unchanged",
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
              providerContentHash,
              observedAt: snapshot.ingestedAt,
              lastObservedAt: snapshot.ingestedAt,
              contentUpdatedAt: snapshot.ingestedAt,
              metadata: snapshot.metadata ?? {},
            },
          }),
        );
        inserted += 1;
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: created.id,
          inserted: true,
          mutationKind: "inserted",
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

        const update = await this.updateExisting({
          existing: duplicate,
          snapshot,
          providerContentHash,
        });
        if (update.contentChanged) {
          contentUpdated += 1;
        } else {
          skippedDuplicates += 1;
        }
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: duplicate.id,
          inserted: false,
          mutationKind: update.contentChanged
            ? "content_updated"
            : "unchanged",
        });
        existingByProviderItemId.set(snapshot.externalId, update.record);
      }
    }

    return { inserted, contentUpdated, skippedDuplicates, items: savedItems };
  }

  private async updateExisting(params: {
    readonly existing: PrismaSourceItemRecord;
    readonly snapshot: SourceItemProps;
    readonly providerContentHash: string;
  }): Promise<{
    readonly record: PrismaSourceItemRecord;
    readonly contentChanged: boolean;
  }> {
    const updateSourceItem = this.prisma.sourceItem.update;
    if (updateSourceItem === undefined) {
      throw new Error("Source item repository requires scoped update support");
    }
    const contentChanged =
      params.existing.providerContentHash === null ||
      params.existing.providerContentHash !== params.providerContentHash;
    const record = await withPrismaWriteRetry(() =>
      updateSourceItem({
        where: { id: params.existing.id },
        data: contentChanged
          ? {
              sourceBindingId: params.snapshot.sourceBindingId,
              canonicalUrl: params.snapshot.canonicalUrl,
              title: params.snapshot.title,
              body: params.snapshot.body,
              authorHandle: params.snapshot.authorHandle ?? null,
              publishedAt: params.snapshot.publishedAt,
              contentHash: contentHashForSourceItem(params.snapshot),
              providerContentHash: params.providerContentHash,
              lastObservedAt: params.snapshot.ingestedAt,
              contentUpdatedAt: params.snapshot.ingestedAt,
              metadata: params.snapshot.metadata ?? {},
            }
          : {
              providerContentHash: params.providerContentHash,
              lastObservedAt: params.snapshot.ingestedAt,
            },
      }),
    );
    return { record, contentChanged };
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
