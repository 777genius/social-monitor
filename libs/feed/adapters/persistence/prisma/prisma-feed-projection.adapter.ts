import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { IdGenerator } from '@social-monitor/shared-kernel';
import type {
  FeedProjectionPort,
  ProjectFeedItemsCommand,
  ProjectFeedItemsResult,
} from '@social-monitor/ingestion/ports';

import type { PrismaFeedClient } from './prisma-feed-client';
import { feedDedupeKeyForItem } from '../feed-dedupe-key';
import { feedBodyPreviewForProjection } from '../feed-projection-content';

export class PrismaFeedProjectionAdapter implements FeedProjectionPort {
  constructor(
    private readonly prisma: PrismaFeedClient,
    private readonly ids: IdGenerator,
  ) {}

  async project(command: ProjectFeedItemsCommand): Promise<ProjectFeedItemsResult> {
    let projected = 0;

    for (const sourceItem of command.sourceItems) {
      const snapshot = sourceItem.toSnapshot();
      const dedupeKey = feedDedupeKeyForItem({
        canonicalUrl: snapshot.canonicalUrl,
        providerMetadata: snapshot.metadata,
      });
      const bodyPreview = feedBodyPreviewForProjection({
        body: snapshot.body,
        providerMetadata: snapshot.metadata,
      });
      const feedItemId = this.ids.generate();

      await withPrismaWriteRetry(() => this.prisma.feedItem.upsert({
        where: {
          tenantId_topicId_dedupeKey: {
            tenantId: command.tenantId,
            topicId: command.topicId,
            dedupeKey,
          },
        },
        update: {
          sourceItemId: snapshot.id,
          sourceBindingId: command.sourceBindingId,
          providerKey: command.providerKey,
          canonicalUrl: snapshot.canonicalUrl,
          title: snapshot.title,
          bodyPreview,
          authorHandle: snapshot.authorHandle ?? null,
          publishedAt: snapshot.publishedAt,
          observedAt: snapshot.ingestedAt,
          providerMetadata: snapshot.metadata ?? undefined,
          status: 'VISIBLE',
        },
        create: {
          id: feedItemId,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          topicId: command.topicId,
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
          providerMetadata: snapshot.metadata ?? undefined,
          status: 'VISIBLE',
        },
      }));
      projected += 1;
    }

    return { projected };
  }
}
