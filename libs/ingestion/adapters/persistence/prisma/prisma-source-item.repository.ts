import { assertRedditArchiveInsert, type RedditArchiveInsertCommand } from './reddit-archive-persistence-contract';
import { PrismaArticleCaptureRepository } from './prisma-article-capture.repository';
import type { ArticleCaptureRepository } from '../../../ports/article-capture-repository';
import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import { githubTrendingSnapshotBatchObservedAt } from '../../../domain';
import type {
  SourceItemRepositoryPort,
  SaveSourceItemsCommand,
  SaveSourceItemsResult,
} from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { saveSourceItemBatchWithinTransaction } from './prisma-source-item-batch-writer';

type TransactionalPrismaIngestionClient = PrismaIngestionClient & {
  readonly $transaction?: <Result>(
    operation: (transaction: PrismaIngestionClient) => Promise<Result>,
    options: { readonly isolationLevel: "Serializable" },
  ) => Promise<Result>;
};

export class PrismaSourceItemRepository implements SourceItemRepositoryPort {
  private archiveOnly = false;
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

  /** Retained archive text is not a live provider fetch or article capture. */
  saveRedditArchiveBatchInsertOnly(command: RedditArchiveInsertCommand): Promise<SaveSourceItemsResult> {
    assertRedditArchiveInsert(command);
    const repository = new PrismaSourceItemRepository(this.prisma, 'insert-only');
    repository.archiveOnly = true;
    return repository.saveBatch(command);
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
        saveSourceItemBatchWithinTransaction({
          transaction,
          command,
          githubObservedAt,
          writeMode: this.writeMode,
          archiveOnly: this.archiveOnly,
        }),
      ),
    );
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

const isUniqueSourceItemConflict = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { readonly code?: unknown }).code === "P2002";
