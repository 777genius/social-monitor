import type { FeedSignalBaselineSample } from '../../../domain';
import type {
  FeedSignalBaselineCohortFilter,
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
      interestId: query.interestId,
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
      interestId: record.interestId,
      providerKey: record.providerKey,
      sourceKey: record.sourceKey,
      contentType: record.contentType,
      strength: record.strength,
      publishedAt: record.publishedAt,
      observedAt: record.observedAt,
    }));
  }

  async listCohortSamples(
    query: ListFeedSignalBaselineSamplesQuery & {
      readonly cohortFilters: readonly FeedSignalBaselineCohortFilter[];
    },
  ): Promise<readonly FeedSignalBaselineSample[]> {
    if (query.cohortFilters.length === 0) return [];
    if (this.prisma.$queryRawUnsafe === undefined) {
      const perCohort = Math.max(1, Math.ceil(query.limit / query.cohortFilters.length));
      const cohorts = await Promise.all(query.cohortFilters.map((cohortFilter) =>
        this.listSamples({ ...query, cohortFilters: [cohortFilter], limit: perCohort })));
      return roundRobin(cohorts, query.limit);
    }
    const records = await this.prisma.$queryRawUnsafe<
      readonly PrismaBaselineCohortRow[]
    >(`
      WITH requested_cohorts AS (
        SELECT * FROM jsonb_to_recordset($5::jsonb) AS requested(
          provider_key text, source_key text, content_type text
        )
      ), ranked AS (
        SELECT sample.feed_item_id AS "feedItemId",
          sample.interest_id AS "interestId",
          sample.provider_key AS "providerKey",
          sample.source_key AS "sourceKey",
          sample.content_type AS "contentType",
          sample.strength,
          sample.published_at AS "publishedAt",
          sample.observed_at AS "observedAt",
          row_number() OVER (
            PARTITION BY sample.provider_key, sample.source_key, sample.content_type
            ORDER BY sample.observed_at DESC, sample.feed_item_id DESC
          ) AS cohort_rank
        FROM feed_signal_baseline_samples sample
        JOIN requested_cohorts requested
          ON requested.provider_key = sample.provider_key
          AND requested.source_key = sample.source_key
          AND requested.content_type = sample.content_type
        WHERE sample.tenant_id = $1::uuid
          AND sample.workspace_id = $2::uuid
          AND ($3::uuid IS NULL OR sample.interest_id = $3::uuid)
          AND sample.observed_at > $4::timestamptz
      )
      SELECT "feedItemId", "interestId", "providerKey", "sourceKey",
        "contentType", strength, "publishedAt", "observedAt"
      FROM ranked
      ORDER BY cohort_rank ASC, "observedAt" DESC, "feedItemId" DESC
      LIMIT $6
    `, query.tenantId, query.workspaceId, query.interestId ?? null,
    query.observedAfter, JSON.stringify(query.cohortFilters.map((filter) => ({
      provider_key: filter.providerKey,
      source_key: filter.sourceKey,
      content_type: filter.contentType,
    }))), query.limit);
    return records.map(toSample);
  }
}

type PrismaBaselineCohortRow = {
  readonly feedItemId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly sourceKey: string;
  readonly contentType: string;
  readonly strength: number;
  readonly publishedAt: Date;
  readonly observedAt: Date;
};

const toSample = (record: PrismaBaselineCohortRow): FeedSignalBaselineSample => ({
  feedItemId: record.feedItemId,
  interestId: record.interestId,
  providerKey: record.providerKey,
  sourceKey: record.sourceKey,
  contentType: record.contentType,
  strength: record.strength,
  publishedAt: record.publishedAt,
  observedAt: record.observedAt,
});

const roundRobin = (
  cohorts: readonly (readonly FeedSignalBaselineSample[])[],
  limit: number,
): readonly FeedSignalBaselineSample[] => {
  const result: FeedSignalBaselineSample[] = [];
  for (let position = 0; result.length < limit; position += 1) {
    let added = false;
    for (const cohort of cohorts) {
      const sample = cohort[position];
      if (sample !== undefined) {
        result.push(sample);
        added = true;
        if (result.length === limit) break;
      }
    }
    if (!added) break;
  }
  return result;
};
