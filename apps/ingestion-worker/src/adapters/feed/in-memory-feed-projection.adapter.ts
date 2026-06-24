import type { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FeedItem } from '@social-monitor/feed/domain';
import type {
  FeedProjectionPort,
  ProjectFeedItemsCommand,
  ProjectFeedItemsResult,
} from '@social-monitor/ingestion/ports';
import { feedBodyPreviewForProjection } from '@social-monitor/feed/adapters/persistence/feed-projection-content';

export class InMemoryFeedProjectionAdapter implements FeedProjectionPort {
  constructor(private readonly feedItems: InMemoryFeedItemReadRepository) {}

  async project(command: ProjectFeedItemsCommand): Promise<ProjectFeedItemsResult> {
    let projected = 0;

    for (const sourceItem of command.sourceItems) {
      const snapshot = sourceItem.toSnapshot();
      const bodyPreview = feedBodyPreviewForProjection({
        body: snapshot.body,
        providerMetadata: snapshot.metadata,
      });

      this.feedItems.upsert(
        FeedItem.publish({
          id: `feed:${snapshot.sourceBindingId}:${snapshot.externalId}`,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          topicId: command.topicId,
          sourceItemId: `${snapshot.sourceBindingId}:${snapshot.externalId}`,
          sourceBindingId: command.sourceBindingId,
          providerKey: command.providerKey,
          canonicalUrl: snapshot.canonicalUrl,
          title: snapshot.title,
          bodyPreview,
          authorHandle: snapshot.authorHandle,
          publishedAt: snapshot.publishedAt,
          observedAt: snapshot.ingestedAt,
          providerMetadata: snapshot.metadata,
        }),
      );
      projected += 1;
    }

    return { projected };
  }
}
