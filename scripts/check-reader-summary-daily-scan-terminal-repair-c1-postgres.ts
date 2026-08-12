import { createHash, randomBytes } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import {
  captureDailyScanTerminalRepairPreimageForReview,
  dailyScanTerminalRepairRuntimeRole,
  dailyScanTerminalRepairScope,
  dailyScanTerminalRepairTargets,
  reconcileDailyScanTerminalRepairReceipt,
  repairDailyScanTerminals,
  type DailyScanTerminalRepairReceipt,
  type DailyScanTerminalRepairSqlClient,
  type DailyScanTerminalRepairTargetContract,
} from "./lib/reader-summary-daily-canonical-recovery-v4-scan-terminal-repair";

const schemaOwnerRole = "social_monitor_public_schema_owner";
const capabilityRole = "social_monitor_tenant_system_runtime";
const suffix = randomBytes(8).toString("hex");
const databaseName = `daily_scan_terminal_repair_c1_${suffix}`;
const serverUrl = requiredAdminUrl(process.env);
const targetUrl = databaseUrl(serverUrl, databaseName);
const server = new Pool({ connectionString: serverUrl, min: 0, max: 1 });
const createdRoles: string[] = [];
const addedMemberships: { role: string; member: string }[] = [];
let databaseCreated = false;

const syntheticRedditFailure =
  "fixture reddit terminal failure without provider payload";
const targetContract: DailyScanTerminalRepairTargetContract = Object.freeze({
  hackerNews: dailyScanTerminalRepairTargets.hackerNews,
  reddit: Object.freeze({
    jobId: dailyScanTerminalRepairTargets.reddit.jobId,
    sourceBindingId: dailyScanTerminalRepairTargets.reddit.sourceBindingId,
    failureReasonSha256: sha256(syntheticRedditFailure),
  }),
});

const ids = Object.freeze({
  hackerSource: "00000000-0000-7000-8000-000000000911",
  redditSource: "00000000-0000-7000-8000-000000000912",
  hackerPolicy: "00000000-0000-7000-8000-000000000921",
  redditPolicy: "00000000-0000-7000-8000-000000000922",
  hackerAttempt: "00000000-0000-7000-8000-000000000931",
  redditAttempt: "00000000-0000-7000-8000-000000000932",
  hackerDecision: "00000000-0000-7000-8000-000000000941",
  redditDecision: "00000000-0000-7000-8000-000000000942",
});

const main = async (): Promise<void> => {
  const version = await server.query<{ version: number }>(
    "SELECT current_setting('server_version_num')::integer AS version",
  );
  assert(
    (version.rows[0]?.version ?? 0) >= 180_000,
    "daily scan terminal repair C1 requires disposable PostgreSQL 18+",
  );
  await ensureRole(schemaOwnerRole, false);
  await ensureRole(capabilityRole, false);
  await ensureRole(dailyScanTerminalRepairRuntimeRole, true);
  await ensureMembership(capabilityRole, dailyScanTerminalRepairRuntimeRole);
  await server.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  databaseCreated = true;

  const adminPool = new Pool({ connectionString: targetUrl, min: 0, max: 1 });
  const runtimePool = new Pool({ connectionString: targetUrl, min: 0, max: 1 });
  let admin: PoolClient | undefined;
  let runtime: PoolClient | undefined;
  try {
    admin = await adminPool.connect();
    await installSchema(admin);
    await assertRoleModel(admin);
    runtime = await runtimePool.connect();
    await runtime.query(
      `SET SESSION AUTHORIZATION ${quoteIdentifier(dailyScanTerminalRepairRuntimeRole)}`,
    );
    const client = runtime as unknown as DailyScanTerminalRepairSqlClient;

    await proveSuccessfulRepair(admin, client);
    await proveWrongScopeIsWriteFree(admin, client);
    await provePreimageDriftRollsBack(admin, client);
    await proveCrashReceiptReconciliation(admin, client);
  } finally {
    runtime?.release();
    admin?.release();
    await Promise.all([runtimePool.end(), adminPool.end()]);
  }
  console.log(
    "Reader summary daily scan terminal repair C1 PostgreSQL 18 gate OK",
  );
};

