import { Pool, type PoolClient } from "pg";

export type ProductionDayScope = {
  readonly tenantId: string;
  readonly workspaceId: string;
};

export const readerSummaryProductionDayScope: ProductionDayScope =
  Object.freeze({
    tenantId: "00000000-0000-7000-8000-000000006101",
    workspaceId: "00000000-0000-7000-8000-000000006102",
  });

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
    const client = await pool.connect();
    try {
      await client.query(
        "SELECT set_config('social_monitor.system_access', 'true', false)",
      );
      const result = await client.query<{
        readonly itemCount: string;
      }>(
        `
          select
            count(*)::text as "itemCount"
          from feed_items
          where published_at >= $1::timestamptz
            and published_at < $2::timestamptz
            and tenant_id = $3::uuid
            and workspace_id = $4::uuid
        `,
        [
          params.periodStartedAt,
          params.periodEndedAt,
          readerSummaryProductionDayScope.tenantId,
          readerSummaryProductionDayScope.workspaceId,
        ],
      );
      const row = result.rows[0];
      if (row !== undefined && Number.parseInt(row.itemCount, 10) > 0) {
        return readerSummaryProductionDayScope;
      }
      return await readConfiguredProductionScope(client, params.collectionDate);
    } finally {
      client.release();
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function readConfiguredProductionScope(
  client: PoolClient,
  collectionDate: string,
): Promise<ProductionDayScope> {
  const result = await client.query<{
    readonly bindingCount: string;
  }>(
    `
      select
        count(*)::text as "bindingCount"
      from source_bindings
      where deleted_at is null
        and status = 'ENABLED'
        and tenant_id = $1::uuid
        and workspace_id = $2::uuid
    `,
    [
      readerSummaryProductionDayScope.tenantId,
      readerSummaryProductionDayScope.workspaceId,
    ],
  );
  const row = result.rows[0];
  if (row === undefined || Number.parseInt(row.bindingCount, 10) === 0) {
    throw new Error(
      `No published feed items or enabled source bindings found for ${collectionDate}`,
    );
  }
  console.warn(
    `No published feed items found for ${collectionDate}; using enabled source binding scope before live collection.`,
  );
  return readerSummaryProductionDayScope;
}
