import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import type { IdGenerator } from "@social-monitor/shared-kernel";
import type {
  FeedProjectionPort,
  ProjectFeedItemsCommand,
  ProjectFeedItemsResult,
  ProjectedFeedItemRef,
} from "@social-monitor/ingestion/ports";

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

export class PrismaFeedProjectionAdapter implements FeedProjectionPort {
  constructor(
    private readonly prisma: PrismaFeedClient,
    private readonly ids: IdGenerator,
  ) {}

  async project(
    command: ProjectFeedItemsCommand,
  ): Promise<ProjectFeedItemsResult> {
    assertFeedProjectionCommandIntegrity(command);

    let projected = 0;
    const projectedItems: ProjectedFeedItemRef[] = [];

    for (const sourceItem of command.sourceItems) {
      const snapshot = sourceItem.toSnapshot();
      assertFeedProjectionSourceItemBinding(command, snapshot);
      const dedupeKey = feedDedupeKeyForItem({
        canonicalUrl: snapshot.canonicalUrl,
        sourceBindingId: snapshot.sourceBindingId,
        providerMetadata: snapshot.metadata,
      });
      const bodyPreview = feedBodyPreviewForProjection({
        body: snapshot.body,
        providerMetadata: snapshot.metadata,
      });
      const providerMetadata = feedProviderMetadataForProjection({
        providerMetadata: snapshot.metadata,
        snapshots: command.snapshots,
      });
      const feedItemId = this.ids.generate();

      await withPrismaWriteRetry(async () => {
        const existingFeedItem = await this.prisma.feedItem.findFirst({
          where: {
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            interestId: command.interestId,
            sourceItemId: snapshot.id,
            status: "VISIBLE",
          },
        });
        const update = {
          sourceItemId: snapshot.id,
          sourceBindingId: command.sourceBindingId,
          providerKey: command.providerKey,
          dedupeKey,
          canonicalUrl: snapshot.canonicalUrl,
          title: snapshot.title,
          bodyPreview,
          authorHandle: snapshot.authorHandle ?? null,
          publishedAt: snapshot.publishedAt,
          observedAt: snapshot.ingestedAt,
          providerMetadata,
        };
        const feedItem = existingFeedItem !== null && this.prisma.feedItem.update !== undefined
          ? await this.prisma.feedItem.update({
              where: { id: existingFeedItem.id },
              data: update,
            })
          : await this.prisma.feedItem.upsert({
          where: {
            tenantId_interestId_dedupeKey: {
              tenantId: command.tenantId,
              interestId: command.interestId,
              dedupeKey,
            },
          },
          update,
          create: {
            id: feedItemId,
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            interestId: command.interestId,
            sourceItemId: snapshot.id,
            sourceBindingId: command.sourceBindingId,
            providerKey: command.providerKey,
            dedupeKey,
            canonicalUrl: snapshot.canonicalUrl,
            title: snapshot.title,
            bodyPreview,
            authorHandle: snapshot.authorHandle ?? null,
            publishedAt: snapshot.publishedAt,
            observedAt: snapshot.ingestedAt,
            providerMetadata,
            status: "VISIBLE",
          },
        });
        const signalSample = feedSignalBaselineSampleFromItem(
          feedItemFromPrisma(feedItem),
        );

        if (signalSample === undefined) {
          await this.prisma.feedSignalBaselineSample.deleteMany({
            where: {
              tenantId: command.tenantId,
              workspaceId: command.workspaceId,
              feedItemId: feedItem.id,
            },
          });
        } else {
          await this.prisma.feedSignalBaselineSample.upsert({
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
              observedAt: signalSample.observedAt,
            },
            create: {
              id: this.ids.generate(),
              tenantId: command.tenantId,
              workspaceId: command.workspaceId,
              interestId: command.interestId,
              feedItemId: feedItem.id,
              providerKey: signalSample.providerKey,
              sourceKey: signalSample.sourceKey,
              contentType: signalSample.contentType,
              strength: signalSample.strength,
              publishedAt: signalSample.publishedAt,
              observedAt: signalSample.observedAt,
            },
          });
        }
        projectedItems.push({
          sourceItemId: snapshot.id,
          sourceExternalId: snapshot.externalId,
          feedItemId: feedItem.id,
        });
      });
      projected += 1;
    }

    return { projected, projectedItems };
  }
}