const proveSuccessfulRepair = async (
  admin: PoolClient,
  client: DailyScanTerminalRepairSqlClient,
): Promise<void> => {
  await resetFixture(admin, dailyScanTerminalRepairScope);
  const reviewed = await captureDailyScanTerminalRepairPreimageForReview(
    client,
    targetContract,
  );
  let privateReceipt: DailyScanTerminalRepairReceipt | undefined;
  let discarded = false;
  const receipt = await repairDailyScanTerminals({
    client,
    targetContract,
    reviewedPreimageSha256: reviewed.sha256,
    persistReceiptBeforeCommit: (prepared) => {
      privateReceipt = prepared;
    },
    discardPreparedReceipt: () => {
      discarded = true;
    },
  });
  assert(
    privateReceipt === receipt,
    "private receipt was not staged before COMMIT",
  );
  assert(!discarded, "committed private receipt was discarded");
  assertReceiptIsPrivateAndDigestBound(receipt);
  const mutations = await admin.query<{
    table_name: string;
    operation: string;
  }>(
    "SELECT table_name, operation FROM repair_mutation_audit ORDER BY ordinal",
  );
  assert(
    JSON.stringify(mutations.rows) ===
      JSON.stringify([
        { table_name: "scan_attempts", operation: "UPDATE" },
        { table_name: "scan_jobs", operation: "UPDATE" },
        { table_name: "scan_leases", operation: "DELETE" },
        { table_name: "scan_jobs", operation: "UPDATE" },
      ]),
    "successful repair did not commit the exact four CAS row mutations",
  );
  const rows = await admin.query<{
    target: string;
    job_status: string;
    attempt_status: string;
    lease_count: string;
  }>(readbackSql, [
    targetContract.hackerNews.jobId,
    targetContract.reddit.jobId,
  ]);
  assert(
    rows.rows.length === 2 &&
      rows.rows.every(
        (row) =>
          row.job_status === "FAILED" &&
          row.attempt_status === "FAILED" &&
          row.lease_count === "0",
      ),
    "successful repair did not COMMIT exact terminal readback",
  );
  assert(
    (await reconcileDailyScanTerminalRepairReceipt(
      client,
      receipt,
      targetContract,
    )) === "committed",
    "committed receipt did not reconcile",
  );
};

const proveWrongScopeIsWriteFree = async (
  admin: PoolClient,
  client: DailyScanTerminalRepairSqlClient,
): Promise<void> => {
  const wrongScope = {
    tenantId: "00000000-0000-7000-8000-000000009901",
    workspaceId: "00000000-0000-7000-8000-000000009902",
  };
  await resetFixture(admin, wrongScope);
  const before = await fixtureDigest(admin);
  await expectRejected(
    () =>
      repairDailyScanTerminals({
        client,
        targetContract,
        reviewedPreimageSha256: "a".repeat(64),
        persistReceiptBeforeCommit: () => undefined,
        discardPreparedReceipt: () => undefined,
      }),
    "wrong-scope identical IDs",
  );
  const after = await fixtureDigest(admin);
  assert(before === after, "wrong-scope failure changed fixture rows");
  assert(
    (await mutationCount(admin)) === 0,
    "wrong-scope failure executed UPDATE or DELETE on a row",
  );
  await assertRuntimeHasNoOpenTransaction(admin);
};

const provePreimageDriftRollsBack = async (
  admin: PoolClient,
  client: DailyScanTerminalRepairSqlClient,
): Promise<void> => {
  await resetFixture(admin, dailyScanTerminalRepairScope);
  const reviewed = await captureDailyScanTerminalRepairPreimageForReview(
    client,
    targetContract,
  );
  await admin.query(
    "UPDATE scan_jobs SET created_at=created_at + interval '1 second' WHERE id=$1::uuid",
    [targetContract.hackerNews.jobId],
  );
  await admin.query("TRUNCATE repair_mutation_audit RESTART IDENTITY");
  const before = await fixtureDigest(admin);
  let discarded = false;
  await expectRejected(
    () =>
      repairDailyScanTerminals({
        client,
        targetContract,
        reviewedPreimageSha256: reviewed.sha256,
        persistReceiptBeforeCommit: () => undefined,
        discardPreparedReceipt: () => {
          discarded = true;
        },
      }),
    "preimage drift",
  );
  assert(discarded, "preimage drift did not discard the prepared receipt path");
  assert(
    before === (await fixtureDigest(admin)),
    "preimage drift changed rows",
  );
  assert(
    (await mutationCount(admin)) === 0,
    "preimage drift reached a CAS row",
  );
  await assertRuntimeHasNoOpenTransaction(admin);
};

