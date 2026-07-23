import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import {
  assertGitHubTrendingDurableObservationCoherence,
  GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  githubTrendingSnapshotBatchObservedAt,
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
  sourceItemFromPrisma,
  type PrismaSourceItemRecord,
} from "./prisma-ingestion-records";

type TransactionalPrismaIngestionClient = PrismaIngestionClient & {
  readonly $transaction?: <Result>(
    operation: (transaction: PrismaIngestionClient) => Promise<Result>,
    options: { readonly isolationLevel: "Serializable" },
  ) => Promise<Result>;
};

export class PrismaSourceItemRepository implements SourceItemRepositoryPort {
  constructor(private readonly prisma: PrismaIngestionClient) {}

  async saveBatch(
    command: SaveSourceItemsCommand,
  ): Promise<SaveSourceItemsResult> {
    const githubObservedAt = githubTrendingSnapshotBatchObservedAt({
      providerKey: command.providerKey,
      items: command.items.map((item) => item.toSnapshot()),
    });
    const supportsTransactions = this.transaction() !== undefined;
    try {
      return await this.saveBatchAtomically(command, githubObservedAt);
    } catch (error) {
      if (!supportsTransactions || !isUniqueSourceItemConflict(error)) {
        throw error;
      }
      return this.saveBatchAtomically(command, githubObservedAt);
    }
  }

  private saveBatchAtomically(
    command: SaveSourceItemsCommand,
    githubObservedAt: Date | undefined,
  ): Promise<SaveSourceItemsResult> {
    return withPrismaWriteRetry(() =>
      this.inSerializableTransaction((transaction) =>
        this.saveBatchWithinTransaction(
          transaction,
          command,
          githubObservedAt,
        ),
      ),
    );
  }

  private async saveBatchWithinTransaction(
    transaction: PrismaIngestionClient,
    command: SaveSourceItemsCommand,
    githubObservedAt: Date | undefined,
  ): Promise<SaveSourceItemsResult> {
    let inserted = 0;
    let contentUpdated = 0;
    let skippedDuplicates = 0;
    const savedItems: SavedSourceItemRef[] = [];
    const existingByProviderItemId = await this.findExistingSourceItems(
      transaction,
      command,
    );
    if (githubObservedAt !== undefined) {
      for (const existing of existingByProviderItemId.values()) {
        assertGitHubTrendingDurableObservationCoherence({
          providerKey: command.providerKey,
          incomingObservedAt: githubObservedAt,
          persistedObservedAt: existing.observedAt,
        });
      }
    }

    for (const item of command.items) {
      const snapshot = item.toSnapshot();
      const existing = existingByProviderItemId.get(snapshot.externalId);
      const providerContentHash = sourceItemProviderContentHash({
        providerKey: command.providerKey,
        snapshot,
      });
      if (existing !== undefined) {
        const update = await this.updateExisting(transaction, {
          existing,
          snapshot,
          providerContentHash,
          immutable:
            command.providerKey === GITHUB_TRENDING_PAGE_PROVIDER_KEY,
        });
        existingByProviderItemId.set(snapshot.externalId, update.record);
        contentUpdated += update.contentChanged ? 1 : 0;
        skippedDuplicates += update.contentChanged ? 0 : 1;
        savedItems.push(
          savedItemRef(snapshot.externalId, update.record, update),
        );
        continue;
      }

      const created = await transaction.sourceItem.create({
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
      });
      inserted += 1;
      savedItems.push({
        externalId: snapshot.externalId,
        sourceItemId: created.id,
        persistedItem: sourceItemFromPrisma(created),
        inserted: true,
        mutationKind: "inserted",
      });
      existingByProviderItemId.set(snapshot.externalId, created);
    }

    return { inserted, contentUpdated, skippedDuplicates, items: savedItems };
  }

  private async updateExisting(
    transaction: PrismaIngestionClient,
    params: {
      readonly existing: PrismaSourceItemRecord;
      readonly snapshot: SourceItemProps;
      readonly providerContentHash: string;
      readonly immutable: boolean;
    },
  ): Promise<{
    readonly record: PrismaSourceItemRecord;
    readonly contentChanged: boolean;
  }> {
    const contentChanged =
      params.existing.providerContentHash === null ||
      params.existing.providerContentHash !== params.providerContentHash;
    if (params.immutable) {
      return { record: params.existing, contentChanged: false };
    }
    if (transaction.sourceItem.update === undefined) {
      throw new Error("Source item repository requires scoped update support");
    }
    const record = await transaction.sourceItem.update({
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
    });
    return { record, contentChanged };
  }

  private async findExistingSourceItems(
    transaction: PrismaIngestionClient,
    command: SaveSourceItemsCommand,
  ): Promise<Map<string, PrismaSourceItemRecord>> {
    const externalIds = [
      ...new Set(command.items.map((item) => item.toSnapshot().externalId)),
    ];
    if (externalIds.length === 0) {
      return new Map();
    }
    if (transaction.sourceItem.findMany === undefined) {
      const records = await Promise.all(
        externalIds.map((providerItemId) =>
          transaction.sourceItem.findFirst({
            where: {
              tenantId: command.tenantId,
              workspaceId: command.workspaceId,
              providerKey: command.providerKey,
              providerItemId,
            },
          }),
        ),
      );
      return new Map(
        records.flatMap((record) =>
          record === null ? [] : [[record.providerItemId, record] as const],
        ),
      );
    }
    const records = await transaction.sourceItem.findMany({
      where: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        providerKey: command.providerKey,
        providerItemId: { in: externalIds },
      },
    });
    return new Map(records.map((record) => [record.providerItemId, record]));
  }

  private transaction():
    | TransactionalPrismaIngestionClient["$transaction"]
    | undefined {
    return (this.prisma as TransactionalPrismaIngestionClient).$transaction;
  }

  private inSerializableTransaction<Result>(
    operation: (transaction: PrismaIngestionClient) => Promise<Result>,
  ): Promise<Result> {
    const transaction = this.transaction();
    return transaction === undefined
      ? operation(this.prisma)
      : (transaction.call(this.prisma, operation, {
          isolationLevel: "Serializable",
        }) as Promise<Result>);
  }
}

const savedItemRef = (
  externalId: string,
  record: PrismaSourceItemRecord,
  update: { readonly contentChanged: boolean },
): SavedSourceItemRef => ({
  externalId,
  sourceItemId: record.id,
  persistedItem: sourceItemFromPrisma(record),
  inserted: false,
  mutationKind: update.contentChanged ? "content_updated" : "unchanged",
});

const isUniqueSourceItemConflict = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { readonly code?: unknown }).code === "P2002";
