import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { defaultPostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { PrismaReaderSummaryArtifactRepository } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaSummaryConnection } from "../libs/summary/adapters/persistence/prisma/prisma-summary-connection";

const protectedOwner = "social_monitor_reader_summary_publication_owner";
const guardError =
  "visible reader summary artifact requires publish_reader_summary";
const tenant = randomUUID();
const workspace = randomUUID();
const periodStartedAt = "2026-07-29T00:00:00.000Z";
const periodEndedAt = "2026-07-30T00:00:00.000Z";
const periodKey =
  "daily:2026-07-29T00:00:00.000Z:2026-07-30T00:00:00.000Z:UTC";
const visibleStatuses = ["COMPLETED", "NO_SIGNAL"] as const;

export const assertReaderSummaryPublicationRuntimeGuard = async (params: {
  readonly runtime: PoolClient;
  readonly runtimeDatabaseUrl: string;
  readonly publishedArtifactId: string;
}): Promise<void> => {
  await assertPostgres18Trigger(params.runtime);
  await assertPublishedArtifactRemainsImmutable(
    params.runtime,
    params.publishedArtifactId,
  );

  const directInsertIds: string[] = [];
  for (const status of visibleStatuses) {
    const artifactId = randomUUID();
    directInsertIds.push(artifactId);
    await assertRejectsContaining(
      () => insertArtifact(params.runtime, artifactId, status),
      guardError,
      `runtime direct ${status} INSERT must fail closed`,
    );
  }

  const candidateId = randomUUID();
  await insertArtifact(params.runtime, candidateId, "RUNNING");
  const candidateUpdate = await params.runtime.query<{
    readonly headline: string;
  }>(
    `UPDATE reader_summary_artifacts
        SET headline = 'Updated hidden rollback candidate',
            updated_at = '2026-07-29T10:01:00.000Z'
      WHERE id = $1
    RETURNING headline`,
    [candidateId],
  );
  assertDeepEqual(
    candidateUpdate.rows,
    [{ headline: "Updated hidden rollback candidate" }],
    "runtime must retain INSERT and UPDATE access to hidden RUNNING candidates",
  );

  for (const status of visibleStatuses) {
    await assertRejectsContaining(
      () =>
        params.runtime.query(
          `UPDATE reader_summary_artifacts
              SET status = $2::"SummaryStatus",
                  updated_at = '2026-07-29T10:02:00.000Z'
            WHERE id = $1`,
          [candidateId, status],
        ),
      guardError,
      `runtime must not promote an unpublished RUNNING candidate to ${status}`,
    );
  }

  const rollbackUpsertIds: string[] = [];
  for (const status of visibleStatuses) {
    const artifactId = randomUUID();
    rollbackUpsertIds.push(artifactId);
    await assertOldRollbackPersistenceRejected(
      params.runtime,
      artifactId,
      status,
    );
  }

  const guardedIds = [...directInsertIds, candidateId, ...rollbackUpsertIds];
  await assertSelectorInvisibility(
    params.runtimeDatabaseUrl,
    candidateId,
    guardedIds,
  );
  await assertNoPublicationResidue(params.runtime, guardedIds);
};