const proveCrashReceiptReconciliation = async (
  admin: PoolClient,
  client: DailyScanTerminalRepairSqlClient,
): Promise<void> => {
  await resetFixture(admin, dailyScanTerminalRepairScope);
  const reviewed = await captureDailyScanTerminalRepairPreimageForReview(
    client,
    targetContract,
  );
  const receipt = await repairDailyScanTerminals({
    client,
    targetContract,
    reviewedPreimageSha256: reviewed.sha256,
    persistReceiptBeforeCommit: () => undefined,
    discardPreparedReceipt: () => undefined,
  });
  assert(
    (await reconcileDailyScanTerminalRepairReceipt(
      client,
      receipt,
      targetContract,
    )) === "committed",
    "crash receipt did not classify committed state",
  );

  await resetFixture(admin, dailyScanTerminalRepairScope);
  assert(
    (await reconcileDailyScanTerminalRepairReceipt(
      client,
      receipt,
      targetContract,
    )) === "not_committed",
    "crash receipt did not classify exact preimage state",
  );

  await admin.query(
    "UPDATE scan_jobs SET created_at=created_at + interval '2 seconds' WHERE id=$1::uuid",
    [targetContract.reddit.jobId],
  );
  await expectRejected(
    () =>
      reconcileDailyScanTerminalRepairReceipt(client, receipt, targetContract),
    "crash receipt drift",
  );
  const tampered = {
    ...receipt,
    restoreEvidenceSha256: "0".repeat(64),
  } as DailyScanTerminalRepairReceipt;
  await expectRejected(
    () =>
      reconcileDailyScanTerminalRepairReceipt(client, tampered, targetContract),
    "tampered crash receipt hash",
  );
  await assertRuntimeHasNoOpenTransaction(admin);
};

