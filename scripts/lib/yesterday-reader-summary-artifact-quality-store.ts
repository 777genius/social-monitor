import type { Pool } from "pg";

import { isDefaultReaderSummaryEvidenceProvider } from "@social-monitor/summary/adapters/evidence/reader-summary-evidence-provider-filter";
import type { PrismaReaderSummaryArtifactRecord } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import type { ReaderSummaryCollectedFeedItemCoverage } from "@social-monitor/summary/ports";

import type { SelectedFeedItemProvenance } from "./reader-summary-artifact-coverage";
import { dailyPeriodKey } from "./reader-summary-quality-eval-support";
import { nextDate } from "./yesterday-social-replay-support";

type ArtifactQualityScope = {
  readonly tenantId: string;
  readonly workspaceId: string;
};

type ProviderCountRow = {
  readonly providerKey: string;
  readonly collectedFeedItemCount: string;
};

type ArtifactStatusCountRow = {
  readonly status: string;
  readonly count: string;
};

const escapePostgresIlikeLiteral = (value: string): string =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");

export type TopReadFeedItemQualityRow = {
  readonly id: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly authorHandle: string | null;
  readonly title: string;
  readonly bodyPreview: string | null;
  readonly sourceBody: string;
  readonly providerMetadata: unknown;
};

export class YesterdayReaderSummaryArtifactQualityStore {
  constructor(
    private readonly pool: Pool,
    private readonly collectionDate: string,
    private readonly badGamingFalsePositiveNeedle: string,
  ) {}

  async readLatestArtifact(
    scope: ArtifactQualityScope,
  ): Promise<PrismaReaderSummaryArtifactRecord> {
    const result = await this.pool.query<PrismaReaderSummaryArtifactRecord>(
      `
        select
          id::text as "id",
          tenant_id::text as "tenantId",
          workspace_id::text as "workspaceId",
          scope_type as "scopeType",
          scope_key as "scopeKey",
          interest_id::text as "interestId",
          cadence as "cadence",
          period_started_at as "periodStartedAt",
          period_ended_at as "periodEndedAt",
          period_timezone as "periodTimezone",
          period_key as "periodKey",
          user_id::text as "userId",
          subscription_id::text as "subscriptionId",
          status::text as "status",
          schema_version as "schemaVersion",
          model_version as "modelVersion",
          prompt_version as "promptVersion",
          headline as "headline",
          summary_text as "summaryText",
          artifact_payload as "artifactPayload",
          citations as "citations",
          quality_signals as "qualitySignals",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from reader_summary_artifacts
        where tenant_id = $1::uuid
          and workspace_id = $2::uuid
          and status in ('COMPLETED', 'NO_SIGNAL')
          and scope_type = 'workspace'
          and cadence = 'daily'
          and period_key = $3
        order by created_at desc, id desc
        limit 1
      `,
      [
        scope.tenantId,
        scope.workspaceId,
        dailyPeriodKey(this.collectionDate),
      ],
    );
    const row = result.rows[0];

    if (row === undefined) {
      throw new Error(
        `No persisted reader summary artifact found for ${this.collectionDate}`,
      );
    }

    return row;
  }

  async readLatestVisibleArtifact(
    scope: ArtifactQualityScope,
  ): Promise<PrismaReaderSummaryArtifactRecord> {
    const result = await this.pool.query<PrismaReaderSummaryArtifactRecord>(
      `
        select
          id::text as "id",
          tenant_id::text as "tenantId",
          workspace_id::text as "workspaceId",
          scope_type as "scopeType",
          scope_key as "scopeKey",
          interest_id::text as "interestId",
          cadence as "cadence",
          period_started_at as "periodStartedAt",
          period_ended_at as "periodEndedAt",
          period_timezone as "periodTimezone",
          period_key as "periodKey",
          user_id::text as "userId",
          subscription_id::text as "subscriptionId",
          status::text as "status",
          schema_version as "schemaVersion",
          model_version as "modelVersion",
          prompt_version as "promptVersion",
          headline as "headline",
          summary_text as "summaryText",
          artifact_payload as "artifactPayload",
          citations as "citations",
          quality_signals as "qualitySignals",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from reader_summary_artifacts
        where tenant_id = $1::uuid
          and workspace_id = $2::uuid
          and scope_type = 'workspace'
          and cadence = 'daily'
          and status in ('COMPLETED', 'NO_SIGNAL')
        order by period_started_at desc, created_at desc, id desc
        limit 1
      `,
      [scope.tenantId, scope.workspaceId],
    );
    const row = result.rows[0];

    if (row === undefined) {
      throw new Error("No persisted latest reader summary artifact found");
    }

    return row;
  }

  async readPeriodArtifactStatusCounts(
    scope: ArtifactQualityScope,
  ): Promise<Record<string, number>> {
    const result = await this.pool.query<ArtifactStatusCountRow>(
      `
        select status::text as status, count(*)::text as count
        from reader_summary_artifacts
        where tenant_id = $1::uuid
          and workspace_id = $2::uuid
          and scope_type = 'workspace'
          and cadence = 'daily'
          and period_key = $3
        group by status
        order by status
      `,
      [
        scope.tenantId,
        scope.workspaceId,
        dailyPeriodKey(this.collectionDate),
      ],
    );

    return statusCounts(result.rows);
  }

