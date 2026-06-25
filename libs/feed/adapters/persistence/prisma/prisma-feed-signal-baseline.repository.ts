import type { FeedSignalBaselineSample } from '../../../domain';
import type {
  FeedSignalBaselineRepositoryPort,
  ListFeedSignalBaselineSamplesQuery,
} from '../../../ports';
import type { PrismaFeedClient } from './prisma-feed-client';

export class PrismaFeedSignalBaselineRepository implements FeedSignalBaselineRepositoryPort {
  constructor(private readonly prisma: PrismaFeedClient) {}

  async listSamples(
    query: ListFeedSignalBaselineSamplesQuery,
  ): Promise<readonly FeedSignalBaselineSample[]> {
    const cohortFilters = query.cohortFilters ?? [];
    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      topicId: query.topicId,
      observedAt: { gt: query.observedAfter },
      ...(cohortFilters.length === 0
        ? {}
        : {
          OR: cohortFilters.map((filter) => ({
            providerKey: filter.providerKey,
            sourceKey: filter.sourceKey,
            contentType: filter.contentType,
          })),
        }),
    };
    const records = await this.prisma.feedSignalBaselineSample.findMany({
      where,
      orderBy: [{ observedAt: 'desc' }, { feedItemId: 'desc' }],
      take: query.limit,
    });

    return records.map((record) => ({
      feedItemId: record.feedItemId,
      topicId: record.topicId,
      providerKey: record.providerKey,
      sourceKey: record.sourceKey,
      contentType: record.contentType,
      strength: record.strength,
      publishedAt: record.publishedAt,
      observedAt: record.observedAt,
    }));
  }
}