const installSchema = async (admin: PoolClient): Promise<void> => {
  await admin.query(`CREATE EXTENSION pgcrypto;
    ALTER SCHEMA public OWNER TO ${quoteIdentifier(schemaOwnerRole)};
    SET ROLE ${quoteIdentifier(schemaOwnerRole)};
    ${schemaSql}
    ${auditSql}
    RESET ROLE;
    GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(capabilityRole)};
    GRANT SELECT, UPDATE ON public.source_catalog_entries
      TO ${quoteIdentifier(capabilityRole)};
    GRANT SELECT ON
      ${tenantTables.map((table) => `public.${table}`).join(",\n      ")}
      TO ${quoteIdentifier(capabilityRole)};
    GRANT INSERT, UPDATE, DELETE ON
      ${tenantTables.map((table) => `public.${table}`).join(",\n      ")}
      TO ${quoteIdentifier(capabilityRole)};
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;`);
  for (const table of tenantTables) {
    await admin.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_system_scope ON public.${table}
        FOR ALL TO ${quoteIdentifier(capabilityRole)}
        USING (tenant_id=current_setting('social_monitor.tenant_id',true)::uuid
          AND workspace_id=current_setting('social_monitor.workspace_id',true)::uuid
          AND current_setting('social_monitor.system_access',true)='true')
        WITH CHECK (tenant_id=current_setting('social_monitor.tenant_id',true)::uuid
          AND workspace_id=current_setting('social_monitor.workspace_id',true)::uuid
          AND current_setting('social_monitor.system_access',true)='true');`);
  }
};

const resetFixture = async (
  admin: PoolClient,
  scope: Readonly<{ tenantId: string; workspaceId: string }>,
): Promise<void> => {
  await admin.query(`TRUNCATE
    repair_mutation_audit, scan_failure_queue_entries,
    github_repository_trend_candidates, github_repository_trend_results,
    source_item_engagement_observations, source_items, feed_items,
    inbox_records, outbox_events, idempotency_keys, cursor_checkpoints,
    scan_scheduler_decisions, scan_leases, scan_attempts, scan_jobs,
    scan_policies, source_bindings, source_catalog_entries
    RESTART IDENTITY CASCADE`);
  await admin.query(
    renderFixtureSql([
      scope.tenantId,
      scope.workspaceId,
      ids.hackerSource,
      ids.redditSource,
      targetContract.hackerNews.sourceBindingId,
      targetContract.reddit.sourceBindingId,
      ids.hackerPolicy,
      ids.redditPolicy,
      targetContract.hackerNews.jobId,
      targetContract.reddit.jobId,
      ids.hackerAttempt,
      ids.redditAttempt,
      syntheticRedditFailure,
      targetContract.hackerNews.leaseId,
      ids.hackerDecision,
      ids.redditDecision,
    ]),
  );
};

const assertRoleModel = async (admin: PoolClient): Promise<void> => {
  const result = await admin.query<{ safe: boolean }>(
    `SELECT
    app.rolcanlogin AND NOT app.rolsuper AND NOT app.rolbypassrls
      AND app.rolinherit AND NOT capability.rolcanlogin
      AND NOT capability.rolsuper AND NOT capability.rolbypassrls
      AND membership.admin_option=false AS safe
    FROM pg_roles app
    JOIN pg_auth_members membership ON membership.member=app.oid
    JOIN pg_roles capability ON capability.oid=membership.roleid
    WHERE app.rolname=$1 AND capability.rolname=$2`,
    [dailyScanTerminalRepairRuntimeRole, capabilityRole],
  );
  assert(
    result.rows.length === 1 && result.rows[0]?.safe,
    "runtime role model is unsafe",
  );
  const policies = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
    FROM pg_policy policy JOIN pg_class relation ON relation.oid=policy.polrelid
    WHERE relation.relname=ANY($1::text[])`,
    [tenantTables],
  );
  assert(
    policies.rows[0]?.count === String(tenantTables.length),
    "tenant RLS policy coverage is incomplete",
  );
  const relations = await admin.query<{ safe: boolean }>(
    `SELECT bool_and(
      owner.rolname=$1
      AND relation.relrowsecurity AND relation.relforcerowsecurity
      AND has_table_privilege($2, relation.oid, 'SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('public', relation.oid, 'SELECT,INSERT,UPDATE,DELETE')
    ) AS safe
    FROM pg_class relation JOIN pg_roles owner ON owner.oid=relation.relowner
    WHERE relation.relname=ANY($3::text[])`,
    [schemaOwnerRole, capabilityRole, tenantTables],
  );
  assert(relations.rows[0]?.safe, "tenant table owner, ACL, or RLS is unsafe");
  const catalog = await admin.query<{ safe: boolean }>(
    `SELECT
      owner.rolname=$1
      AND has_table_privilege($2, relation.oid, 'SELECT,UPDATE')
      AND NOT has_table_privilege($2, relation.oid, 'INSERT,DELETE')
      AND NOT has_table_privilege('public', relation.oid, 'SELECT,INSERT,UPDATE,DELETE')
      AS safe
    FROM pg_class relation JOIN pg_roles owner ON owner.oid=relation.relowner
    WHERE relation.relname='source_catalog_entries'`,
    [schemaOwnerRole, capabilityRole],
  );
  assert(
    catalog.rows[0]?.safe,
    "source catalog owner or lock-capable ACL is unsafe",
  );
};

const assertReceiptIsPrivateAndDigestBound = (
  receipt: DailyScanTerminalRepairReceipt,
): void => {
  assert(receipt.targets.length === 2, "private receipt lost a target");
  const serialized = JSON.stringify(receipt);
  assert(
    serialized.includes("schedulerDecisions") &&
      serialized.includes("source_catalog_entry_id") &&
      serialized.includes(syntheticRedditFailure),
    "private receipt omitted restore evidence",
  );
  const restoreProjection = receipt.targets.map((target) => ({
    target: target.target,
    job: target.before.job,
    attempt: target.before.attempt,
    lease: target.before.lease,
  }));
  assert(
    stableSha256(restoreProjection) === receipt.restoreEvidenceSha256,
    "private receipt restore digest is not bound to the preimage",
  );
};

