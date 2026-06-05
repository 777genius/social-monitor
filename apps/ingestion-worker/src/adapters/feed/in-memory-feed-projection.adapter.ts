import type { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FeedItem } from '@social-monitor/feed/domain';
import type {
  FeedProjectionPort,
  ProjectFeedItemsCommand,
  ProjectFeedItemsResult,
} from '@social-monitor/ingestion/ports';

export class InMemoryFeedProjectionAdapter implements FeedProjectionPort {
  constructor(private readonly feedItems: InMemoryFeedItemReadRepository) {}

  async project(command: ProjectFeedItemsCommand): Promise<ProjectFeedItemsResult> {
    let projected = 0;

    for (const sourceItem of command.sourceItems) {
      const snapshot = sourceItem.toSnapshot();

      this.feedItems.upsert(
        FeedItem.publish({
          id: `feed:${snapshot.sourceBindingId}:${snapshot.externalId}`,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          sourceItemId: `${snapshot.sourceBindingId}:${snapshot.externalId}`,
          sourceBindingId: command.sourceBindingId,
          canonicalUrl: snapshot.canonicalUrl,
          title: snapshot.title,
          bodyPreview: snapshot.body.slice(0, 280),
          authorHandle: snapshot.authorHandle,
          publishedAt: snapshot.publishedAt,
          observedAt: snapshot.ingestedAt,
        }),
      );
      projected += 1;
    }

    return { projected };
  }
}
