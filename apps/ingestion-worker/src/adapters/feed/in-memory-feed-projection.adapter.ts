import type { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { feedDedupeKeyForItem } from "@social-monitor/feed/adapters/persistence/feed-dedupe-key";
import { FeedItem } from "@social-monitor/feed/domain";
import {
  assertGitHubTrendingDurableObservationCoherence,
  assertGitHubTrendingSnapshotBatchIntegrity,
} from "@social-monitor/ingestion/domain";
import type {
  FeedProjectionPort,
  ProjectFeedItemsCommand,
  ProjectFeedItemsResult,
  ProjectedFeedItemRef,
} from "@social-monitor/ingestion/ports";
import {
  assertFeedProjectionCommandIntegrity,
  assertFeedProjectionSourceItemBinding,
  feedBodyPreviewForProjection,
  feedProviderMetadataForProjection,
} from "@social-monitor/feed/adapters/persistence/feed-projection-content";

export class InMemoryFeedProjectionAdapter implements FeedProjectionPort {
  constructor(private readonly feedItems: InMemoryFeedItemReadRepository) {}

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
        feedItemId: `feed:${snapshot.sourceBindingId}:${snapshot.externalId}`,
      };
    });
    const existingItems = this.feedItems.all();
    for (const plan of plans) {
      const existing = existingItems.find((item) => {
        const snapshot = item.toSnapshot();
        return (
          snapshot.tenantId === command.tenantId &&
          snapshot.workspaceId === command.workspaceId &&
          snapshot.interestId === command.interestId &&
          feedDedupeKeyForItem({
            canonicalUrl: snapshot.canonicalUrl,
            sourceBindingId: snapshot.sourceBindingId,
            providerMetadata: snapshot.providerMetadata,
          }) === plan.dedupeKey
        );
      });
      if (existing !== undefined) {
        assertGitHubTrendingDurableObservationCoherence({
          providerKey: command.providerKey,
          incomingObservedAt: plan.snapshot.ingestedAt,
          persistedObservedAt: existing.toSnapshot().observedAt,
        });
      }
    }

    let projected = 0;
    const projectedItems: ProjectedFeedItemRef[] = [];

    for (const plan of plans) {
      this.feedItems.upsert(
        FeedItem.publish({
          id: plan.feedItemId,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          interestId: command.interestId,
          sourceItemId: plan.snapshot.id,
          sourceBindingId: plan.snapshot.sourceBindingId,
          providerKey: command.providerKey,
          canonicalUrl: plan.snapshot.canonicalUrl,
          title: plan.snapshot.title,
          bodyPreview: plan.bodyPreview,
          authorHandle: plan.snapshot.authorHandle,
          publishedAt: plan.snapshot.publishedAt,
          observedAt: plan.snapshot.ingestedAt,
          providerMetadata: plan.providerMetadata,
        }),
      );
      projectedItems.push({
        sourceItemId: plan.snapshot.id,
        sourceExternalId: plan.snapshot.externalId,
        feedItemId: plan.feedItemId,
      });
      projected += 1;
    }

    return { projected, projectedItems };
  }
}