const fixtureDigest = async (admin: PoolClient): Promise<string> => {
  const result = await admin.query<{
    state: unknown;
  }>(`SELECT jsonb_build_object(
    'jobs',(SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM scan_jobs row),
    'attempts',(SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM scan_attempts row),
    'leases',(SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM scan_leases row)
  ) AS state`);
  return stableSha256(result.rows[0]?.state);
};
const mutationCount = async (admin: PoolClient): Promise<number> =>
  Number(
    (
      await admin.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM repair_mutation_audit",
      )
    ).rows[0]?.count ?? "-1",
  );
const assertRuntimeHasNoOpenTransaction = async (
  admin: PoolClient,
): Promise<void> => {
  const state = await admin.query<{ state: string | null }>(
    `SELECT state
    FROM pg_stat_activity WHERE datname=current_database() AND usename=$1`,
    [dailyScanTerminalRepairRuntimeRole],
  );
  assert(
    state.rows.every((row) => row.state === "idle"),
    "repair failure left the runtime transaction open",
  );
};

const tenantTables = [
  "source_bindings",
  "scan_policies",
  "scan_jobs",
  "scan_attempts",
  "scan_leases",
  "scan_scheduler_decisions",
  "scan_failure_queue_entries",
  "github_repository_trend_candidates",
  "github_repository_trend_results",
  "source_item_engagement_observations",
  "source_items",
  "feed_items",
  "outbox_events",
  "inbox_records",
  "idempotency_keys",
  "cursor_checkpoints",
] as const;

const schemaSql = `
  CREATE TABLE source_catalog_entries (
    id uuid PRIMARY KEY, provider_key text NOT NULL, display_name text NOT NULL
  );
  CREATE TABLE source_bindings (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    source_catalog_entry_id uuid NOT NULL REFERENCES source_catalog_entries(id),
    status text NOT NULL, config jsonb NOT NULL, created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  );
  CREATE TABLE scan_policies (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    source_binding_id uuid NOT NULL REFERENCES source_bindings(id),
    next_run_at timestamptz NOT NULL, retry_budget integer NOT NULL,
    created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
  );
  CREATE TABLE scan_jobs (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    source_binding_id uuid NOT NULL REFERENCES source_bindings(id),
    scan_policy_id uuid NOT NULL REFERENCES scan_policies(id), status text NOT NULL,
    retry_count integer NOT NULL, idempotency_key text NOT NULL,
    requested_at timestamptz NOT NULL, leased_until timestamptz,
    completed_at timestamptz, failure_reason text, failure_metadata jsonb,
    execution_metadata jsonb, created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  );
  CREATE TABLE scan_attempts (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    scan_job_id uuid NOT NULL REFERENCES scan_jobs(id),
    source_binding_id uuid NOT NULL REFERENCES source_bindings(id),
    status text NOT NULL, attempt_number integer NOT NULL, fetched integer NOT NULL,
    inserted integer NOT NULL, skipped_duplicates integer NOT NULL,
    projected integer NOT NULL, started_at timestamptz NOT NULL,
    finished_at timestamptz, failure_reason text,
    created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
  );
  CREATE TABLE scan_leases (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    scan_job_id uuid NOT NULL REFERENCES scan_jobs(id), worker_id text NOT NULL,
    fencing_token bigint NOT NULL, acquired_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
  );
  CREATE TABLE scan_scheduler_decisions (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    scan_job_id uuid NOT NULL REFERENCES scan_jobs(id), outcome text NOT NULL,
    decided_at timestamptz NOT NULL
  );
  CREATE TABLE scan_failure_queue_entries (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    scan_job_id uuid NOT NULL
  );
  CREATE TABLE github_repository_trend_candidates (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    scan_job_id uuid NOT NULL
  );
  CREATE TABLE github_repository_trend_results (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    scan_job_id uuid NOT NULL
  );
  CREATE TABLE source_item_engagement_observations (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    scan_job_id uuid NOT NULL
  );
  CREATE TABLE source_items (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    source_binding_id uuid NOT NULL, observed_at timestamptz NOT NULL
  );
  CREATE TABLE feed_items (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    source_binding_id uuid NOT NULL, observed_at timestamptz NOT NULL
  );
  CREATE TABLE outbox_events (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    payload jsonb NOT NULL
  );
  CREATE TABLE inbox_records (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    event_id uuid NOT NULL REFERENCES outbox_events(id)
  );
  CREATE TABLE idempotency_keys (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    key text NOT NULL, response_payload jsonb
  );
  CREATE TABLE cursor_checkpoints (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
    source_binding_id uuid NOT NULL, updated_at timestamptz NOT NULL
  );`;

