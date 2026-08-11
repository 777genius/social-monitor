import type { PoolClient } from "pg";

import {
  assertPostgres as assert,
  assertPostgresDeepEqual as assertDeepEqual,
  assertPostgresRejectsContaining as assertRejectsContaining,
} from "./reader-summary-publication-postgres-assertions";
import {
  readerSummaryPublicationFixtureScope,
  setReaderSummaryPublicationSessionScope,
} from "./reader-summary-publication-postgres-fixture-scope";
import type { ReaderSummaryPublicationRunningFixture } from "./reader-summary-publication-postgres-running-fixture";
import type { EvidenceFixtureOverrides } from "./reader-summary-weekly-publication-evidence-postgres-contract";

type WeeklySealRow = Readonly<{
  outcome: string;
  seal_id: string;
  seal_sha256: string;
  canonical_record: Readonly<Record<string, unknown>>;
}>;
type WeeklyProductionSlotRow = Readonly<{
  outcome: string;
  seal_id: string;
  seal_sha256: string;
  week_started_on: string;
  week_ended_on: string;
  period_started_at: string;
  period_ended_at: string;
  period_timezone: string;
  current_publication_id: string | null;
}>;

type WeeklySealFixtureParams = Readonly<{
  adminClient: PoolClient;
  auditorClient: PoolClient;
  concurrentRuntimeClient: PoolClient;
  runtimeClient: PoolClient;
  runtimeRole: string;
  createFixture(
    status: "COMPLETED" | "NO_SIGNAL",
    day: string,
    overrides?: EvidenceFixtureOverrides & Readonly<{
      requestedAt?: string;
      modelVersion?: string;
    }>,
  ): Promise<ReaderSummaryPublicationRunningFixture>;
  publish(payload: Readonly<Record<string, unknown>>): Promise<string>;
  includeProjectionRevision?: boolean;
}>;

const sealTable = "reader_summary_weekly_certification_seals";
const sealFunction =
  "seal_reader_summary_weekly_certification(uuid,uuid,text,text,date)";
const publicationOwner =
  "social_monitor_reader_summary_publication_owner";
const publicationCapability =
  "social_monitor_reader_summary_publication_runtime";
const weekStartedOn = "2026-06-01";
const weekDates = [
  "2026-06-01",
  "2026-06-02",
  "2026-06-03",
  "2026-06-04",
  "2026-06-05",
  "2026-06-06",
  "2026-06-07",
] as const;
const weekStatuses = [
  "COMPLETED",
  "NO_SIGNAL",
  "COMPLETED",
  "NO_SIGNAL",
  "COMPLETED",
  "NO_SIGNAL",
  "COMPLETED",
] as const;
const productionWeekStartedOn = "2026-07-27";
const productionWeekDates = [
  "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30",
  "2026-07-31", "2026-08-01", "2026-08-02",
] as const;

