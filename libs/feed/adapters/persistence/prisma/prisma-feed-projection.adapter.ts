import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import type { IdGenerator } from "@social-monitor/shared-kernel";
import type {
  FeedProjectionPort,
  ProjectFeedItemsCommand,
  ProjectFeedItemsResult,
  ProjectedFeedItemRef,
} from "@social-monitor/ingestion/ports";
import {
  assertGitHubTrendingDurableObservationCoherence,
  assertGitHubTrendingSnapshotBatchIntegrity,
} from "@social-monitor/ingestion/domain";

import type { PrismaFeedClient } from "./prisma-feed-client";
import { feedItemFromPrisma } from "./prisma-feed-records";
import { feedSignalBaselineSampleFromItem } from "../../../domain";
import { feedDedupeKeyForItem } from "../feed-dedupe-key";
import {
  assertFeedProjectionCommandIntegrity,
  assertFeedProjectionSourceItemBinding,
  feedBodyPreviewForProjection,
  feedProviderMetadataForProjection,
} from "../feed-projection-content";

type TransactionalPrismaFeedClient = PrismaFeedClient & {
  readonly $transaction?: <Result>(
    operation: (transaction: PrismaFeedClient) => Promise<Result>,
    options: { readonly isolationLevel: "Serializable" },
  ) => Promise<Result>;
};

export class PrismaFeedProjectionAdapter implements FeedProjectionPort {
  constructor(
    private readonly prisma: PrismaFeedClient,
    private readonly ids: IdGenerator,
  ) {}

  async project(
    command: ProjectFeedItemsCommand,
  ): Promise<ProjectFeedItemsResult> {
    assertFeedProjectionCommandIntegrity(command);
    assertGitHubTrendingSnapshotBatchIntegrity({
      providerKey: command.providerKey,
      items: command.sourceItems.map((item) => item.toSnapshot()),
    });
    const plans = command.sourceItems.map((sourceItem) => {
      const snapshot = sourceItem.toSnapshot();
      assertFeedProjectionSourceItemBinding(command, snapshot);
      return {
        snapshot,
        dedupeKey: feedDedupeKeyForItem({
          canonicalUrl: snapshot.canonicalUrl,
          sourceBindingId: snapshot.sourceBindingId,
          providerMetadata: snapshot.metadata,
        }),
        bodyPreview: feedBodyPreviewForProjection({
          body: snapshot.body,
          providerMetadata: snapshot.metadata,
        }),
        providerMetadata: feedProviderMetadataForProjection({
          providerMetadata: snapshot.metadata,
          snapshots: command.snapshots,
        }),
        feedItemId: this.ids.generate(),
        baselineId: undefined as string | undefined,
      };
    });
    const execute = () =>
      withPrismaWriteRetry(() =>
        this.inSerializableTransaction(async (transaction) => {
          const projectedItems: ProjectedFeedItemRef[] = [];
          for (const plan of plans) {
            const update = {
              sourceItemId: plan.snapshot.id,
              sourceBindingId: command.sourceBindingId,
              providerKey: command.providerKey,
              dedupeKey: plan.dedupeKey,
              canonicalUrl: plan.snapshot.canonicalUrl,
              title: plan.snapshot.title,
              bodyPreview: plan.bodyPreview,
              authorHandle: plan.snapshot.authorHandle ?? null,
              publishedAt: plan.snapshot.publishedAt,
              providerMetadata: plan.providerMetadata,
            };
            const existingFeedItem = await transaction.feedItem.findFirst({
              where: {
                tenantId: command.tenantId,
                workspaceId: command.workspaceId,
                interestId: command.interestId,
                sourceItemId: plan.snapshot.id,
                status: "VISIBLE",
              },
            });
            const feedItem =
              existingFeedItem !== null &&
              transaction.feedItem.update !== undefined
                ? await transaction.feedItem.update({
                    where: { id: existingFeedItem.id },
                    data: update,
                  })
                : await transaction.feedItem.upsert({
                    where: {
                      tenantId_interestId_dedupeKey: {
                        tenantId: command.tenantId,
                        interestId: command.interestId,
                        dedupeKey: plan.dedupeKey,
                      },
                    },
                    update,
                    create: {
                      id: plan.feedItemId,
                      tenantId: command.tenantId,
                      workspaceId: command.workspaceId,
                      interestId: command.interestId,
                      ...update,
                      observedAt: plan.snapshot.ingestedAt,
                      status: "VISIBLE",
                    },
                  });
            assertGitHubTrendingDurableObservationCoherence({
              providerKey: command.providerKey,
              incomingObservedAt: plan.snapshot.ingestedAt,
              persistedObservedAt: feedItem.observedAt,
            });
            const signalSample = feedSignalBaselineSampleFromItem(
              feedItemFromPrisma(feedItem),
            );
            if (signalSample === undefined) {
              await transaction.feedSignalBaselineSample.deleteMany({
                where: {
                  tenantId: command.tenantId,
                  workspaceId: command.workspaceId,
                  feedItemId: feedItem.id,
                },
              });
            } else {
              await transaction.feedSignalBaselineSample.upsert({
                where: {
                  tenantId_workspaceId_feedItemId: {
                    tenantId: command.tenantId,
                    workspaceId: command.workspaceId,
                    feedItemId: feedItem.id,
                  },
                },
                update: {
                  interestId: command.interestId,
                  providerKey: signalSample.providerKey,
                  sourceKey: signalSample.sourceKey,
                  contentType: signalSample.contentType,
                  strength: signalSample.strength,
                  publishedAt: signalSample.publishedAt,
                  observedAt: plan.snapshot.ingestedAt,
                },
                create: {
                  id:
                    plan.baselineId ??
                    (plan.baselineId = this.ids.generate()),
                  tenantId: command.tenantId,
                  workspaceId: command.workspaceId,
                  interestId: command.interestId,
                  feedItemId: feedItem.id,
                  providerKey: signalSample.providerKey,
                  sourceKey: signalSample.sourceKey,
                  contentType: signalSample.contentType,
                  strength: signalSample.strength,
                  publishedAt: signalSample.publishedAt,
                  observedAt: plan.snapshot.ingestedAt,
                },
              });
            }
            projectedItems.push({
              sourceItemId: plan.snapshot.id,
              sourceExternalId: plan.snapshot.externalId,
              feedItemId: feedItem.id,
            });
          }
          return {
            projected: projectedItems.length,
            projectedItems,
          };
        }),
      );

    const supportsTransactions = this.transaction() !== undefined;
    try {
      return await execute();
    } catch (error) {
      if (!supportsTransactions || !isUniqueConflict(error)) {
        throw error;
      }
      return execute();
    }
  }

  private transaction():
    | TransactionalPrismaFeedClient["$transaction"]
    | undefined {
    return (this.prisma as TransactionalPrismaFeedClient).$transaction;
  }

  private inSerializableTransaction<Result>(
    operation: (transaction: PrismaFeedClient) => Promise<Result>,
  ): Promise<Result> {
    const transaction = this.transaction();
    return transaction === undefined
      ? operation(this.prisma)
      : (transaction.call(this.prisma, operation, {
          isolationLevel: "Serializable",
        }) as Promise<Result>);
  }
}

const isUniqueConflict = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { readonly code?: unknown }).code === "P2002";
