import { PrismaFeedProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter";
import { SourceItem } from "@social-monitor/ingestion/domain";
import {
  CryptoIdGenerator,
  normalizeJsonObject,
  redactSensitiveText,
  tenantId,
  workspaceId,
  type JsonObject,
} from "@social-monitor/shared-kernel";
import { Pool } from "pg";

import { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import {
  parseGitHubTrendingBackfillOptions,
  missingGitHubTrendingObservations,
  strongestGitHubTrendingObservations,
  utcDateWindow,
} from "./lib/github-trending-feed-backfill-support";

type BackfillSourceRow = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly interestQuery: string;
  readonly sourceBindingId: string;
  readonly bindingConfig: unknown;
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly body: string;
  readonly authorHandle: string | null;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly metadata: JsonObject;
};

const providerKey = "github-trending-page";

async function main(): Promise<void> {
  const options = parseGitHubTrendingBackfillOptions(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const rows = await readSourceObservations(pool, options.date);
    const selection = strongestGitHubTrendingObservations(rows);
    const existingVisible = await readExistingVisibleFeedItems(
      pool,
      options.date,
    );
    const projectionCandidates = missingGitHubTrendingObservations(
      selection.selected,
      existingVisible,
    );
    const selectedByBinding = groupByBinding(projectionCandidates.missing);

    if (!options.apply) {
      printReport({
        mode: "dry-run",
        date: options.date,
        observations: rows.length,
        selected: selection.selected.length,
        alreadyPresent: projectionCandidates.alreadyPresent,
        missing: projectionCandidates.missing.length,
        bindings: selectedByBinding.size,
        invalidCanonicalRepositories: selection.invalidCanonicalRepositoryCount,
        projected: 0,
      });
      return;
    }

    const connection = new PrismaIngestionWorkerConnection(databaseUrl);
    try {
      const projection = new PrismaFeedProjectionAdapter(
        connection,
        new CryptoIdGenerator(),
      );
      let projected = 0;
      for (const selectedRows of selectedByBinding.values()) {
        const binding = selectedRows[0];
        if (binding === undefined) {
          continue;
        }
        const result = await projection.project({
          tenantId: tenantId(binding.tenantId),
          workspaceId: workspaceId(binding.workspaceId),
          interestId: binding.interestId,
          sourceBindingId: binding.sourceBindingId,
          providerKey,
          snapshots: {
            interestQuerySnapshot: {
              interestId: binding.interestId,
              query: binding.interestQuery,
            },
            sourceBindingSnapshot: {
              sourceBindingId: binding.sourceBindingId,
              providerKey,
              sourceQuery: sourceQuerySnapshot(binding.bindingConfig),
            },
            workspaceScopeSnapshot: {
              tenantId: tenantId(binding.tenantId),
              workspaceId: workspaceId(binding.workspaceId),
            },
          },
          sourceItems: selectedRows.map(rehydrateSourceItem),
        });
        projected += result.projected;
      }

      printReport({
        mode: "apply",
        date: options.date,
        observations: rows.length,
        selected: selection.selected.length,
        alreadyPresent: projectionCandidates.alreadyPresent,
        missing: projectionCandidates.missing.length,
        bindings: selectedByBinding.size,
        invalidCanonicalRepositories: selection.invalidCanonicalRepositoryCount,
        projected,
      });
    } finally {
      await connection.close();
    }
  } finally {
    await pool.end();
  }
}

async function readExistingVisibleFeedItems(
  pool: Pool,
  date: string,
): Promise<
  readonly {
    readonly id: string;
    readonly sourceBindingId: string;
    readonly canonicalUrl: string;
    readonly observedAt: Date;
    readonly metadata: JsonObject;
  }[]
> {
  const window = utcDateWindow(date);
  const result = await pool.query<{
    readonly id: string;
    readonly sourceBindingId: string;
    readonly canonicalUrl: string;
    readonly observedAt: Date;
    readonly metadata: unknown;
  }>(
    `
      select
        id::text as "id",
        source_binding_id::text as "sourceBindingId",
        canonical_url as "canonicalUrl",
        observed_at as "observedAt",
        provider_metadata as "metadata"
      from feed_items
      where provider_key = $1
        and status = 'VISIBLE'
        and published_at >= $2
        and published_at < $3
      order by source_binding_id, published_at, id
    `,
    [providerKey, window.start, window.endExclusive],
  );
  return result.rows.map((row) => ({
    ...row,
    metadata: normalizeJsonObject(row.metadata),
  }));
}

async function readSourceObservations(
  pool: Pool,
  date: string,
): Promise<readonly BackfillSourceRow[]> {
  const window = utcDateWindow(date);
  const result = await pool.query<
    Omit<BackfillSourceRow, "metadata"> & { readonly metadata: unknown }
  >(
    `
      select
        si.id::text as "id",
        si.tenant_id::text as "tenantId",
        si.workspace_id::text as "workspaceId",
        sb.interest_id::text as "interestId",
        i.query as "interestQuery",
        si.source_binding_id::text as "sourceBindingId",
        sb.config as "bindingConfig",
        si.provider_item_id as "externalId",
        si.canonical_url as "canonicalUrl",
        si.title,
        si.body,
        si.author_handle as "authorHandle",
        si.published_at as "publishedAt",
        si.observed_at as "observedAt",
        si.metadata
      from source_items si
      join source_bindings sb
        on sb.id = si.source_binding_id
        and sb.tenant_id = si.tenant_id
        and sb.workspace_id = si.workspace_id
      join interests i
        on i.id = sb.interest_id
        and i.tenant_id = sb.tenant_id
        and i.workspace_id = sb.workspace_id
      where si.provider_key = $1
        and si.published_at >= $2
        and si.published_at < $3
        and sb.status = 'ENABLED'
        and sb.deleted_at is null
        and i.status = 'ENABLED'
        and i.deleted_at is null
      order by si.source_binding_id, si.published_at, si.observed_at, si.id
    `,
    [providerKey, window.start, window.endExclusive],
  );

  return result.rows.map((row) => ({
    ...row,
    metadata: normalizeJsonObject(row.metadata),
  }));
}

const groupByBinding = (
  rows: readonly BackfillSourceRow[],
): ReadonlyMap<string, readonly BackfillSourceRow[]> => {
  const grouped = new Map<string, BackfillSourceRow[]>();
  for (const row of rows) {
    const items = grouped.get(row.sourceBindingId) ?? [];
    items.push(row);
    grouped.set(row.sourceBindingId, items);
  }
  return grouped;
};

const rehydrateSourceItem = (row: BackfillSourceRow): SourceItem =>
  SourceItem.rehydrate({
    id: row.id,
    tenantId: tenantId(row.tenantId),
    workspaceId: workspaceId(row.workspaceId),
    sourceBindingId: row.sourceBindingId,
    externalId: row.externalId,
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    body: row.body,
    authorHandle: row.authorHandle ?? undefined,
    publishedAt: row.publishedAt,
    ingestedAt: row.observedAt,
    metadata: row.metadata,
  });

const sourceQuerySnapshot = (
  bindingConfig: unknown,
): { readonly mode: "listing"; readonly query: string } => {
  const config = normalizeJsonObject(bindingConfig);
  const window = config.window;
  return {
    mode: "listing",
    query:
      typeof window === "string" && window.trim().length > 0 ? window : "daily",
  };
};

const printReport = (report: {
  readonly mode: "dry-run" | "apply";
  readonly date: string;
  readonly observations: number;
  readonly selected: number;
  readonly alreadyPresent: number;
  readonly missing: number;
  readonly bindings: number;
  readonly invalidCanonicalRepositories: number;
  readonly projected: number;
}): void => {
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      providerKey,
      ...report,
      rawPostTextPrinted: false,
    }),
  );
};

void main().catch((error: unknown) => {
  const message = redactSensitiveText(
    error instanceof Error ? error.message : "unknown backfill failure",
  );
  console.error(`GitHub Trending feed backfill failed: ${message}`);
  process.exitCode = 1;
});