export const assertReaderSummaryWeeklyCertificationSealPostgresContract =
  async (params: WeeklySealFixtureParams): Promise<void> => {
    await assertSealCatalogContract(params);
    await assertIncompleteWeekFailsClosed(params.runtimeClient);

    for (const [index, requestedUtcDate] of weekDates.entries()) {
      if (params.includeProjectionRevision && requestedUtcDate === "2026-06-02") {
        const superseded = await params.createFixture("COMPLETED", requestedUtcDate, {
          githubEvidenceMode: "historical_unavailable",
          requestedAt: "2026-06-02T09:00:00.000Z",
          modelVersion: "codex:gpt-5.5:xhigh:historical",
        });
        assert(
          (await params.publish(superseded.payload)) === "published",
          "historical daily publication must publish before its verified revision",
        );
      }
      const fixture = await params.createFixture(
        params.includeProjectionRevision && requestedUtcDate === "2026-06-02"
          ? "COMPLETED"
          : weekStatuses[index]!,
        requestedUtcDate,
        params.includeProjectionRevision && requestedUtcDate === "2026-06-02"
          ? {
              githubEvidenceMode: "verified",
              requestedAt: "2026-06-02T10:00:00.000Z",
              modelVersion: "codex:gpt-5.5:xhigh:verified-revision",
            }
          : undefined,
      );
      assert(
        (await params.publish(fixture.payload)) === "published",
        `${requestedUtcDate} must publish before weekly certification`,
      );
    }

    await assertRejectsContaining(
      () => callSealAtDefaultIsolation(params.runtimeClient),
      "writable SERIALIZABLE tenant session",
      "weekly certification must reject READ COMMITTED callers",
    );

    const sealed = await assertSerializableSealRace(params);
    assert(
      sealed.seal_id ===
        `reader_summary.weekly_certification_seal.v1:${sealed.seal_sha256}`,
      "sealId must be the immutable schema-qualified sealSha binding",
    );
    assert(
      /^[0-9a-f]{64}$/.test(sealed.seal_sha256),
      "sealSha must be an exact lowercase SHA-256",
    );

    const replay = await callSeal(params.runtimeClient);
    assertDeepEqual(
      replay,
      { ...sealed, outcome: "replayed" },
      "weekly certification replay must retain immutable sealId and sealSha",
    );

    await assertExactSevenDaySeal(
      params.runtimeClient,
      sealed,
      params.includeProjectionRevision
        ? weekStatuses.map((status, index) =>
            index === 1 ? "COMPLETED" : status)
        : weekStatuses,
    );
    await assertExactProductionSlotPreparation(params);
    await assertTenantVisibility(params.runtimeClient);
    await assertRuntimeWritesDenied(params.runtimeClient);
    await assertPublicationOwnerAppendOnly(params.adminClient, sealed.seal_id);
  };

const assertExactProductionSlotPreparation = async (
  params: WeeklySealFixtureParams,
): Promise<void> => {
  for (const [index, requestedUtcDate] of productionWeekDates.entries()) {
    const fixture = await params.createFixture(
      weekStatuses[index]!,
      requestedUtcDate,
    );
    assert(
      (await params.publish(fixture.payload)) === "published",
      `${requestedUtcDate} must publish before production slot preparation`,
    );
  }
  await assertRejectsContaining(
    () => queryProductionSlot(params.runtimeClient),
    "writable SERIALIZABLE tenant session",
    "weekly production slot preparation must reject READ COMMITTED",
  );

  const prepared = await callProductionSlot(params.runtimeClient);
  assert(
    prepared.outcome === "prepared" &&
      prepared.week_started_on === "2026-07-27" &&
      prepared.week_ended_on === "2026-08-02" &&
      prepared.period_started_at === "2026-07-27T00:00:00.000Z" &&
      prepared.period_ended_at === "2026-08-03T00:00:00.000Z" &&
      prepared.period_timezone === "UTC" &&
      prepared.current_publication_id === null,
    "production preparation must bind the exact Jul 27-Aug 2 canonical slot",
  );
  const beforeReplay = await productionSlotState(params.runtimeClient);
  const replayed = await callProductionSlot(params.runtimeClient);
  assertDeepEqual(
    replayed,
    { ...prepared, outcome: "replayed" },
    "exact production replay must retain seal, hash, dates, and slot",
  );
  assertDeepEqual(
    await productionSlotState(params.runtimeClient),
    beforeReplay,
    "exact production replay must perform zero logical seal or slot writes",
  );
  await assertRejectsContaining(
    () => callProductionSlot(params.runtimeClient, "2026-07-28"),
    "requires a completed Monday-Sunday UTC week",
    "production preparation must fail closed for a shifted weekly window",
  );
  assertDeepEqual(
    await productionSlotState(params.runtimeClient),
    beforeReplay,
    "shifted-window rejection must retain the canonical production authority",
  );
};

const callProductionSlot = async (
  client: PoolClient,
  startDate = productionWeekStartedOn,
): Promise<WeeklyProductionSlotRow> => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
  try {
    const row = await queryProductionSlot(client, startDate);
    await client.query("COMMIT");
    return row;
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};