const auditSql = `
  CREATE TABLE repair_mutation_audit (
    ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name text NOT NULL, operation text NOT NULL
  );
  CREATE FUNCTION record_repair_mutation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
  BEGIN
    INSERT INTO public.repair_mutation_audit(table_name,operation)
    VALUES (TG_TABLE_NAME,TG_OP);
    RETURN COALESCE(NEW,OLD);
  END $$;
  CREATE TRIGGER audit_scan_jobs AFTER UPDATE OR DELETE ON scan_jobs
    FOR EACH ROW EXECUTE FUNCTION record_repair_mutation();
  CREATE TRIGGER audit_scan_attempts AFTER UPDATE OR DELETE ON scan_attempts
    FOR EACH ROW EXECUTE FUNCTION record_repair_mutation();
  CREATE TRIGGER audit_scan_leases AFTER UPDATE OR DELETE ON scan_leases
    FOR EACH ROW EXECUTE FUNCTION record_repair_mutation();`;

const fixtureSql = `
  INSERT INTO source_catalog_entries(id,provider_key,display_name) VALUES
    ($3::uuid,'hacker-news','Hacker News'),($4::uuid,'reddit','Reddit');
  INSERT INTO source_bindings(id,tenant_id,workspace_id,source_catalog_entry_id,status,config,created_at,updated_at) VALUES
    ($5::uuid,$1::uuid,$2::uuid,$3::uuid,'ACTIVE','{}','2026-08-11T08:00:00Z','2026-08-11T08:00:00Z'),
    ($6::uuid,$1::uuid,$2::uuid,$4::uuid,'ACTIVE','{}','2026-08-11T08:00:00Z','2026-08-11T08:00:00Z');
  INSERT INTO scan_policies(id,tenant_id,workspace_id,source_binding_id,next_run_at,retry_budget,created_at,updated_at) VALUES
    ($7::uuid,$1::uuid,$2::uuid,$5::uuid,'2026-08-11T12:00:00Z',0,'2026-08-11T08:00:00Z','2026-08-11T08:00:00Z'),
    ($8::uuid,$1::uuid,$2::uuid,$6::uuid,'2026-08-11T12:00:00Z',0,'2026-08-11T08:00:00Z','2026-08-11T08:00:00Z');
  INSERT INTO scan_jobs(id,tenant_id,workspace_id,source_binding_id,scan_policy_id,status,retry_count,idempotency_key,requested_at,leased_until,completed_at,failure_reason,failure_metadata,execution_metadata,created_at,updated_at) VALUES
    ($9::uuid,$1::uuid,$2::uuid,$5::uuid,$7::uuid,'ENQUEUED',0,'fixture-hacker','2026-08-11T09:00:00Z','2026-08-11T10:00:00Z',NULL,NULL,NULL,NULL,'2026-08-11T09:00:00Z','2026-08-11T09:00:00Z'),
    ($10::uuid,$1::uuid,$2::uuid,$6::uuid,$8::uuid,'REQUESTED',0,'fixture-reddit','2026-08-11T09:00:00Z',NULL,NULL,NULL,NULL,NULL,'2026-08-11T09:00:00Z','2026-08-11T09:00:00Z');
  INSERT INTO scan_attempts(id,tenant_id,workspace_id,scan_job_id,source_binding_id,status,attempt_number,fetched,inserted,skipped_duplicates,projected,started_at,finished_at,failure_reason,created_at,updated_at) VALUES
    ($11::uuid,$1::uuid,$2::uuid,$9::uuid,$5::uuid,'RUNNING',1,0,0,0,0,'2026-08-11T09:01:00Z',NULL,NULL,'2026-08-11T09:01:00Z','2026-08-11T09:01:00Z'),
    ($12::uuid,$1::uuid,$2::uuid,$10::uuid,$6::uuid,'FAILED',1,0,0,0,0,'2026-08-11T09:01:00Z','2026-08-11T09:02:00Z',$13::text,'2026-08-11T09:01:00Z','2026-08-11T09:02:00Z');
  INSERT INTO scan_leases(id,tenant_id,workspace_id,scan_job_id,worker_id,fencing_token,acquired_at,expires_at) VALUES
    ($14::uuid,$1::uuid,$2::uuid,$9::uuid,'fixture-worker',7,'2026-08-11T09:01:00Z','2026-08-11T10:00:00Z');
  INSERT INTO scan_scheduler_decisions(id,tenant_id,workspace_id,scan_job_id,outcome,decided_at) VALUES
    ($15::uuid,$1::uuid,$2::uuid,$9::uuid,'DISPATCH','2026-08-11T09:00:00Z'),
    ($16::uuid,$1::uuid,$2::uuid,$10::uuid,'DISPATCH','2026-08-11T09:00:00Z');`;

