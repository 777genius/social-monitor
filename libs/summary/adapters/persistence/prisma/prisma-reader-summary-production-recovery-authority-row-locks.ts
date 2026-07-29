import type { PrismaSummaryClient } from "./prisma-summary-client";

type LockedRow = Readonly<{ id: string }>;

export const lockProductionRecoveryRows = async (
  prisma: Pick<PrismaSummaryClient, "$queryRaw">,
): Promise<void> => {
  const scope = await prisma.$queryRaw<readonly LockedRow[]>`
    SELECT tenant."id"::TEXT AS "id"
    FROM "tenants" AS tenant
    JOIN "workspaces" AS workspace
      ON workspace."tenant_id" = tenant."id"
      AND workspace."id" =
        current_setting('social_monitor.workspace_id')::uuid
      AND workspace."deleted_at" IS NULL
    WHERE tenant."id" =
        current_setting('social_monitor.tenant_id')::uuid
      AND tenant."deleted_at" IS NULL
    ORDER BY tenant."id", workspace."id"
    FOR UPDATE OF tenant, workspace
  `;
  if (scope.length !== 1) {
    throw new Error(
      "Reader summary production recovery tenant/workspace authority is absent",
    );
  }
  await prisma.$queryRaw<readonly LockedRow[]>`
    SELECT binding."id"::TEXT AS "id"
    FROM "source_bindings" AS binding
    WHERE binding."tenant_id" =
        current_setting('social_monitor.tenant_id')::uuid
      AND binding."workspace_id" =
        current_setting('social_monitor.workspace_id')::uuid
      AND binding."status" = 'ENABLED'
      AND binding."deleted_at" IS NULL
      AND EXISTS (
        SELECT 1
        FROM "feed_items" AS feed
        WHERE feed."source_binding_id" = binding."id"
          AND feed."tenant_id" = binding."tenant_id"
          AND feed."workspace_id" = binding."workspace_id"
          AND feed."status" = 'VISIBLE'
          AND feed."provider_key" = ANY(ARRAY[
            'github-trending-page',
            'hacker-news',
            'reddit',
            'rss',
            'x-twitter'
          ])
          AND feed."published_at" >=
            (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."published_at" <
            (DATE '2026-07-29'::TIMESTAMP AT TIME ZONE 'UTC')
      )
    ORDER BY binding."id"
    FOR SHARE
  `;
  await prisma.$queryRaw<readonly LockedRow[]>`
    SELECT source."id"::TEXT AS "id"
    FROM "source_items" AS source
    WHERE source."tenant_id" =
        current_setting('social_monitor.tenant_id')::uuid
      AND source."workspace_id" =
        current_setting('social_monitor.workspace_id')::uuid
      AND EXISTS (
        SELECT 1
        FROM "feed_items" AS feed
        WHERE feed."source_item_id" = source."id"
          AND feed."tenant_id" = source."tenant_id"
          AND feed."workspace_id" = source."workspace_id"
          AND feed."status" = 'VISIBLE'
          AND feed."provider_key" = ANY(ARRAY[
            'github-trending-page',
            'hacker-news',
            'reddit',
            'rss',
            'x-twitter'
          ])
          AND feed."published_at" >=
            (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."published_at" <
            (DATE '2026-07-29'::TIMESTAMP AT TIME ZONE 'UTC')
      )
    ORDER BY source."id"
    FOR SHARE
  `;
  await prisma.$queryRaw<readonly LockedRow[]>`
    SELECT feed."id"::TEXT AS "id"
    FROM "feed_items" AS feed
    WHERE feed."tenant_id" =
        current_setting('social_monitor.tenant_id')::uuid
      AND feed."workspace_id" =
        current_setting('social_monitor.workspace_id')::uuid
      AND feed."status" = 'VISIBLE'
      AND feed."provider_key" = ANY(ARRAY[
        'github-trending-page',
        'hacker-news',
        'reddit',
        'rss',
        'x-twitter'
      ])
      AND feed."published_at" >=
        (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
      AND feed."published_at" <
        (DATE '2026-07-29'::TIMESTAMP AT TIME ZONE 'UTC')
    ORDER BY feed."id"
    FOR SHARE
  `;
  await lockProductionRecoveryGitHubRows(prisma);
};

const lockProductionRecoveryGitHubRows = async (
  prisma: Pick<PrismaSummaryClient, "$queryRaw">,
): Promise<void> => {
  await prisma.$queryRaw<readonly LockedRow[]>`
    SELECT result."id"::TEXT AS "id"
    FROM "github_repository_trend_results" AS result
    WHERE result."tenant_id" =
        current_setting('social_monitor.tenant_id')::uuid
      AND result."workspace_id" =
        current_setting('social_monitor.workspace_id')::uuid
      AND result."checked_at" >=
        (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
      AND result."checked_at" <
        (DATE '2026-07-29'::TIMESTAMP AT TIME ZONE 'UTC')
    ORDER BY result."id"
    FOR SHARE
  `;
  await prisma.$queryRaw<readonly LockedRow[]>`
    SELECT scan."id"::TEXT AS "id"
    FROM "scan_jobs" AS scan
    WHERE scan."tenant_id" =
        current_setting('social_monitor.tenant_id')::uuid
      AND scan."workspace_id" =
        current_setting('social_monitor.workspace_id')::uuid
      AND EXISTS (
        SELECT 1
        FROM "github_repository_trend_results" AS result
        WHERE result."scan_job_id" = scan."id"
          AND result."tenant_id" = scan."tenant_id"
          AND result."workspace_id" = scan."workspace_id"
          AND result."checked_at" >=
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND result."checked_at" <
            (DATE '2026-07-29'::TIMESTAMP AT TIME ZONE 'UTC')
      )
    ORDER BY scan."id"
    FOR SHARE
  `;
  await prisma.$queryRaw<readonly LockedRow[]>`
    SELECT attempt."scan_job_id"::TEXT AS "id"
    FROM "scan_attempts" AS attempt
    WHERE attempt."tenant_id" =
        current_setting('social_monitor.tenant_id')::uuid
      AND attempt."workspace_id" =
        current_setting('social_monitor.workspace_id')::uuid
      AND EXISTS (
        SELECT 1
        FROM "github_repository_trend_results" AS result
        WHERE result."scan_job_id" = attempt."scan_job_id"
          AND result."tenant_id" = attempt."tenant_id"
          AND result."workspace_id" = attempt."workspace_id"
          AND result."checked_at" >=
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND result."checked_at" <
            (DATE '2026-07-29'::TIMESTAMP AT TIME ZONE 'UTC')
      )
    ORDER BY attempt."scan_job_id", attempt."attempt_number"
    FOR SHARE
  `;
};