const queryProductionSlot = async (
  client: PoolClient,
  startDate = productionWeekStartedOn,
): Promise<WeeklyProductionSlotRow> => {
  const result = await client.query<WeeklyProductionSlotRow>(
    `SELECT
       outcome, seal_id, btrim(seal_sha256) AS seal_sha256,
       to_char(week_started_on, 'YYYY-MM-DD') AS week_started_on,
       to_char(week_ended_on, 'YYYY-MM-DD') AS week_ended_on,
       to_char(period_started_at AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS period_started_at,
       to_char(period_ended_at AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS period_ended_at,
       period_timezone, current_publication_id::TEXT
     FROM prepare_reader_summary_weekly_production_slot(
       $1::UUID, $2::UUID, 'workspace', 'workspace', $3::DATE
     )`,
    [
      readerSummaryPublicationFixtureScope.tenantId,
      readerSummaryPublicationFixtureScope.workspaceId,
      startDate,
    ],
  );
  assert(result.rows.length === 1, "production slot preparation returned no row");
  return result.rows[0]!;
};

const productionSlotState = async (
  client: PoolClient,
): Promise<Readonly<Record<string, unknown>>> => {
  const result = await client.query<Readonly<Record<string, unknown>>>(
    `SELECT seal.seal_id, btrim(seal.seal_sha256) AS seal_sha256,
            seal.days, seal.canonical_record,
            slot.period_started_at, slot.period_ended_at,
            slot.period_timezone, slot.current_publication_id, slot.updated_at
       FROM reader_summary_weekly_certification_seals AS seal
       JOIN reader_summary_publication_slots AS slot
         ON slot.tenant_id = seal.tenant_id
        AND slot.workspace_id = seal.workspace_id
        AND slot.scope_type = seal.scope_type
        AND slot.scope_key = seal.scope_key
        AND slot.cadence = 'weekly'
        AND slot.period_started_at =
          seal.week_started_on::TIMESTAMP AT TIME ZONE 'UTC'
        AND slot.period_ended_at =
          (seal.week_started_on + 7)::TIMESTAMP AT TIME ZONE 'UTC'
        AND slot.period_timezone = 'UTC'
      WHERE seal.tenant_id = $1::UUID
        AND seal.workspace_id = $2::UUID
        AND seal.scope_type = 'workspace'
        AND seal.scope_key = 'workspace'
        AND seal.week_started_on = $3::DATE`,
    [
      readerSummaryPublicationFixtureScope.tenantId,
      readerSummaryPublicationFixtureScope.workspaceId,
      productionWeekStartedOn,
    ],
  );
  assert(result.rows.length === 1, "production slot state must be unique");
  return result.rows[0]!;
};