const assertPostgres18Trigger = async (
  runtime: PoolClient,
): Promise<void> => {
  const evidence = await runtime.query<{
    readonly server_version_num: string;
    readonly enabled: string;
    readonly before_row: boolean;
    readonly on_insert: boolean;
    readonly on_update: boolean;
    readonly on_delete: boolean;
    readonly on_truncate: boolean;
    readonly instead_of: boolean;
    readonly exact_function: boolean;
    readonly table_owner: string;
    readonly function_owner: string;
  }>(
    `SELECT
       current_setting('server_version_num') AS server_version_num,
       trigger.tgenabled AS enabled,
       trigger.tgtype & 1 = 1 AND trigger.tgtype & 2 = 2 AS before_row,
       trigger.tgtype & 4 = 4 AS on_insert,
       trigger.tgtype & 16 = 16 AS on_update,
       trigger.tgtype & 8 = 8 AS on_delete,
       trigger.tgtype & 32 = 32 AS on_truncate,
       trigger.tgtype & 64 = 64 AS instead_of,
       trigger.tgfoid =
         'public.guard_published_reader_summary_artifact_update()'::regprocedure
         AS exact_function,
       pg_get_userbyid(relation.relowner) AS table_owner,
       pg_get_userbyid(procedure.proowner) AS function_owner
     FROM pg_trigger trigger
     JOIN pg_class relation ON relation.oid = trigger.tgrelid
     JOIN pg_proc procedure ON procedure.oid = trigger.tgfoid
     WHERE trigger.tgrelid = 'reader_summary_artifacts'::regclass
       AND trigger.tgname = 'reader_summary_artifacts_published_immutable'`,
  );
  const row = evidence.rows[0];
  const version = Number(row?.server_version_num);
  assert(
    Number.isInteger(version) && version >= 180000 && version < 190000,
    `publication regression requires PostgreSQL 18, got ${row?.server_version_num ?? "no server"}`,
  );
  assertDeepEqual(
    row === undefined
      ? undefined
      : {
          enabled: row.enabled,
          before_row: row.before_row,
          on_insert: row.on_insert,
          on_update: row.on_update,
          on_delete: row.on_delete,
          on_truncate: row.on_truncate,
          instead_of: row.instead_of,
          exact_function: row.exact_function,
          table_owner: row.table_owner,
          function_owner: row.function_owner,
        },
    {
      enabled: "O",
      before_row: true,
      on_insert: true,
      on_update: true,
      on_delete: false,
      on_truncate: false,
      instead_of: false,
      exact_function: true,
      table_owner: protectedOwner,
      function_owner: protectedOwner,
    },
    "artifact guard must be an enabled owner-controlled BEFORE INSERT OR UPDATE row trigger",
  );
};

const assertPublishedArtifactRemainsImmutable = async (
  runtime: PoolClient,
  artifactId: string,
): Promise<void> => {
  await assertRejectsContaining(
    () =>
      runtime.query(
        `UPDATE reader_summary_artifacts
            SET headline = headline
          WHERE id = $1`,
        [artifactId],
      ),
    "published reader summary artifact is immutable",
    "ledger-linked artifact updates must retain the immutability error",
  );
};

const assertOldRollbackPersistenceRejected = async (
  runtime: PoolClient,
  artifactId: string,
  status: (typeof visibleStatuses)[number],
): Promise<void> => {
  await runtime.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  let failure: unknown;
  try {
    await insertArtifact(runtime, artifactId, status, true);
    await runtime.query(
      `UPDATE reader_summary_artifacts
          SET status = 'SUPERSEDED'
        WHERE id <> $1
          AND tenant_id = $2
          AND workspace_id = $3
          AND scope_key = 'workspace'
          AND cadence = 'daily'
          AND period_started_at = $4
          AND period_ended_at = $5
          AND period_timezone = 'UTC'
          AND status = 'COMPLETED'`,
      [artifactId, tenant, workspace, periodStartedAt, periodEndedAt],
    );
  } catch (error: unknown) {
    failure = error;
  } finally {
    await runtime.query("ROLLBACK");
  }
  assert(
    failure instanceof Error && failure.message.includes(guardError),
    `old rollback ${status} upsert must be rejected before it can supersede history`,
  );
};

