import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaFeedConnection } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-connection";
import { PrismaFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import type { PrismaFeedClient } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-client";
import { defaultPostgresRuntimePoolConfig, runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { loadPrismaRuntimeClient } from "@social-monitor/platform-persistence/prisma-runtime-client";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { guardRootClientDuringInteractiveTransaction } from "../libs/platform/persistence/src/postgres-runtime-pool-transaction-guard";
import { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { PrismaSourceEngagementProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter";

const tenant = "00000000-0000-7000-8000-000000000901";
const workspace = "00000000-0000-7000-8000-000000000902";
const otherWorkspace = "00000000-0000-7000-8000-000000000912";
const interest = "00000000-0000-7000-8000-000000000903";
const otherInterest = "00000000-0000-7000-8000-000000000904";
const otherWorkspaceInterest = "00000000-0000-7000-8000-000000000913";
const noiseInterest = "00000000-0000-7000-8000-000000000914";
const binding = "00000000-0000-7000-8000-000000000905";
const start = new Date("2026-08-18T00:00:00.000Z");
const end = new Date("2026-08-20T00:00:00.000Z");
const cutoff = new Date("2026-08-19T12:00:00.123Z");

async function main(): Promise<void> {
  const fixtureDatabaseUrl = requiredEnvironment(
    "FEED_PROMOTION_FIXTURE_DATABASE_URL",
  );
  const runtimeDatabaseUrl = requiredEnvironment("DATABASE_URL");
  assert(
    fixtureDatabaseUrl !== runtimeDatabaseUrl,
    "feed promotion fixture and runtime database URLs must be distinct",
  );
  const fixturePool = new Pool({
    connectionString: fixtureDatabaseUrl,
    min: 0,
    max: 1,
  });
  const runtimePool = new Pool({
    connectionString: runtimeDatabaseUrl,
    min: 0,
    max: 1,
  });
  const connection = await PrismaFeedConnection.create(
    defaultPostgresRuntimePoolConfig(runtimeDatabaseUrl, "admin-tool"),
  );
  try {
    await assertPostgres184(fixturePool);
    await seedProductionGraph(fixturePool);
    await assertRuntimeRoleBoundary(fixturePool, runtimePool);
    const repository = new PrismaFeedItemReadRepository(connection);
    await assertMicrosecondPagingAndCutoff(fixturePool, repository);
    await assertScopesAndPolicies(repository);
    await assertSelectivePublishedNoise(fixturePool, repository);
    await assertExactCeilings(fixturePool, repository);
    await assertRepeatableReadMutation(fixturePool, connection);
    await assertProductionPlans(runtimePool, fixturePool);
    await assertEngagementSnapshotRefreshPostgres({
      fixturePool, runtimeDatabaseUrl, tenant, workspace, binding,
    });
    console.log("feed_promotion_production_postgres=ok repository=PrismaFeedItemReadRepository");
  } finally {
    await connection.close();
    await runtimePool.end();
    await fixturePool.end();
  }
}

const assertPostgres184 = async (pool: Pool): Promise<void> => {
  const result = await pool.query<{ readonly version: string; readonly number: string }>(
    "SELECT version(), current_setting('server_version_num') AS number",
  );
  const row = result.rows[0];
  if (!row?.version.startsWith("PostgreSQL 18.4") || Number(row.number) < 180_004 ||
      /cockroach|yugabyte/iu.test(row.version)) {
    throw new Error(`Pinned native PostgreSQL 18.4 required; received ${row?.version}`);
  }
};

const seedProductionGraph = async (pool: Pool): Promise<void> => {
  await pool.query(
    `
    INSERT INTO tenants (id, slug, name, created_at, updated_at)
    VALUES ($1, 'promotion-ci', 'Promotion CI', now(), now())
      ON CONFLICT (id) DO NOTHING
    `,
    [tenant],
  );
  await pool.query(
    `
    INSERT INTO workspaces (id, tenant_id, slug, name, created_at, updated_at) VALUES
      ($2, $1, 'promotion-main', 'Promotion Main', now(), now()),
      ($3, $1, 'promotion-other', 'Promotion Other', now(), now())
      ON CONFLICT (id) DO NOTHING
    `,
    [tenant, workspace, otherWorkspace],
  );
  await pool.query(
    `
    INSERT INTO interests
      (id, tenant_id, workspace_id, name, query, created_at, updated_at) VALUES
      ($3, $1, $2, 'Promotion', 'promotion', now(), now()),
      ($4, $1, $2, 'Other', 'other', now(), now()),
      ($5, $1, $2, 'Noise', 'noise', now(), now()),
      ($7, $1, $6, 'Other workspace', 'other-workspace', now(), now())
      ON CONFLICT (id) DO NOTHING
    `,
    [
      tenant,
      workspace,
      interest,
      otherInterest,
      noiseInterest,
      otherWorkspace,
      otherWorkspaceInterest,
    ],
  );
  await pool.query("DELETE FROM feed_items WHERE tenant_id = $1", [tenant]);
  await pool.query("DELETE FROM source_items WHERE tenant_id = $1", [tenant]);
  await seedRows(pool, { label: "micro", count: 405, provider: "reddit",
    workspace, interest, base: "2026-08-19T12:00:00.122999Z", step: "1 microsecond" });
  await pool.query(`
    UPDATE feed_items SET
      published_at = CASE
        WHEN dedupe_key = 'micro-198' THEN '2026-08-19T12:00:00.122800Z'::timestamptz
        WHEN dedupe_key = 'micro-200' THEN '2026-08-19T12:00:00.122798Z'::timestamptz
        ELSE published_at END,
      observed_at = CASE
      WHEN dedupe_key = 'micro-198' THEN '2026-08-19T12:00:00.122800Z'::timestamptz
      WHEN dedupe_key = 'micro-403' THEN '2026-08-19T12:00:00.122999Z'::timestamptz
      WHEN dedupe_key = 'micro-404' THEN '2026-08-19T12:00:00.123000Z'::timestamptz
      WHEN dedupe_key = 'micro-405' THEN '2026-08-19T12:00:00.123001Z'::timestamptz
      ELSE observed_at END
    WHERE tenant_id = $1 AND dedupe_key LIKE 'micro-%'
  `, [tenant]);
  await seedRows(pool, { label: "other-interest", count: 3, provider: "reddit",
    workspace, interest: otherInterest, base: "2026-08-19T11:00:00Z", step: "1 second" });
  await seedRows(pool, { label: "other-workspace", count: 3, provider: "reddit",
    workspace: otherWorkspace, interest: otherWorkspaceInterest,
    base: "2026-08-19T11:00:00Z", step: "1 second" });
};

const assertRuntimeRoleBoundary = async (
  fixturePool: Pool,
  runtimePool: Pool,
): Promise<void> => {
  const fixtureIdentity = await fixturePool.query<{ readonly role: string }>(
    "SELECT current_user AS role",
  );
  const client = await runtimePool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('social_monitor.tenant_id', $1, true),
              set_config('social_monitor.workspace_id', $2, true),
              set_config('social_monitor.system_access', 'false', true)`,
      [tenant, workspace],
    );
    const boundary = await client.query<{
      readonly bypass_rls: boolean;
      readonly can_create: boolean;
      readonly fixture_rows: string;
      readonly other_workspace_rows: string;
      readonly role: string;
      readonly superuser: boolean;
      readonly system_access: string;
    }>(`SELECT current_user AS role,
               role.rolsuper AS superuser,
               role.rolbypassrls AS bypass_rls,
               current_setting('social_monitor.system_access') AS system_access,
               has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
               (SELECT count(*) FROM feed_items WHERE tenant_id = $1) AS fixture_rows,
               (SELECT count(*) FROM feed_items WHERE tenant_id = $1
                  AND workspace_id = $2) AS other_workspace_rows
          FROM pg_roles role
         WHERE role.rolname = current_user`, [tenant, otherWorkspace]);
    const row = boundary.rows[0];
    assert(
      row !== undefined &&
        row.role !== fixtureIdentity.rows[0]?.role &&
        row.superuser === false &&
        row.bypass_rls === false &&
        row.system_access === "false" &&
        row.can_create === false &&
        Number(row.fixture_rows) > 0 &&
        row.other_workspace_rows === "0",
      `feed promotion repository runtime must be restricted by tenant/workspace RLS: ${JSON.stringify(row)}`,
    );
    const forbiddenWrite = await client.query(
      `UPDATE feed_items SET title = title
        WHERE tenant_id = $1 AND workspace_id = $2
        RETURNING id`,
      [tenant, otherWorkspace],
    );
    assert(
      forbiddenWrite.rowCount === 0,
      "feed promotion runtime crossed its workspace boundary during UPDATE",
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const seedRows = async (pool: Pool, params: {
  readonly label: string; readonly count: number; readonly provider: "reddit" | "rss";
  readonly workspace: string; readonly interest: string; readonly base: string;
  readonly step: string;
}): Promise<void> => {
  await pool.query(`
    WITH rows AS (
      SELECT value, md5($1 || '-source-' || value)::uuid AS source_id,
        md5($1 || '-feed-' || value)::uuid AS feed_id,
        $6::timestamptz - value * $7::interval AS event_at
      FROM generate_series(1, $5::integer) AS value
    ), sources AS (
      INSERT INTO source_items (id, tenant_id, workspace_id, source_binding_id,
        provider_key, provider_item_id, canonical_url, title, body, published_at,
        content_hash, observed_at, metadata)
      SELECT source_id, $2::uuid, $3::uuid, $8::uuid, $9, $1 || '-' || value,
        'https://example.test/' || $1 || '/' || value, $1 || ' ' || value,
        'production repository fixture', event_at, md5(value::text), event_at, '{}'::jsonb
      FROM rows RETURNING id
    )
    INSERT INTO feed_items (id, tenant_id, workspace_id, interest_id, source_item_id,
      source_binding_id, provider_key, dedupe_key, canonical_url, title, body_preview,
      published_at, observed_at, provider_metadata, status, created_at, updated_at)
    SELECT feed_id, $2::uuid, $3::uuid, $4::uuid, source_id, $8::uuid, $9,
      $1 || '-' || value, 'https://example.test/' || $1 || '/' || value,
      $1 || ' ' || value, 'production repository fixture', event_at, event_at,
      CASE WHEN $9 = 'reddit' THEN jsonb_build_object(
        'kind', 'reddit_post', 'score', 50, 'comments', value) ELSE '{}'::jsonb END,
      'VISIBLE'::"FeedItemStatus", now(), now()
    FROM rows
  `, [params.label, tenant, params.workspace, params.interest, params.count,
    params.base, params.step, binding, params.provider]);
};

const assertMicrosecondPagingAndCutoff = async (
  pool: Pool,
  repository: PrismaFeedItemReadRepository,
): Promise<void> => {
  for (const timestampPolicy of ["published_at", "observed_at"] as const) {
    const result = await repository.readPromotionSnapshot(query(timestampPolicy, interest));
    assert(result.ok, `${timestampPolicy} microsecond scan failed`);
    const ids = result.candidates.map((candidate) => candidate.item.toSnapshot().id);
    assert(ids.length === 404,
      `${timestampPolicy} did not scan every exact page once: ${ids.length}`);
    assert(new Set(ids).size === ids.length, `${timestampPolicy} duplicated a page-boundary row`);
    const exact = await pool.query<{ readonly id: string; readonly observed_at: string }>(`
      SELECT id::text, to_char(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS observed_at
      FROM feed_items WHERE tenant_id = $1 AND dedupe_key IN ('micro-403','micro-404','micro-405')
      ORDER BY observed_at
    `, [tenant]);
    const byTimestamp = new Map(exact.rows.map((row) => [row.observed_at, row.id]));
    assert(ids.includes(requiredMap(byTimestamp, "2026-08-19 12:00:00.122999")),
      `${timestampPolicy} excluded the row one microsecond below cutoff`);
    assert(ids.includes(requiredMap(byTimestamp, "2026-08-19 12:00:00.123000")),
      `${timestampPolicy} excluded the exact inclusive cutoff`);
    const boundaryId = requiredMap(byTimestamp, "2026-08-19 12:00:00.123000");
    const boundary = result.candidates.find((candidate) =>
      candidate.item.toSnapshot().id === boundaryId);
    assert(boundary?.exactTimestamps?.observedAt ===
      "2026-08-19T12:00:00.123000Z",
    `${timestampPolicy} rounded the exact cutoff before promotion policy`);
    assert(!ids.includes(requiredMap(byTimestamp, "2026-08-19 12:00:00.123001")),
      `${timestampPolicy} included the row one microsecond above cutoff`);
    const tied = await pool.query<{ readonly id: string }>(`
      SELECT id::text FROM feed_items WHERE tenant_id=$1
        AND dedupe_key = ANY($2::text[])
    `, [tenant, timestampPolicy === "published_at"
      ? ["micro-200", "micro-201"]
      : ["micro-198", "micro-199"]]);
    assert(tied.rows.length === 2 && tied.rows.every((row) => ids.includes(row.id)),
      `${timestampPolicy} skipped an id-ordered row across a tied timestamp page boundary`);
  }
};

const assertScopesAndPolicies = async (repository: PrismaFeedItemReadRepository): Promise<void> => {
  for (const policy of ["published_at", "observed_at"] as const) {
    const scoped = await repository.readPromotionSnapshot(query(policy, interest));
    const workspaceScoped = await repository.readPromotionSnapshot(query(policy));
    assert(scoped.ok && workspaceScoped.ok, `${policy} scope scan failed`);
    assert(workspaceScoped.physicalRowsRead === scoped.physicalRowsRead + 3,
      `${policy} interest/workspace scope was not enforced`);
  }
};

const assertSelectivePublishedNoise = async (
  pool: Pool,
  repository: PrismaFeedItemReadRepository,
): Promise<void> => {
  await seedRows(pool, { label: "selective-noise", count: 401, provider: "rss",
    workspace, interest: noiseInterest, base: "2026-08-19T11:59:00Z", step: "1 millisecond" });
  await pool.query(`UPDATE feed_items SET observed_at=$2::timestamptz + interval '1 microsecond'
    WHERE tenant_id=$1 AND dedupe_key LIKE 'selective-noise-%'`, [tenant, cutoff]);
  await seedRows(pool, { label: "selective-eligible", count: 1, provider: "reddit",
    workspace, interest: noiseInterest, base: "2026-08-19T10:00:00Z", step: "1 millisecond" });
  const result = await repository.readPromotionSnapshot(
    query("published_at", noiseInterest),
  );
  assert(result.ok && result.physicalRowsRead === 402 &&
    result.candidates.length === 1,
    "published policy did not visit more-than-page post-cutoff noise before eligibility");
  const observed = await repository.readPromotionSnapshot(
    query("observed_at", noiseInterest),
  );
  assert(observed.ok && observed.physicalRowsRead === 1 &&
    observed.candidates.length === 1,
    "observed policy did not use its exact cutoff as an ordering-key bound");
};

const assertExactCeilings = async (
  pool: Pool,
  repository: PrismaFeedItemReadRepository,
): Promise<void> => {
  await pool.query("UPDATE feed_items SET status='HIDDEN' WHERE tenant_id=$1 AND interest_id=$2", [
    tenant, otherInterest,
  ]);
  await seedRows(pool, { label: "physical", count: 100_001, provider: "rss",
    workspace, interest: otherInterest, base: "2026-08-19T10:00:00Z", step: "1 millisecond" });
  await pool.query(`UPDATE feed_items SET observed_at=$2::timestamptz + interval '1 microsecond'
    WHERE tenant_id=$1 AND dedupe_key LIKE 'physical-%'`, [tenant, cutoff]);
  const postCutoff = await repository.readPromotionSnapshot(
    query("published_at", otherInterest),
  );
  assert(!postCutoff.ok && postCutoff.reason === "physical_row_ceiling_exceeded" &&
    postCutoff.physicalRowsRead === 100_001 && postCutoff.eligibleItemCount === 0,
    "published policy did not bound near-ceiling leading post-cutoff noise");
  await pool.query(`UPDATE feed_items SET observed_at=published_at
    WHERE tenant_id=$1 AND dedupe_key LIKE 'physical-%'`, [tenant]);
  for (const policy of ["published_at", "observed_at"] as const) {
    for (const [count, ok] of [[99_999, true], [100_000, true], [100_001, false]] as const) {
      await pool.query(`UPDATE feed_items SET status = CASE WHEN dedupe_key ~ '^physical-' AND
        split_part(dedupe_key, '-', 2)::integer <= $2 THEN 'VISIBLE'::"FeedItemStatus"
        WHEN dedupe_key ~ '^physical-' THEN 'HIDDEN'::"FeedItemStatus" ELSE status END
        WHERE tenant_id = $1`, [tenant, count]);
      const result = await repository.readPromotionSnapshot(query(policy, otherInterest));
      assert(result.ok === ok && result.physicalRowsRead === count,
        `${policy} physical row boundary ${count} was not exact`);
    }
  }
  await pool.query("UPDATE feed_items SET status = 'HIDDEN' WHERE tenant_id = $1 AND dedupe_key LIKE 'physical-%'", [tenant]);
  await seedRows(pool, { label: "eligible", count: 1_001, provider: "reddit",
    workspace, interest: otherInterest, base: "2026-08-19T10:00:00Z", step: "1 millisecond" });
  for (const policy of ["published_at", "observed_at"] as const) {
    let result = await repository.readPromotionSnapshot(query(policy, otherInterest));
    assert(!result.ok && result.reason === "eligible_item_ceiling_exceeded" &&
      result.eligibleItemCount === 1_001,
      `${policy} 1,001 eligible outcome was not rejected`);
    await pool.query("UPDATE feed_items SET status = 'HIDDEN' WHERE tenant_id = $1 AND dedupe_key = 'eligible-1001'", [tenant]);
    result = await repository.readPromotionSnapshot(query(policy, otherInterest));
    assert(result.ok && result.candidates.length === 1_000,
      `${policy} 1,000 eligible outcome was not accepted`);
    await pool.query("UPDATE feed_items SET status = 'VISIBLE' WHERE tenant_id = $1 AND dedupe_key = 'eligible-1001'", [tenant]);
  }
  await pool.query(
    "UPDATE feed_items SET status = 'HIDDEN' WHERE tenant_id = $1 AND dedupe_key LIKE 'eligible-%'",
    [tenant],
  );
};

const assertRepeatableReadMutation = async (
  pool: Pool,
  connection: PrismaFeedConnection,
): Promise<void> => {
  let signalFirstPage: (() => void) | undefined;
  let continueScan: (() => void) | undefined;
  const firstPage = new Promise<void>((resolve) => { signalFirstPage = resolve; });
  const mutationComplete = new Promise<void>((resolve) => { continueScan = resolve; });
  let page = 0;
  const wrapped = {
    feedItem: connection.feedItem,
    feedSignalBaselineSample: connection.feedSignalBaselineSample,
    $transaction: <Result>(operation: (client: PrismaFeedClient) => Promise<Result>, options: {
      readonly isolationLevel: "RepeatableRead" | "Serializable"; readonly timeout?: number;
    }) => connection.$transaction((client) => operation({
      ...client,
      $queryRawUnsafe: client.$queryRawUnsafe?.bind(client),
      feedItem: {
        ...client.feedItem,
        findMany: async (args) => {
          const rows = await client.feedItem.findMany(args);
          page += 1;
          if (page === 1) {
            signalFirstPage?.();
            await mutationComplete;
          }
          return rows;
        },
      },
    }), options),
  } as unknown as PrismaFeedClient;
  const repository = new PrismaFeedItemReadRepository(wrapped);
  const scan = repository.readPromotionSnapshot(query("published_at", interest));
  await firstPage;
  const target = await pool.query<{ readonly id: string; readonly source_item_id: string }>(
    "SELECT id::text, source_item_id::text FROM feed_items WHERE tenant_id=$1 AND dedupe_key='micro-300'", [tenant]);
  assert(target.rows[0] !== undefined, "repeatable-read mutation target is missing");
  const concurrentId = "00000000-0000-7000-8000-000000000999";
  await pool.query(`
    UPDATE feed_items SET canonical_url='https://example.test/concurrent-update',
      provider_metadata='{}'::jsonb WHERE id=$1
  `, [target.rows[0]?.id]);
  await pool.query(
    "UPDATE source_items SET body='concurrent mutable body' WHERE id=$1",
    [target.rows[0]?.source_item_id],
  );
  await pool.query(`
    INSERT INTO feed_items (id, tenant_id, workspace_id, interest_id, source_item_id,
      source_binding_id, provider_key, dedupe_key, canonical_url, title, body_preview,
      published_at, observed_at, provider_metadata, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'reddit', 'concurrent-insert',
      'https://example.test/concurrent-insert', 'concurrent insert', 'bounded',
      '2026-08-19T11:00:00Z', '2026-08-19T11:00:00Z',
      '{"kind":"reddit_post","score":999}'::jsonb, 'VISIBLE', now(), now())
  `, [concurrentId, tenant, workspace, interest,
    target.rows[0]?.source_item_id, binding]);
  continueScan?.();
  const result = await scan;
  assert(result.ok && result.candidates.some((item) => item.item.toSnapshot().id === target.rows[0]?.id),
    "repeatable-read scan mixed a concurrent canonical/engagement update");
  assert(result.ok && !result.candidates.some((item) =>
    item.item.toSnapshot().id === concurrentId),
  "repeatable-read scan included a concurrent insert");
  assert(result.ok && result.sourceContent?.find((item) =>
    item.feedItemId === target.rows[0]?.id)?.body ===
      "production repository fixture",
  "repeatable-read scan hydrated mutable source content after the snapshot");
};

type PrismaQueryEvent = { readonly query: string; readonly params: string };
type QueryCaptureClient = PrismaFeedClient & {
  $on(event: "query", handler: (event: PrismaQueryEvent) => void): void;
  $disconnect(): Promise<void>;
};
type QueryCaptureConstructor = new (args: {
  readonly adapter: PrismaPg;
  readonly log: readonly { readonly emit: "event"; readonly level: "query" }[];
}) => QueryCaptureClient;

const assertProductionPlans = async (
  runtimePool: Pool,
  fixturePool: Pool,
): Promise<void> => {
  await fixturePool.query("ANALYZE feed_items");
  const PrismaClient = loadPrismaRuntimeClient<QueryCaptureConstructor>();
  const rawClient = new PrismaClient({
    adapter: new PrismaPg(runtimePool, { disposeExternalPool: false }),
    log: [{ emit: "event", level: "query" }],
  });
  const client = guardRootClientDuringInteractiveTransaction(rawClient);
  const captured: PrismaQueryEvent[] = [];
  rawClient.$on("query", (event) => {
    if (/FROM\s+"public"\."feed_items"/u.test(event.query) &&
        /AS\s+"cursorTimestamp"/u.test(event.query) &&
        /ORDER BY/u.test(event.query) && /LIMIT/u.test(event.query)) {
      captured.push(event);
    }
  });
  try {
    const repository = new PrismaFeedItemReadRepository(client);
    for (const timestampPolicy of ["published_at", "observed_at"] as const) {
      for (const scope of ["workspace", "interest"] as const) {
        captured.length = 0;
        const result = await repository.readPromotionSnapshot(
          query(timestampPolicy, scope === "interest" ? interest : undefined),
        );
        assert(result.ok, `${timestampPolicy}/${scope} repository plan probe failed`);
        assert(captured.length >= 2,
          `${timestampPolicy}/${scope} did not capture first and subsequent Prisma pages: ${captured.length}`);
        const expected = `feed_items_${scope}_${timestampPolicy === "published_at" ? "published" : "observed"}_keyset_idx`;
        for (const [index, event] of captured.entries()) {
          const values = JSON.parse(event.params) as unknown[];
          const plan = await explainRuntimeQuery(runtimePool, event, values);
          assertBoundedPlan(plan.rows[0]?.["QUERY PLAN"], expected,
            `${timestampPolicy}/${scope}/${index === 0 ? "first" : "subsequent"}`);
        }
      }
    }
  } finally {
    await client.$disconnect();
  }
};

const explainRuntimeQuery = async (
  pool: Pool,
  event: PrismaQueryEvent,
  values: readonly unknown[],
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(
      `SELECT set_config('social_monitor.tenant_id', $1, true),
              set_config('social_monitor.workspace_id', $2, true),
              set_config('social_monitor.system_access', 'false', true)`,
      [tenant, workspace],
    );
    await client.query("SET LOCAL enable_seqscan = off");
    await client.query("SET LOCAL enable_sort = off");
    const plan = await client.query<{ readonly "QUERY PLAN": unknown }>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${event.query}`,
      [...values],
    );
    await client.query("COMMIT");
    return plan;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};


type ExplainNode = {
  readonly [key: string]: unknown;
  readonly Plans?: readonly ExplainNode[];
};

const assertBoundedPlan = (
  raw: unknown,
  expectedIndex: string,
  label: string,
): void => {
  const root = (raw as readonly { readonly Plan?: ExplainNode }[] | undefined)?.[0]?.Plan;
  assert(root !== undefined, `${label} did not return an executable JSON plan`);
  const nodes = flattenPlan(root);
  const text = JSON.stringify(raw);
  assert(text.includes(expectedIndex),
    `${label} did not use ${expectedIndex}: ${text.slice(0, 2_000)}`);
  assert(!nodes.some((node) => node["Node Type"] === "Seq Scan"),
    `${label} used a sequential scan`);
  assert(!nodes.some((node) => node["Node Type"] === "Sort"),
    `${label} sorted instead of reading keyset index order`);
  assert(Number(root["Actual Rows"] ?? 0) <= 200,
    `${label} returned more than one bounded repository page`);
  const indexRows = nodes.filter((node) => String(node["Node Type"]).includes("Index"))
    .reduce((sum, node) => sum + Number(node["Actual Rows"] ?? 0), 0);
  const buffers = Number(root["Shared Hit Blocks"] ?? 0) +
    Number(root["Shared Read Blocks"] ?? 0);
  const removed = nodes.reduce((sum, node) => sum +
    Number(node["Rows Removed by Filter"] ?? 0) +
    Number(node["Rows Removed by Index Recheck"] ?? 0), 0);
  assert(indexRows <= 1_000, `${label} visited ${indexRows} index tuples for a 200-row page`);
  assert(buffers <= 5_000, `${label} consumed ${buffers} shared buffers for a 200-row page`);
  assert(removed <= 1_000, `${label} removed ${removed} residual rows for a 200-row page`);
};

const flattenPlan = (node: ExplainNode): readonly ExplainNode[] => [
  node,
  ...(node.Plans ?? []).flatMap(flattenPlan),
];

const query = (timestampPolicy: "published_at" | "observed_at", interestId?: string) => ({
  tenantId: tenantId(tenant), workspaceId: workspaceId(workspace), interestId,
  timestampPolicy, windowStartedAt: start, windowEndedAt: end, observedThrough: cutoff,
});
const requiredMap = (map: ReadonlyMap<string, string>, key: string): string => {
  const value = map.get(key); if (!value) throw new Error(`Missing microsecond fixture ${key}`); return value;
};
const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value;
};
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertEngagementSnapshotRefreshPostgres(params: {
  readonly fixturePool: Pool;
  readonly runtimeDatabaseUrl: string;
  readonly tenant: string;
  readonly workspace: string;
  readonly binding: string;
}): Promise<void> {
  const database = await params.fixturePool.query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  assert(
    /^reader_summary_publication_test_[0-9a-f]{20}$/.test(database.rows[0]?.name ?? ""),
    "engagement refresh proof requires the disposable publication fixture",
  );
  const connection = await PrismaIngestionWorkerConnection.createForProcess(
    params.runtimeDatabaseUrl, "admin-tool",
  );
  const adapter = new PrismaSourceEngagementProjectionAdapter(connection, {
    generate: randomUUID,
  });
  try {
    for (const provider of ["reddit", "hacker-news"] as const) {
      const sourceItemId = randomUUID();
      const externalId = `engagement-refresh-${provider}`;
      const initialAt = new Date("2026-08-19T12:00:00.000Z");
      const publishedAt = new Date("2026-08-19T11:00:00.000Z");
      await params.fixturePool.query(`
        INSERT INTO source_items (id, tenant_id, workspace_id, source_binding_id,
          provider_key, provider_item_id, canonical_url, title, body, published_at,
          content_hash, observed_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, 'https://example.test/engagement',
          'Engagement fixture', 'Bounded fixture', $7, 'engagement-fixture', $8, '{}')
      `, [sourceItemId, params.tenant, params.workspace, params.binding,
        provider, externalId, publishedAt, initialAt]);
      const scope = {
        tenantId: tenantId(params.tenant),
        workspaceId: workspaceId(params.workspace),
      };
      const project = (observedAt: Date, score: number) =>
        runWithTenantDatabaseAccess(scope, () => adapter.project({
          ...scope,
          sourceBindingId: params.binding,
          scanJobId: randomUUID(),
          providerKey: provider,
          observedAt,
          samples: [{
            externalId, sourceItemId, publishedAt,
            metrics: provider === "reddit" ? { score } : { points: score },
            metricsFingerprint: `${provider}:${score}`,
            providerMetadataPatch: {},
            refreshReadModels: false,
          }],
        }));
      const readSnapshot = () => runWithTenantDatabaseAccess(scope, () =>
        connection.sourceItemEngagementSnapshot.findUnique({
          where: { tenantId_workspaceId_sourceItemId: { ...scope, sourceItemId } },
        }));

      assert((await project(initialAt, 10)).observationsAppended === 1,
        `${provider}: initial observation must be persisted`);
      const initial = await readSnapshot();
      assert(initial !== null, `${provider}: initial snapshot missing`);
      for (const [time, score] of [
        ["2026-08-19T12:01:00.000Z", 10],
        ["2026-08-19T12:02:00.000Z", 12],
      ] as const) {
        const result = await project(new Date(time), score);
        const current = await readSnapshot();
        assert(result.observationsAppended === 0 && result.currentSnapshotsUpdated === 1,
          `${provider}: a pre-cadence refresh must update only the snapshot`);
        assert(current?.firstObservedAt.getTime() === initialAt.getTime() &&
          current.lastObservedAt.toISOString() === time &&
          current.lastObservationAt.getTime() === initial?.lastObservationAt.getTime() &&
          current.nextObservationDueAt.getTime() === initial?.nextObservationDueAt.getTime(),
        `${provider}: repeat refresh changed the original observation or cadence`);
        assert((provider === "reddit" ? current?.score : current?.points) === BigInt(score),
          `${provider}: latest metrics were not refreshed`);
        const expectedChange = score === 10 ? initialAt.toISOString() : time;
        assert(current?.lastChangedAt.toISOString() === expectedChange,
          `${provider}: metric change timestamp is inconsistent`);
      }
      const observations = await params.fixturePool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM source_item_engagement_observations WHERE tenant_id=$1 AND workspace_id=$2 AND source_item_id=$3",
        [params.tenant, params.workspace, sourceItemId],
      );
      assert(observations.rows[0]?.count === "1",
        `${provider}: repeated refresh appended a duplicate observation`);
    }
    console.log("source_engagement_repeat_refresh_postgres=ok unchanged_and_changed=true");
  } finally {
    await connection.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
