import type { PoolClient } from "pg";

import type { ProductionDayScope } from "./reader-summary-production-day-scope";

export type CollectionQualitySummaryCountRow = {
  readonly status: string | null;
  readonly count: string;
};

export async function queryCollectionQualitySummaryEvidenceCounts(
  client: PoolClient,
  scope: ProductionDayScope,
  params: {
    readonly startedAt: string;
    readonly endedAt: string;
  },
): Promise<readonly CollectionQualitySummaryCountRow[]> {
  const result = await client.query<CollectionQualitySummaryCountRow>(
    `
      select semantic_status::text as "status", count(*)::text as "count"
      from reader_summary_weekly_publication_evidence
      where period_started_at = $1::timestamptz
        and period_ended_at = $2::timestamptz
        and tenant_id = $3::uuid
        and workspace_id = $4::uuid
      group by semantic_status
      order by semantic_status
    `,
    [params.startedAt, params.endedAt, scope.tenantId, scope.workspaceId],
  );

  return result.rows;
}
