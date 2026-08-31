import { feedPromotionMetricAuthority } from "../../../domain";

import type { PrismaFeedClient } from "./prisma-feed-client";

export type PrismaFeedPromotionExactEvidence = {
  readonly publishedAt: string;
  readonly observedAt: string;
  readonly observedThrough: boolean;
  readonly sourceItemId: string;
  readonly body: string;
  readonly metricAuthority?: ReturnType<typeof feedPromotionMetricAuthority>;
};

type ExactMetricAuthorityRow = {
  readonly engagementObservedAt: string | null;
  readonly engagementChangedAt: string | null;
  readonly engagementMetricsHash: string | null;
  readonly currentHasRegressionFromLatest: boolean | null;
  readonly latestObservationAt: string | null;
  readonly latestObservationMetricsHash: string | null;
  readonly latestObservationHasRegression: boolean | null;
  readonly previousObservationAt: string | null;
  readonly previousObservationMetricsHash: string | null;
  readonly previousObservationHasRegression: boolean | null;
};

type ExactEvidenceRow = PrismaFeedPromotionExactEvidence &
  ExactMetricAuthorityRow & { readonly id: string };

export const exactPromotionPageEvidence = async (
  transaction: PrismaFeedClient,
  ids: readonly string[],
  cutoff: Date,
): Promise<ReadonlyMap<string, PrismaFeedPromotionExactEvidence>> => {
  if (ids.length === 0) return new Map();
  const rows = await transaction.$queryRawUnsafe!<readonly ExactEvidenceRow[]>(
    `SELECT feed.id::text AS id,
            feed.source_item_id::text AS "sourceItemId",
            source.body,
            to_char(feed.published_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "publishedAt",
            to_char(feed.observed_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "observedAt",
            feed.observed_at <= $2::timestamptz AS "observedThrough",
            to_char(engagement.last_observed_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "engagementObservedAt",
            to_char(engagement.last_changed_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "engagementChangedAt",
            engagement.metrics_hash AS "engagementMetricsHash",
            CASE
              WHEN engagement.source_item_id IS NULL OR
                   latest_observation.observed_at IS NULL THEN NULL
              ELSE COALESCE(engagement.score < latest_observation.score, false)
                OR COALESCE(engagement.likes < latest_observation.likes, false)
                OR COALESCE(engagement.reposts < latest_observation.reposts, false)
                OR COALESCE(engagement.points < latest_observation.points, false)
                OR COALESCE(engagement.stars < latest_observation.stars, false)
                OR COALESCE(engagement.forks < latest_observation.forks, false)
                OR COALESCE(
                  engagement.stars_gained < latest_observation.stars_gained,
                  false
                )
                OR COALESCE(
                  engagement.provider_rank > latest_observation.provider_rank,
                  false
                )
                OR COALESCE(
                  engagement.upvote_ratio_bps <
                    latest_observation.upvote_ratio_bps,
                  false
                )
            END AS "currentHasRegressionFromLatest",
            to_char(latest_observation.observed_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "latestObservationAt",
            latest_observation.metrics_hash AS "latestObservationMetricsHash",
            CASE
              WHEN latest_observation.observed_at IS NULL THEN NULL
              ELSE latest_observation.has_regression
                OR COALESCE(
                  latest_observation.score < previous_observation.score,
                  false
                )
                OR COALESCE(
                  latest_observation.likes < previous_observation.likes,
                  false
                )
                OR COALESCE(
                  latest_observation.reposts < previous_observation.reposts,
                  false
                )
                OR COALESCE(
                  latest_observation.points < previous_observation.points,
                  false
                )
                OR COALESCE(
                  latest_observation.stars < previous_observation.stars,
                  false
                )
                OR COALESCE(
                  latest_observation.forks < previous_observation.forks,
                  false
                )
                OR COALESCE(
                  latest_observation.stars_gained <
                    previous_observation.stars_gained,
                  false
                )
                OR COALESCE(
                  latest_observation.provider_rank >
                    previous_observation.provider_rank,
                  false
                )
                OR COALESCE(
                  latest_observation.upvote_ratio_bps <
                    previous_observation.upvote_ratio_bps,
                  false
                )
            END AS "latestObservationHasRegression",
            to_char(previous_observation.observed_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "previousObservationAt",
            previous_observation.metrics_hash AS
              "previousObservationMetricsHash",
            previous_observation.has_regression AS
              "previousObservationHasRegression"
       FROM feed_items feed
       JOIN source_items source ON source.id = feed.source_item_id
       LEFT JOIN source_item_engagement_snapshots engagement
         ON engagement.tenant_id = feed.tenant_id
        AND engagement.workspace_id = feed.workspace_id
        AND engagement.source_item_id = feed.source_item_id
       LEFT JOIN LATERAL (
         SELECT observation.observed_at,
                observation.metrics_hash,
                observation.has_regression,
                observation.score,
                observation.likes,
                observation.reposts,
                observation.points,
                observation.stars,
                observation.forks,
                observation.stars_gained,
                observation.provider_rank,
                observation.upvote_ratio_bps
           FROM source_item_engagement_observations observation
          WHERE observation.tenant_id = feed.tenant_id
            AND observation.workspace_id = feed.workspace_id
            AND observation.source_item_id = feed.source_item_id
          ORDER BY observation.observed_at DESC, observation.id DESC
          LIMIT 1
       ) latest_observation ON true
       LEFT JOIN LATERAL (
         SELECT observation.observed_at,
                observation.metrics_hash,
                observation.has_regression,
                observation.score,
                observation.likes,
                observation.reposts,
                observation.points,
                observation.stars,
                observation.forks,
                observation.stars_gained,
                observation.provider_rank,
                observation.upvote_ratio_bps
           FROM source_item_engagement_observations observation
          WHERE observation.tenant_id = feed.tenant_id
            AND observation.workspace_id = feed.workspace_id
            AND observation.source_item_id = feed.source_item_id
          ORDER BY observation.observed_at DESC, observation.id DESC
          OFFSET 1 LIMIT 1
       ) previous_observation ON true
      WHERE feed.id = ANY($1::uuid[])`,
    ids,
    cutoff,
  );
  return new Map(rows.map((row) => [row.id, {
    ...row,
    metricAuthority: durableMetricAuthority(row),
  }] as const));
};