const assertSelectorInvisibility = async (
  runtimeDatabaseUrl: string,
  candidateId: string,
  guardedIds: readonly string[],
): Promise<void> => {
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(runtimeDatabaseUrl, "admin-tool"),
  );
  try {
    const repository = new PrismaReaderSummaryArtifactRepository(connection);
    const scope = {
      tenantId: tenantId(tenant),
      workspaceId: workspaceId(workspace),
    };
    const found = await repository.findById({
      ...scope,
      readerSummaryId: candidateId,
    });
    const listed = await repository.list({ ...scope, limit: 20 });
    const listedIds = listed.items.map(
      (artifact) => artifact.toSnapshot().readerSummaryId,
    );
    assert(found === null, "hidden RUNNING candidate must not be findable");
    assert(
      guardedIds.every((artifactId) => !listedIds.includes(artifactId)),
      "reader summary list selector must hide guarded rollback artifacts",
    );
  } finally {
    await connection.close();
  }
};

const assertNoPublicationResidue = async (
  runtime: PoolClient,
  guardedIds: readonly string[],
): Promise<void> => {
  const state = await runtime.query<{
    readonly artifact_rows: string;
    readonly running_rows: string;
    readonly visible_rows: string;
    readonly ledger_rows: string;
    readonly slot_rows: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_artifacts
         WHERE id = ANY($1::uuid[])) AS artifact_rows,
       (SELECT count(*) FROM reader_summary_artifacts
         WHERE id = ANY($1::uuid[]) AND status = 'RUNNING') AS running_rows,
       (SELECT count(*) FROM reader_summary_artifacts
         WHERE id = ANY($1::uuid[])
           AND status IN ('COMPLETED', 'NO_SIGNAL')) AS visible_rows,
       (SELECT count(*) FROM reader_summary_publications
         WHERE reader_summary_artifact_id = ANY($1::uuid[])) AS ledger_rows,
       (SELECT count(*) FROM reader_summary_publication_slots
         WHERE tenant_id = $2 AND workspace_id = $3
           AND period_started_at = $4) AS slot_rows`,
    [guardedIds, tenant, workspace, periodStartedAt],
  );
  assertDeepEqual(
    state.rows[0],
    {
      artifact_rows: "1",
      running_rows: "1",
      visible_rows: "0",
      ledger_rows: "0",
      slot_rows: "0",
    },
    "rejected rollback writes must leave one hidden candidate and no visible row, ledger, or slot",
  );
};

const insertArtifact = async (
  runtime: PoolClient,
  artifactId: string,
  status: "RUNNING" | (typeof visibleStatuses)[number],
  emulateOldUpsert = false,
): Promise<void> => {
  await runtime.query(
    `INSERT INTO reader_summary_artifacts (
       id, tenant_id, workspace_id, scope_type, scope_key, cadence,
       period_started_at, period_ended_at, period_timezone, period_key,
       status, schema_version, model_version, prompt_version, headline,
       summary_text, artifact_payload, citations, quality_signals,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, 'workspace', 'workspace', 'daily', $4, $5, 'UTC', $6,
       $7::"SummaryStatus", 1, 'rollback-image-model',
       'rollback-image-prompt', 'Rollback image artifact',
       'Old persistence path', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
       '2026-07-29T10:00:00.000Z', '2026-07-29T10:00:00.000Z'
     )
     ${
       emulateOldUpsert
         ? `ON CONFLICT (id) DO UPDATE SET
              status = EXCLUDED.status,
              headline = EXCLUDED.headline,
              artifact_payload = EXCLUDED.artifact_payload,
              citations = EXCLUDED.citations,
              quality_signals = EXCLUDED.quality_signals,
              updated_at = EXCLUDED.updated_at`
         : ""
     }`,
    [
      artifactId,
      tenant,
      workspace,
      periodStartedAt,
      periodEndedAt,
      periodKey,
      status,
    ],
  );
};

const assertRejectsContaining = async (
  operation: () => Promise<unknown>,
  expectedMessage: string,
  assertionMessage: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error: unknown) {
    assert(
      error instanceof Error && error.message.includes(expectedMessage),
      assertionMessage,
    );
    return;
  }
  throw new Error(assertionMessage);
};

const assertDeepEqual = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

const assert: (condition: boolean, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};