  async readBadGamingArtifactStatusCounts(
    scope: ArtifactQualityScope,
  ): Promise<Record<string, number>> {
    const result = await this.pool.query<ArtifactStatusCountRow>(
      `
        select status::text as status, count(*)::text as count
        from reader_summary_artifacts
        where tenant_id = $1::uuid
          and workspace_id = $2::uuid
          and artifact_payload::text ilike $3 escape E'\\\\'
        group by status
        order by status
      `,
      [
        scope.tenantId,
        scope.workspaceId,
        `%${escapePostgresIlikeLiteral(this.badGamingFalsePositiveNeedle)}%`,
      ],
    );

    return statusCounts(result.rows);
  }

  async readCollectedCoverage(
    scope: ArtifactQualityScope,
  ): Promise<ReaderSummaryCollectedFeedItemCoverage> {
    const window = artifactQualityFeedWindow(this.collectionDate);
    const result = await this.pool.query<ProviderCountRow>(
      `
        select
          provider_key as "providerKey",
          count(*)::text as "collectedFeedItemCount"
        from feed_items
        where tenant_id = $1::uuid
          and workspace_id = $2::uuid
          and published_at >= $3::timestamptz
          and published_at < $4::timestamptz
        group by provider_key
        order by provider_key
      `,
      [
        scope.tenantId,
        scope.workspaceId,
        window.startInclusive,
        window.endExclusive,
      ],
    );
    const providerBreakdown = result.rows
      .filter((item) =>
        isDefaultReaderSummaryEvidenceProvider(item.providerKey),
      )
      .map((item) => ({
        providerKey: item.providerKey,
        collectedFeedItemCount: Number.parseInt(
          item.collectedFeedItemCount,
          10,
        ),
        lowRelevanceFeedItemCount: 0,
        mutedFeedItemCount: 0,
        userRatedFeedItemCount: 0,
      }))
      .sort((left, right) => {
        const countDiff =
          right.collectedFeedItemCount - left.collectedFeedItemCount;
        return countDiff === 0
          ? left.providerKey.localeCompare(right.providerKey)
          : countDiff;
      });

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

  async readVisibleBadGamingArtifactCount(
    scope: ArtifactQualityScope,
  ): Promise<number> {
    const result = await this.pool.query<{ readonly count: string }>(
      `
        select count(*)::text as count
        from reader_summary_artifacts
        where tenant_id = $1::uuid
          and workspace_id = $2::uuid
          and status in ('COMPLETED', 'NO_SIGNAL')
          and artifact_payload::text ilike $3 escape E'\\\\'
      `,
      [
        scope.tenantId,
        scope.workspaceId,
        `%${escapePostgresIlikeLiteral(this.badGamingFalsePositiveNeedle)}%`,
      ],
    );

    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  async readFeedItemsByIds(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly feedItemIds: readonly string[];
  }): Promise<readonly TopReadFeedItemQualityRow[]> {
    if (params.feedItemIds.length === 0) {
      return [];
    }

    const result = await this.pool.query<TopReadFeedItemQualityRow>(
      `
        select
          fi.id::text as "id",
          fi.provider_key as "providerKey",
          fi.canonical_url as "canonicalUrl",
          fi.author_handle as "authorHandle",
          fi.title,
          fi.body_preview as "bodyPreview",
          si.body as "sourceBody",
          fi.provider_metadata as "providerMetadata"
        from feed_items fi
        join source_items si
          on si.id = fi.source_item_id
         and si.tenant_id = fi.tenant_id
         and si.workspace_id = fi.workspace_id
        where fi.tenant_id = $1::uuid
          and fi.workspace_id = $2::uuid
          and fi.id = any($3::uuid[])
      `,
      [params.tenantId, params.workspaceId, params.feedItemIds],
    );

    return result.rows;
  }

  async readSelectedFeedItemProvenance(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly feedItemIds: readonly string[];
  }): Promise<readonly SelectedFeedItemProvenance[]> {
    if (params.feedItemIds.length === 0) {
      return [];
    }

    const result = await this.pool.query<SelectedFeedItemProvenance>(
      `
        select
          fi.id::text as "feedItemId",
          fi.tenant_id::text as "tenantId",
          fi.workspace_id::text as "workspaceId",
          fi.interest_id::text as "interestId",
          i.tenant_id::text as "interestTenantId",
          i.workspace_id::text as "interestWorkspaceId",
          fi.provider_key as "providerKey"
        from feed_items fi
        left join interests i
          on i.id = fi.interest_id
         and i.tenant_id = $1::uuid
         and i.workspace_id = $2::uuid
        where fi.tenant_id = $1::uuid
          and fi.workspace_id = $2::uuid
          and fi.id = any($3::uuid[])
        order by fi.id
      `,
      [params.tenantId, params.workspaceId, params.feedItemIds],
    );

    return result.rows;
  }
}

export const artifactQualityFeedWindow = (
  collectionDate: string,
): {
  readonly startInclusive: string;
  readonly endExclusive: string;
} => ({
  startInclusive: `${collectionDate}T00:00:00.000Z`,
  endExclusive: new Date(nextDate(collectionDate)).toISOString(),
});

const statusCounts = (
  rows: readonly ArtifactStatusCountRow[],
): Record<string, number> =>
  Object.fromEntries(
    rows.map((row) => [row.status, Number.parseInt(row.count, 10)]),
  );