const assertSealCatalogContract = async (
  params: WeeklySealFixtureParams,
): Promise<void> => {
  const result = await params.auditorClient.query<{
    readonly capability_table_acl_count: string;
    readonly database_owner_acl_count: string;
    readonly fixed_search_path: boolean;
    readonly function_capability_acl_count: string;
    readonly force_rls: boolean;
    readonly function_definition: string;
    readonly function_owner: string;
    readonly owner_delete: boolean;
    readonly owner_execute: boolean;
    readonly owner_insert: boolean;
    readonly owner_select: boolean;
    readonly owner_trigger: boolean;
    readonly owner_truncate: boolean;
    readonly owner_update: boolean;
    readonly policy_count: string;
    readonly runtime_direct_execute: boolean;
    readonly runtime_direct_select: boolean;
    readonly runtime_delete: boolean;
    readonly runtime_execute: boolean;
    readonly runtime_insert: boolean;
    readonly runtime_select: boolean;
    readonly runtime_truncate: boolean;
    readonly runtime_update: boolean;
    readonly security_definer: boolean;
    readonly table_owner: string;
    readonly trigger_count: string;
  }>(
    `WITH seal_function AS (
       SELECT procedure.*
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = $1::regprocedure
     ),
     seal_relation AS (
       SELECT relation.*
       FROM pg_catalog.pg_class AS relation
       WHERE relation.oid = $2::regclass
     )
     SELECT
       pg_catalog.pg_get_userbyid(seal_relation.relowner) AS table_owner,
       seal_relation.relforcerowsecurity AS force_rls,
       pg_catalog.pg_get_userbyid(seal_function.proowner) AS function_owner,
       seal_function.prosecdef AS security_definer,
       seal_function.proconfig = ARRAY[
         'search_path=pg_catalog, public'
       ]::TEXT[] AS fixed_search_path,
       pg_catalog.pg_get_functiondef(seal_function.oid)
         AS function_definition,
       pg_catalog.has_function_privilege(
         $3, seal_function.oid, 'EXECUTE'
       ) AS runtime_execute,
       EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(
           COALESCE(
             seal_function.proacl,
             pg_catalog.acldefault('f', seal_function.proowner)
           )
         ) AS privilege
         JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE grantee.rolname = $3
           AND privilege.privilege_type = 'EXECUTE'
       ) AS runtime_direct_execute,
       (
         SELECT count(*)::TEXT
         FROM pg_catalog.aclexplode(
           COALESCE(
             seal_function.proacl,
             pg_catalog.acldefault('f', seal_function.proowner)
           )
         ) AS privilege
         JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE grantee.rolname = $4
       ) AS function_capability_acl_count,
       pg_catalog.has_function_privilege(
         $5, seal_function.oid, 'EXECUTE'
       ) AS owner_execute,
       pg_catalog.has_table_privilege(
         $3, seal_relation.oid, 'SELECT'
       ) AS runtime_select,
       EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(
           COALESCE(
             seal_relation.relacl,
             pg_catalog.acldefault('r', seal_relation.relowner)
           )
         ) AS privilege
         JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE grantee.rolname = $3
           AND privilege.privilege_type = 'SELECT'
       ) AS runtime_direct_select,
       (
         SELECT count(*)::TEXT
         FROM pg_catalog.aclexplode(
           COALESCE(
             seal_relation.relacl,
             pg_catalog.acldefault('r', seal_relation.relowner)
           )
         ) AS privilege
         JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE grantee.rolname = $4
       ) AS capability_table_acl_count,
       (
         SELECT count(*)::TEXT
         FROM pg_catalog.aclexplode(
           COALESCE(
             seal_relation.relacl,
             pg_catalog.acldefault('r', seal_relation.relowner)
           )
         ) AS privilege
         JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE grantee.rolname = 'pg_database_owner'
       ) AS database_owner_acl_count,
       pg_catalog.has_table_privilege(
         $3, seal_relation.oid, 'INSERT'
       ) AS runtime_insert,
       pg_catalog.has_table_privilege(
         $3, seal_relation.oid, 'UPDATE'
       ) AS runtime_update,
       pg_catalog.has_table_privilege(
         $3, seal_relation.oid, 'DELETE'
       ) AS runtime_delete,
       pg_catalog.has_table_privilege(
         $3, seal_relation.oid, 'TRUNCATE'
       ) AS runtime_truncate,
       pg_catalog.has_table_privilege(
         $5, seal_relation.oid, 'SELECT'
       ) AS owner_select,
       pg_catalog.has_table_privilege(
         $5, seal_relation.oid, 'INSERT'
       ) AS owner_insert,
       pg_catalog.has_table_privilege(
         $5, seal_relation.oid, 'UPDATE'
       ) AS owner_update,
       pg_catalog.has_table_privilege(
         $5, seal_relation.oid, 'DELETE'
       ) AS owner_delete,
       pg_catalog.has_table_privilege(
         $5, seal_relation.oid, 'TRUNCATE'
       ) AS owner_truncate,
       pg_catalog.has_table_privilege(
         $5, seal_relation.oid, 'TRIGGER'
       ) AS owner_trigger,
       (
         SELECT count(*)::TEXT
         FROM pg_catalog.pg_policy AS policy
         WHERE policy.polrelid = seal_relation.oid
           AND policy.polname = 'tenant_isolation'
       ) AS policy_count,
       (
         SELECT count(*)::TEXT
         FROM pg_catalog.pg_trigger AS trigger
         WHERE trigger.tgrelid = seal_relation.oid
           AND trigger.tgname =
             'reader_summary_weekly_certification_seals_append_only'
           AND trigger.tgenabled = 'O'
           AND NOT trigger.tgisinternal
       ) AS trigger_count
     FROM seal_function, seal_relation`,
    [
      sealFunction,
      `public.${sealTable}`,
      params.runtimeRole,
      publicationCapability,
      publicationOwner,
    ],
  );
  const row = result.rows[0];
  assert(row !== undefined, "weekly seal catalog contract returned no row");
  assert(
    row.table_owner === publicationOwner &&
      row.force_rls &&
      row.function_owner === publicationOwner &&
      row.security_definer &&
      row.fixed_search_path &&
      row.runtime_execute &&
      row.runtime_direct_execute &&
      row.runtime_select &&
      row.runtime_direct_select &&
      !row.runtime_insert &&
      !row.runtime_update &&
      !row.runtime_delete &&
      !row.runtime_truncate &&
      row.function_capability_acl_count === "0" &&
      row.capability_table_acl_count === "0" &&
      row.database_owner_acl_count === "0" &&
      row.owner_execute &&
      row.owner_select &&
      row.owner_insert &&
      row.owner_update &&
      row.owner_delete &&
      row.owner_truncate &&
      row.owner_trigger &&
      row.policy_count === "1" &&
      row.trigger_count === "1",
    "weekly seal ownership, ACL, RLS, trigger, or function contract diverged",
  );
  assert(
    row.function_definition.includes(
      "current_setting('transaction_isolation') <> 'serializable'",
    ) &&
      row.function_definition.includes("FOR SHARE OF slot, publication, evidence") &&
      !/\bLOCK\s+TABLE\b/i.test(row.function_definition),
    "weekly seal must use SERIALIZABLE row locks without LOCK TABLE",
  );
};

