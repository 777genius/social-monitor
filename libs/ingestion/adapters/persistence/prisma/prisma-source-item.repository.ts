import { preserveVerifiedLegacyCapture } from '../../../domain/value-objects/legacy-source-capture';
import { PrismaArticleCaptureRepository } from './prisma-article-capture.repository';
import type { ArticleCaptureRepository } from '../../../ports/article-capture-repository';
import { prepareArticleCaptureAttempt } from '../../../domain/value-objects/article-capture-attempt';
import { captureNativeText, preserveNativeCaptureAvailability, preserveSourceCapture } from '../../../domain/value-objects/source-content-capture';
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
  private readonly articleCaptures: PrismaArticleCaptureRepository;
  constructor(
    private readonly prisma: PrismaIngestionClient,
    private readonly writeMode: "update-existing" | "insert-only" = "update-existing",
  ) {
    this.articleCaptures = new PrismaArticleCaptureRepository(prisma);
  }

  findDueArticleCaptures(command: Parameters<ArticleCaptureRepository['findDueArticleCaptures']>[0]) {
    return this.articleCaptures.findDueArticleCaptures(command);
  }
  reserveArticleCapture(command: Parameters<ArticleCaptureRepository['reserveArticleCapture']>[0]) {
    return this.articleCaptures.reserveArticleCapture(command);
  }
  completeArticleCapture(command: Parameters<ArticleCaptureRepository['completeArticleCapture']>[0]) {
    return this.articleCaptures.completeArticleCapture(command);
  }

  /** Historical imports must call this explicit entrypoint, never ordinary saveBatch. */
  saveBatchInsertOnly(command: SaveSourceItemsCommand): Promise<SaveSourceItemsResult> {
    return new PrismaSourceItemRepository(this.prisma, "insert-only").saveBatch(command);
  }

  async saveBatch(
    command: SaveSourceItemsCommand,
  ): Promise<SaveSourceItemsResult> {
    if (this.writeMode === "insert-only") {
      if (this.transaction() === undefined) {
        throw new Error("Insert-only source item writes require a Serializable transaction");
      }
      const externalIds = command.items.map((item) => item.toSnapshot().externalId);
      if (new Set(externalIds).size !== externalIds.length) {
        throw new Error("Insert-only source item batch contains a duplicate ID");
      }
    }
    const githubObservedAt = githubTrendingSnapshotBatchObservedAt({
      providerKey: command.providerKey,
      items: command.items.map((item) => item.toSnapshot()),
    });
    const supportsTransactions = this.transaction() !== undefined;
    try {
      return await this.saveBatchAtomically(command, githubObservedAt);
    } catch (error) {
      if (this.writeMode === "insert-only" || !supportsTransactions || !isUniqueSourceItemConflict(error)) {
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
    if (this.writeMode === "insert-only" && existingByProviderItemId.size > 0) {
      throw new Error("Insert-only source item batch conflicts with an existing ID");
    }
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
      const raw = item.toSnapshot();
      let snapshot = command.providerKey === GITHUB_TRENDING_PAGE_PROVIDER_KEY ? raw : captureNativeText(raw, command.providerKey, raw.ingestedAt);
      const existing = existingByProviderItemId.get(snapshot.externalId);
      if (existing !== undefined && existing.sourceBindingId === snapshot.sourceBindingId) {
        snapshot = preserveSourceCapture(snapshot, sourceItemFromPrisma(existing).toSnapshot());
        snapshot = preserveVerifiedLegacyCapture(snapshot, sourceItemFromPrisma(existing).toSnapshot(), command.providerKey,
          command.unchangedNativeExternalIds?.includes(snapshot.externalId) ?? false);
      }
      snapshot = prepareArticleCaptureAttempt(snapshot, raw.ingestedAt);
      const providerContentHash = sourceItemProviderContentHash({
        providerKey: command.providerKey,
        snapshot,
      });
      if (existing !== undefined) {
        if (this.writeMode === "insert-only") {
          throw new Error("Insert-only source item batch conflicts with an existing ID");
        }
        const update = await this.updateExisting(transaction, {
          existing,
          snapshot,
          providerContentHash,
          providerKey: command.providerKey,
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
      readonly providerKey: string;
      readonly immutable: boolean;
    },
  ): Promise<{
    readonly record: PrismaSourceItemRecord;
    readonly contentChanged: boolean;
  }> {
    const contentChanged =
      params.existing.providerContentHash === null ||
      params.existing.providerContentHash !== params.providerContentHash;
    // The provider fingerprint includes binding provenance. A shared item
    // observed through another binding still needs that provenance persisted,
    // but must retain its existing assessment revision and cutoff clock when
    // every other fingerprint input is unchanged. This also preserves legacy
    // binding-inclusive content hashes until a real content revision occurs.
    const bindingOnlyChange = contentChanged &&
      params.existing.sourceBindingId !== params.snapshot.sourceBindingId &&
      sourceItemProviderContentHash({
        providerKey: params.providerKey,
        snapshot: sourceItemFromPrisma(params.existing).toSnapshot(),
      }) === sourceItemProviderContentHash({
        providerKey: params.providerKey,
        snapshot: { ...params.snapshot, sourceBindingId: params.existing.sourceBindingId },
      });
    const snapshot = bindingOnlyChange
      ? preserveNativeCaptureAvailability(params.snapshot, sourceItemFromPrisma(params.existing).toSnapshot())
      : params.snapshot;
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
            contentHash: bindingOnlyChange ? params.existing.contentHash : contentHashForSourceItem(params.snapshot),
            providerContentHash: params.providerContentHash,
            lastObservedAt: params.snapshot.ingestedAt,
            ...(bindingOnlyChange ? {} : { contentUpdatedAt: params.snapshot.ingestedAt }),
            metadata: snapshot.metadata ?? {},
          }
        : {
            providerContentHash: params.providerContentHash,
            lastObservedAt: params.snapshot.ingestedAt,
            metadata: params.snapshot.metadata ?? {},
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
    if (transaction === undefined && this.writeMode === "insert-only") {
      throw new Error("Insert-only source item writes require a Serializable transaction");
    }
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
