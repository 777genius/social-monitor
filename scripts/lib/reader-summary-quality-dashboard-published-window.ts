import type { Pool } from "pg";

import { isDefaultReaderSummaryEvidenceProvider } from "@social-monitor/summary/adapters/evidence/reader-summary-evidence-provider-filter";
import type { ReaderSummaryCollectedFeedItemCoverage } from "@social-monitor/summary/ports";

import { dayEnd, dayStart } from "./reader-summary-quality-eval-support";

export type DashboardFeedItemRow = {
  readonly id: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly authorHandle: string | null;
  readonly title: string;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly providerMetadata: unknown;
};

export type DashboardRatingRow = {
  readonly id: string;
  readonly rating: number | null;
  readonly target: unknown;
  readonly createdAt: Date;
};

export async function readDashboardCollectionDates(
  pool: Pool,
  explicitDate: string | undefined,
): Promise<readonly string[]> {
  if (explicitDate !== undefined) {
    assertDashboardCollectionDate(explicitDate);
    return [explicitDate];
  }

  const result = await pool.query<{ readonly collectionDate: string }>(
    `
      select to_char(published_at at time zone 'UTC', 'YYYY-MM-DD') as "collectionDate"
      from feed_items
      where status = 'VISIBLE'
      group by 1
      order by 1
    `,
  );

  return result.rows.map((row) => row.collectionDate);
}

function assertDashboardCollectionDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid --date value: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --date value: ${value}`);
  }
}

export async function readDashboardFeedItems(
  pool: Pool,
  scope: { readonly tenantId: string; readonly workspaceId: string },
  collectionDate: string,
): Promise<readonly DashboardFeedItemRow[]> {
  const result = await pool.query<DashboardFeedItemRow>(
    `
      select
        id::text as "id",
        source_item_id::text as "sourceItemId",
        source_binding_id::text as "sourceBindingId",
        interest_id::text as "interestId",
        provider_key as "providerKey",
        canonical_url as "canonicalUrl",
        author_handle as "authorHandle",
        title,
        published_at as "publishedAt",
        observed_at as "observedAt",
        provider_metadata as "providerMetadata"
      from feed_items
      where tenant_id = $1::uuid
        and workspace_id = $2::uuid
        and status = 'VISIBLE'
        and published_at >= $3::timestamptz
        and published_at < $4::timestamptz
      order by provider_key, published_at, id
    `,
    [
      scope.tenantId,
      scope.workspaceId,
      dayStart(collectionDate),
      dayEnd(collectionDate),
    ],
  );

  return result.rows;
}

export async function readDashboardCollectedCoverage(
  pool: Pool,
  scope: { readonly tenantId: string; readonly workspaceId: string },
  collectionDate: string,
): Promise<ReaderSummaryCollectedFeedItemCoverage> {
  const result = await pool.query<{
    readonly providerKey: string;
    readonly collectedFeedItemCount: string;
  }>(
    `
      select
        provider_key as "providerKey",
        count(*)::text as "collectedFeedItemCount"
      from feed_items
      where tenant_id = $1::uuid
        and workspace_id = $2::uuid
        and status = 'VISIBLE'
        and published_at >= $3::timestamptz
        and published_at < $4::timestamptz
      group by provider_key
      order by provider_key
    `,
    [
      scope.tenantId,
      scope.workspaceId,
      dayStart(collectionDate),
      dayEnd(collectionDate),
    ],
  );
  const providerBreakdown = result.rows
    .filter((item) => isDefaultReaderSummaryEvidenceProvider(item.providerKey))
    .map((item) => ({
      providerKey: item.providerKey,
      collectedFeedItemCount: Number.parseInt(item.collectedFeedItemCount, 10),
      lowRelevanceFeedItemCount: 0,
      mutedFeedItemCount: 0,
      userRatedFeedItemCount: 0,
    }));

  return {
    collectedFeedItemCount: providerBreakdown.reduce(
      (sum, item) => sum + item.collectedFeedItemCount,
      0,
    ),
    lowRelevanceFeedItemCount: 0,
    mutedFeedItemCount: 0,
    userRatedFeedItemCount: 0,
    providerBreakdown,
    topicBreakdown: [],
    queryBreakdown: [],
  };
}

export async function readDashboardRatings(
  pool: Pool,
  scope: { readonly tenantId: string; readonly workspaceId: string },
  collectionDate: string,
): Promise<readonly DashboardRatingRow[]> {
  const result = await pool.query<DashboardRatingRow>(
    `
      select
        id::text as "id",
        rating,
        target,
        created_at as "createdAt"
      from relevance_feedback_signals
      where tenant_id = $1::uuid
        and workspace_id = $2::uuid
        and action = 'rate_post'
        and (
          target->>'feedItemId' in (
            select id::text
            from feed_items
            where tenant_id = $1::uuid
              and workspace_id = $2::uuid
              and status = 'VISIBLE'
              and published_at >= $3::timestamptz
              and published_at < $4::timestamptz
          )
          or target->>'sourceItemId' in (
            select source_item_id::text
            from feed_items
            where tenant_id = $1::uuid
              and workspace_id = $2::uuid
              and status = 'VISIBLE'
              and published_at >= $3::timestamptz
              and published_at < $4::timestamptz
          )
        )
      order by created_at desc, id desc
      limit 5000
    `,
    [
      scope.tenantId,
      scope.workspaceId,
      dayStart(collectionDate),
      dayEnd(collectionDate),
    ],
  );

  return result.rows;
}