const assertSerializableSealRace = async (
  params: WeeklySealFixtureParams,
): Promise<WeeklySealRow> => {
  const clients = [params.runtimeClient, params.concurrentRuntimeClient] as const;
  const backendPids = await Promise.all(
    clients.map(async (client) => {
      const result = await client.query<{ readonly pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      );
      const pid = result.rows[0]?.pid;
      assert(pid !== undefined, "weekly seal race client returned no backend pid");
      return pid;
    }),
  );
  assert(
    backendPids[0] !== backendPids[1],
    "weekly seal race requires two independent PostgreSQL clients",
  );

  await holdSealInputLock(params.adminClient);
  let attempts: readonly Promise<WeeklySealRow>[] = [];
  let barrierError: unknown;
  try {
    await Promise.all(
      clients.map((client) =>
        client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE"),
      ),
    );
    attempts = clients.map((client) => finishOpenSealAttempt(client));
    try {
      await waitForBothSealCallsBlocked(params.adminClient, backendPids);
    } catch (error: unknown) {
      barrierError = error;
    }
  } catch (error: unknown) {
    barrierError = error;
  } finally {
    await params.adminClient.query("COMMIT").catch(async () => {
      await params.adminClient.query("ROLLBACK").catch(() => undefined);
    });
  }

  if (attempts.length !== clients.length) {
    await Promise.all(
      clients.map((client) => client.query("ROLLBACK").catch(() => undefined)),
    );
    throw barrierError;
  }
  const settled = await Promise.allSettled(attempts);
  if (barrierError !== undefined) {
    throw barrierError;
  }
  const winners = settled.flatMap((result, index) =>
    result.status === "fulfilled" ? [{ client: clients[index]!, row: result.value }] : [],
  );
  const losers = settled.flatMap((result, index) =>
    result.status === "rejected" ? [{ client: clients[index]!, error: result.reason }] : [],
  );
  assert(
    winners.length === 1 && losers.length === 1,
    "SERIALIZABLE weekly seal race must have exactly one winner and one loser",
  );
  const winner = winners[0]!;
  const loser = losers[0]!;
  assert(winner.row.outcome === "sealed", "race winner must create the seal");
  assert(
    postgresSqlState(loser.error) === "40001",
    "race loser must receive SQLSTATE 40001 before bounded retry",
  );
  const retried = await callSeal(loser.client);
  assertDeepEqual(
    retried,
    { ...winner.row, outcome: "replayed" },
    "bounded loser retry must replay the identical immutable seal",
  );
  await assertSealCardinality(params.runtimeClient, winner.row.seal_id);
  return winner.row;
};

