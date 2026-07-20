import { Pool } from "pg";

export type ProductionDayScope = {
  readonly tenantId: string;
  readonly workspaceId: string;
};

export async function readProductionDayScope(params: {
  readonly connectionString: string;
  readonly periodStartedAt: string;
  readonly periodEndedAt: string;
  readonly collectionDate: string;
}): Promise<ProductionDayScope> {
  const pool = new Pool({
    connectionString: params.connectionString,
    min: 0,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });
  try {
    const result = await pool.query<{
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly itemCount: string;
    }>(
      `
        select
          tenant_id::text as "tenantId",
          workspace_id::text as "workspaceId",
          count(*)::text as "itemCount"
        from feed_items
        where published_at >= $1::timestamptz
          and published_at < $2::timestamptz
        group by tenant_id, workspace_id
        order by count(*) desc
        limit 1
      `,
      [params.periodStartedAt, params.periodEndedAt],
    );
    const row = result.rows[0];
    if (row !== undefined && Number.parseInt(row.itemCount, 10) > 0) {
      return { tenantId: row.tenantId, workspaceId: row.workspaceId };
    }
    return await readDominantConfiguredScope(pool, params.collectionDate);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function readDominantConfiguredScope(
  pool: Pool,
  collectionDate: string,
): Promise<ProductionDayScope> {
  const result = await pool.query<{
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly bindingCount: string;
  }>(`
    select
      tenant_id::text as "tenantId",
      workspace_id::text as "workspaceId",
      count(*)::text as "bindingCount"
    from source_bindings
    where deleted_at is null
      and status = 'ENABLED'
    group by tenant_id, workspace_id
    order by count(*) desc
    limit 1
  `);
  const row = result.rows[0];
  if (row === undefined || Number.parseInt(row.bindingCount, 10) === 0) {
    throw new Error(
      `No published feed items or enabled source bindings found for ${collectionDate}`,
    );
  }
  console.warn(
    `No published feed items found for ${collectionDate}; using enabled source binding scope before live collection.`,
  );
  return { tenantId: row.tenantId, workspaceId: row.workspaceId };
}