const durableMetricAuthority = (
  row: ExactMetricAuthorityRow,
): ReturnType<typeof feedPromotionMetricAuthority> => {
  const snapshotObservedAt = parsedDate(row.engagementObservedAt);
  const snapshotChangedAt = parsedDate(row.engagementChangedAt);
  const latestObservedAt = parsedDate(row.latestObservationAt);
  if (snapshotObservedAt === undefined || snapshotChangedAt === undefined ||
      latestObservedAt === undefined ||
      row.engagementMetricsHash === null ||
      row.latestObservationMetricsHash === null ||
      row.latestObservationHasRegression === null ||
      row.currentHasRegressionFromLatest === null) return undefined;
  const previousObservedAt = parsedDate(row.previousObservationAt);
  return feedPromotionMetricAuthority({
    snapshotObservedAt,
    snapshotChangedAt,
    snapshotMetricsHash: row.engagementMetricsHash,
    currentHasRegressionFromLatest: row.currentHasRegressionFromLatest,
    latestObservation: {
      observedAt: latestObservedAt,
      metricsHash: row.latestObservationMetricsHash,
      hasRegression: row.latestObservationHasRegression,
    },
    ...(previousObservedAt === undefined ||
        row.previousObservationMetricsHash === null ||
        row.previousObservationHasRegression === null
      ? {}
      : { previousObservation: {
          observedAt: previousObservedAt,
          metricsHash: row.previousObservationMetricsHash,
          hasRegression: row.previousObservationHasRegression,
        } }),
  });
};

const parsedDate = (value: string | null): Date | undefined => {
  if (value === null) return undefined;
  const result = new Date(value);
  return Number.isFinite(result.getTime()) ? result : undefined;
};