const holdSealInputLock = async (admin: PoolClient): Promise<void> => {
  await admin.query("BEGIN");
  try {
    await admin.query(
      `SELECT set_config('social_monitor.tenant_id', $1, true),
              set_config('social_monitor.workspace_id', $2, true),
              set_config('social_monitor.system_access', 'false', true)`,
      [
        readerSummaryPublicationFixtureScope.tenantId,
        readerSummaryPublicationFixtureScope.workspaceId,
      ],
    );
    await admin.query(`SET LOCAL ROLE ${publicationOwner}`);
    const locked = await admin.query<{
      readonly current_publication_id: string;
    }>(
      `SELECT slot.current_publication_id
         FROM reader_summary_publication_slots AS slot
        WHERE slot.tenant_id = $1
          AND slot.workspace_id = $2
          AND slot.scope_type = 'workspace'
          AND slot.scope_key = 'workspace'
          AND slot.cadence = 'daily'
          AND slot.period_timezone = 'UTC'
          AND slot.period_started_at = (
            $3::DATE::TIMESTAMP AT TIME ZONE 'UTC'
          )
          AND slot.period_ended_at = (
            ($3::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC'
          )
          AND slot.current_publication_id IS NOT NULL
        ORDER BY
          slot.tenant_id,
          slot.workspace_id,
          slot.scope_type,
          slot.scope_key,
          slot.cadence,
          slot.period_started_at,
          slot.period_ended_at,
          slot.period_timezone,
          slot.current_publication_id
        LIMIT 1
        FOR UPDATE OF slot`,
      [
        readerSummaryPublicationFixtureScope.tenantId,
        readerSummaryPublicationFixtureScope.workspaceId,
        weekStartedOn,
      ],
    );
    assert(locked.rows.length === 1, "weekly seal race barrier found no input row");
  } catch (error: unknown) {
    await admin.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};

const waitForBothSealCallsBlocked = async (
  observer: PoolClient,
  backendPids: readonly number[],
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await observer.query<{ readonly blocked_count: number }>(
      `SELECT count(*)::INTEGER AS blocked_count
         FROM unnest($1::INTEGER[]) AS runtime(pid)
        WHERE cardinality(pg_catalog.pg_blocking_pids(runtime.pid)) > 0`,
      [backendPids],
    );
    if (result.rows[0]?.blocked_count === backendPids.length) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("both weekly seal clients must reach the database lock barrier");
};

const finishOpenSealAttempt = async (
  client: PoolClient,
): Promise<WeeklySealRow> => {
  try {
    const row = await querySeal(client);
    await client.query("COMMIT");
    return row;
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};

const querySeal = async (
  client: PoolClient,
  startDate: string = weekStartedOn,
): Promise<WeeklySealRow> => {
  const result = await client.query<WeeklySealRow>(
    `SELECT outcome, seal_id, seal_sha256, canonical_record
       FROM seal_reader_summary_weekly_certification(
         $1::UUID, $2::UUID, 'workspace', 'workspace', $3::DATE
       )`,
    [
      readerSummaryPublicationFixtureScope.tenantId,
      readerSummaryPublicationFixtureScope.workspaceId,
      startDate,
    ],
  );
  const row = result.rows[0];
  assert(row !== undefined, "weekly certification returned no seal");
  return row;
};

const assertSealCardinality = async (
  client: PoolClient,
  sealId: string,
): Promise<void> => {
  const result = await client.query<{ readonly count: string }>(
    `SELECT count(*)::TEXT AS count
       FROM reader_summary_weekly_certification_seals
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND scope_type = 'workspace'
        AND scope_key = 'workspace'
        AND week_started_on = $3::DATE
        AND seal_id = $4`,
    [
      readerSummaryPublicationFixtureScope.tenantId,
      readerSummaryPublicationFixtureScope.workspaceId,
      weekStartedOn,
      sealId,
    ],
  );
  assert(
    result.rows[0]?.count === "1",
    "SERIALIZABLE weekly seal race must retain cardinality one",
  );
};

const postgresSqlState = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
};

const assertIncompleteWeekFailsClosed = async (
  client: PoolClient,
): Promise<void> => {
  await assertRejectsContaining(
    () => callSeal(client, "2026-05-25"),
    "exactly 7/7 published COMPLETED or NO_SIGNAL days; found 0",
    "an incomplete Monday-Sunday week must fail closed",
  );
};

const callSeal = async (
  client: PoolClient,
  startDate: string = weekStartedOn,
): Promise<WeeklySealRow> => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
  try {
    const row = await querySeal(client, startDate);
    await client.query("COMMIT");
    return row;
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};

const callSealAtDefaultIsolation = async (
  client: PoolClient,
): Promise<unknown> =>
  client.query(
    `SELECT *
       FROM seal_reader_summary_weekly_certification(
         $1::UUID, $2::UUID, 'workspace', 'workspace', $3::DATE
       )`,
    [
      readerSummaryPublicationFixtureScope.tenantId,
      readerSummaryPublicationFixtureScope.workspaceId,
      weekStartedOn,
    ],
  );

const assertExactSevenDaySeal = async (
  client: PoolClient,
  seal: WeeklySealRow,
  expectedStatuses: readonly string[],
): Promise<void> => {
  const result = await client.query<{
    readonly dates: string[];
    readonly seal_id: string;
    readonly seal_sha256: string;
    readonly statuses: string[];
  }>(
    `SELECT
       seal_id,
       btrim(seal_sha256) AS seal_sha256,
       ARRAY(
         SELECT day.value->>'requestedUtcDate'
         FROM jsonb_array_elements(days) WITH ORDINALITY AS day(value, ordinal)
         ORDER BY day.ordinal
       ) AS dates,
       ARRAY(
         SELECT day.value->>'semanticStatus'
         FROM jsonb_array_elements(days) WITH ORDINALITY AS day(value, ordinal)
         ORDER BY day.ordinal
       ) AS statuses
     FROM reader_summary_weekly_certification_seals
     WHERE seal_id = $1`,
    [seal.seal_id],
  );
  assertDeepEqual(
    result.rows[0],
    {
      seal_id: seal.seal_id,
      seal_sha256: seal.seal_sha256,
      dates: weekDates,
      statuses: expectedStatuses,
    },
    "weekly seal must retain exact ordered Monday-Sunday terminal publications",
  );
};

const assertTenantVisibility = async (client: PoolClient): Promise<void> => {
  const sameTenant = await client.query<{ readonly count: string }>(
    `SELECT count(*)::TEXT AS count
       FROM reader_summary_weekly_certification_seals`,
  );
  assert(
    sameTenant.rows[0]?.count === "2",
    "same-tenant runtime must see both weekly certification seals",
  );
  await setReaderSummaryPublicationSessionScope(client, {
    tenantId: "00000000-0000-7000-8000-000000000011",
    workspaceId: "00000000-0000-7000-8000-000000000012",
  });
  try {
    const crossTenant = await client.query<{ readonly count: string }>(
      `SELECT count(*)::TEXT AS count
         FROM reader_summary_weekly_certification_seals`,
    );
    assert(
      crossTenant.rows[0]?.count === "0",
      "FORCE RLS must hide a seal from a cross-tenant runtime scope",
    );
  } finally {
    await setReaderSummaryPublicationSessionScope(client);
  }
};

const assertRuntimeWritesDenied = async (
  client: PoolClient,
): Promise<void> => {
  const operations = [
    `INSERT INTO ${sealTable} SELECT * FROM ${sealTable} LIMIT 1`,
    `UPDATE ${sealTable} SET recorded_at = recorded_at`,
    `DELETE FROM ${sealTable}`,
    `TRUNCATE TABLE ${sealTable}`,
  ] as const;
  for (const operation of operations) {
    await assertRejectsContaining(
      () => client.query(operation),
      "permission denied",
      `runtime write must be permission denied: ${operation.split(" ")[0]}`,
    );
  }
};

const assertPublicationOwnerAppendOnly = async (
  admin: PoolClient,
  sealId: string,
): Promise<void> => {
  await assertRejectsContaining(
    async () => {
      await admin.query("BEGIN");
      try {
        await admin.query(
          `SELECT set_config('social_monitor.tenant_id', $1, true),
                  set_config('social_monitor.workspace_id', $2, true),
                  set_config('social_monitor.system_access', 'false', true)`,
          [
            readerSummaryPublicationFixtureScope.tenantId,
            readerSummaryPublicationFixtureScope.workspaceId,
          ],
        );
        await admin.query(`SET LOCAL ROLE ${publicationOwner}`);
        await admin.query(
          `UPDATE reader_summary_weekly_certification_seals
              SET recorded_at = recorded_at
            WHERE seal_id = $1`,
          [sealId],
        );
      } finally {
        await admin.query("ROLLBACK").catch(() => undefined);
      }
    },
    "weekly certification seals are append-only",
    "publication-owner UPDATE path must be rejected as append-only",
  );
};