const readbackSql = `SELECT
  CASE WHEN job.id=$1::uuid THEN 'hacker_news' ELSE 'reddit' END AS target,
  job.status AS job_status, attempt.status AS attempt_status,
  (SELECT count(*)::text FROM scan_leases lease WHERE lease.scan_job_id=job.id) AS lease_count
  FROM scan_jobs job JOIN scan_attempts attempt ON attempt.scan_job_id=job.id
  WHERE job.id IN ($1::uuid,$2::uuid) ORDER BY target`;

const renderFixtureSql = (values: readonly string[]): string => {
  let rendered = fixtureSql;
  for (let index = values.length; index > 0; index -= 1) {
    rendered = rendered.replaceAll(
      `$${index}`,
      quoteLiteral(values[index - 1]!),
    );
  }
  return rendered;
};
const quoteLiteral = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`;

const ensureRole = async (role: string, login: boolean): Promise<void> => {
  const existing = await server.query<{ present: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1) AS present",
    [role],
  );
  if (existing.rows[0]?.present) return;
  await server.query(`CREATE ROLE ${quoteIdentifier(role)} ${login ? "LOGIN" : "NOLOGIN"}
    NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`);
  createdRoles.push(role);
};
const ensureMembership = async (
  role: string,
  member: string,
): Promise<void> => {
  const existing = await server.query<{ present: boolean }>(
    `SELECT EXISTS(
    SELECT 1 FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid=membership.roleid
    JOIN pg_roles grantee ON grantee.oid=membership.member
    WHERE granted.rolname=$1 AND grantee.rolname=$2) AS present`,
    [role, member],
  );
  if (existing.rows[0]?.present) return;
  await server.query(
    `GRANT ${quoteIdentifier(role)} TO ${quoteIdentifier(member)}`,
  );
  addedMemberships.push({ role, member });
};
const expectRejected = async (
  operation: () => Promise<unknown>,
  label: string,
): Promise<void> => {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`${label} did not fail closed`);
};
const stableSha256 = (value: unknown): string =>
  sha256(
    JSON.stringify(value, (_key, item) =>
      item !== null && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
          )
        : item,
    ),
  );
function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;
function databaseUrl(input: string, database: string): string {
  const value = new URL(input);
  value.pathname = `/${database}`;
  return value.toString();
}
function requiredAdminUrl(env: NodeJS.ProcessEnv): string {
  const value = env.READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL?.trim();
  if (!value)
    throw new Error(
      "READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL is required; the PostgreSQL 18 gate never skips",
    );
  return value;
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const cleanup = async (): Promise<void> => {
  if (databaseCreated) {
    await server
      .query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
        [databaseName],
      )
      .catch(() => undefined);
    await server
      .query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`)
      .catch(() => undefined);
  }
  for (const membership of addedMemberships.reverse()) {
    await server
      .query(
        `REVOKE ${quoteIdentifier(membership.role)} FROM ${quoteIdentifier(membership.member)}`,
      )
      .catch(() => undefined);
  }
  for (const role of createdRoles.reverse()) {
    await server
      .query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`)
      .catch(() => undefined);
  }
  await server.end();
};

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(cleanup);
