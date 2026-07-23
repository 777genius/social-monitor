import type { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { FeedItem } from "@social-monitor/feed/domain";
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

    let projected = 0;
    const projectedItems: ProjectedFeedItemRef[] = [];

    for (const sourceItem of command.sourceItems) {
      const snapshot = sourceItem.toSnapshot();
      assertFeedProjectionSourceItemBinding(command, snapshot);
      const bodyPreview = feedBodyPreviewForProjection({
        body: snapshot.body,
        providerMetadata: snapshot.metadata,
      });
      const providerMetadata = feedProviderMetadataForProjection({
        providerMetadata: snapshot.metadata,
        snapshots: command.snapshots,
      });
      const feedItemId = `feed:${snapshot.sourceBindingId}:${snapshot.externalId}`;

      this.feedItems.upsert(
        FeedItem.publish({
          id: feedItemId,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          interestId: command.interestId,
          sourceItemId: snapshot.id,
          sourceBindingId: command.sourceBindingId,
          providerKey: command.providerKey,
          canonicalUrl: snapshot.canonicalUrl,
          title: snapshot.title,
          bodyPreview,
          authorHandle: snapshot.authorHandle,
          publishedAt: snapshot.publishedAt,
          observedAt: snapshot.ingestedAt,
          providerMetadata,
        }),
      );
      projectedItems.push({
        sourceItemId: snapshot.id,
        sourceExternalId: snapshot.externalId,
        feedItemId,
      });
      projected += 1;
    }

    return { projected, projectedItems };
  }
}
