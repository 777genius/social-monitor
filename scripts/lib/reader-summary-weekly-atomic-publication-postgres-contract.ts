import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { canonicalizeReaderSummaryWeeklyJson } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  assertPostgres as assert,
  assertPostgresDeepEqual as assertDeepEqual,
  assertPostgresRejectsContaining as assertRejectsContaining,
} from "./reader-summary-publication-postgres-assertions";
import { readerSummaryPublicationFixtureScope } from "./reader-summary-publication-postgres-fixture-scope";

type WeeklyCertificationSeal = Readonly<{
  seal_id: string;
  seal_sha256: string;
  canonical_record: Readonly<{
    days: readonly Readonly<Record<string, unknown>>[];
  }>;
}>;

type WeeklyAtomicRow = Readonly<{
  outcome: "persisted" | "replayed";
  artifact_id: string;
  artifact_payload_sha256: string;
  proof_sha256: string;
}>;

type WeeklyAtomicPayload = Readonly<Record<string, unknown>> &
  Readonly<{
    artifactId: string;
    artifactPayloadSha256: string;
    proof: Readonly<{ sha256: string }>;
  }>;

type WeeklyAtomicContractParams = Readonly<{
  auditorClient: PoolClient;
  concurrentRuntimeClient: PoolClient;
  runtimeClient: PoolClient;
  runtimeRole: string;
}>;

const functionName = "persist_reader_summary_weekly_artifact(jsonb)";
const weekStartedOn = "2026-06-01";
const weekEndedOn = "2026-06-07";

export const assertReaderSummaryWeeklyAtomicPublicationPostgresContract =
  async (params: WeeklyAtomicContractParams): Promise<void> => {
    await assertCatalogContract(params);
    const seal = await readCertificationSeal(params.runtimeClient);
    const dailyArtifactId = String(
      seal.canonical_record.days[0]?.artifactId,
    );

    await assertFaultRollback(params.runtimeClient, seal, dailyArtifactId);

    const payload = buildPayload(seal, randomUUID(), "a");
    const outcomes = await Promise.all([
      persistWithSerializableRetry(params.runtimeClient, payload),
      persistWithSerializableRetry(params.concurrentRuntimeClient, payload),
    ]);
    assertDeepEqual(
      [...outcomes.map((row) => row.outcome)].sort(),
      ["persisted", "replayed"],
      "identical concurrent weekly persistence must insert once and replay once",
    );
    for (const row of outcomes) {
      assertExactResult(row, payload);
    }

    const beforeReplay = await readWeeklyState(params.runtimeClient);
    const replay = await persistWithSerializableRetry(
      params.runtimeClient,
      reverseObject(payload) as WeeklyAtomicPayload,
    );
    assert(replay.outcome === "replayed", "exact replay must be idempotent");
    assertExactResult(replay, payload);
    assertDeepEqual(
      await readWeeklyState(params.runtimeClient),
      beforeReplay,
      "exact replay must perform zero logical row writes",
    );

    const divergent = buildPayload(seal, payload.artifactId, "b");
    await assertRejectsContaining(
      () => persistWithSerializableRetry(params.runtimeClient, divergent),
      "replay diverged from immutable sealId or sealSha",
      "the same artifact identity with divergent sealed bytes must fail closed",
    );
    assertDeepEqual(
      await readWeeklyState(params.runtimeClient),
      beforeReplay,
      "divergent persistence must leave the winning artifact and slot unchanged",
    );

    for (const [label, invalid] of invalidBindings(payload)) {
      await assertRejectsContaining(
        () => persistWithSerializableRetry(params.runtimeClient, invalid),
        label,
        `weekly persistence must reject ${label}`,
      );
      assertDeepEqual(
        await readWeeklyState(params.runtimeClient),
        beforeReplay,
        `${label} rejection must not write`,
      );
    }

    await assertDirectWeeklyWriteDenied(params.runtimeClient, payload);
    await assertDailyRowsUnchanged(params.runtimeClient, seal);
  };

const assertCatalogContract = async (
  params: WeeklyAtomicContractParams,
): Promise<void> => {
  const result = await params.auditorClient.query<{
    readonly capability_execute: boolean;
    readonly fixed_search_path: boolean;
    readonly function_definition: string;
    readonly function_owner: string;
    readonly public_execute: boolean;
    readonly runtime_direct_execute: boolean;
    readonly runtime_execute: boolean;
    readonly security_definer: boolean;
    readonly trigger_count: string;
  }>(
    `WITH target AS (
       SELECT procedure.*
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = $1::regprocedure
     )
     SELECT
       pg_catalog.pg_get_userbyid(target.proowner) AS function_owner,
       target.prosecdef AS security_definer,
       target.proconfig = ARRAY[
         'search_path=pg_catalog, public'
       ]::TEXT[] AS fixed_search_path,
       pg_catalog.pg_get_functiondef(target.oid) AS function_definition,
       pg_catalog.has_function_privilege(
         $2, target.oid, 'EXECUTE'
       ) AS runtime_execute,
       EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(COALESCE(
           target.proacl,
           pg_catalog.acldefault('f', target.proowner)
         )) AS privilege
         JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE grantee.rolname = $2
           AND privilege.privilege_type = 'EXECUTE'
       ) AS runtime_direct_execute,
       pg_catalog.has_function_privilege(
         'social_monitor_reader_summary_publication_runtime',
         target.oid,
         'EXECUTE'
       ) AS capability_execute,
       pg_catalog.has_function_privilege(
         'public', target.oid, 'EXECUTE'
       ) AS public_execute,
       (
         SELECT count(*)::TEXT
         FROM pg_catalog.pg_trigger AS trigger
         WHERE trigger.tgrelid =
             'public.reader_summary_artifacts'::regclass
           AND trigger.tgname =
             'reader_summary_weekly_artifacts_guarded'
           AND trigger.tgenabled = 'O'
           AND trigger.tgfoid =
             'public.guard_reader_summary_weekly_artifact_mutation()'::regprocedure
       ) AS trigger_count
     FROM target`,
    [functionName, params.runtimeRole],
  );
  const row = result.rows[0];
  assert(row !== undefined, "weekly atomic function must exist");
  assert(
    row.function_owner ===
      "social_monitor_reader_summary_publication_owner" &&
      row.security_definer &&
      row.fixed_search_path &&
      row.runtime_execute &&
      row.runtime_direct_execute &&
      !row.capability_execute &&
      !row.public_execute &&
      row.trigger_count === "1",
    "weekly atomic function ownership, ACL, path, or trigger is unsafe",
  );
  assert(
    !/\bLOCK\s+TABLE\b/iu.test(row.function_definition) &&
      /FOR\s+UPDATE/iu.test(row.function_definition) &&
      /ON\s+CONFLICT\s+DO\s+NOTHING/iu.test(row.function_definition),
    "weekly persistence must use a precreated row lock without table locks",
  );
};

const readCertificationSeal = async (
  client: PoolClient,
): Promise<WeeklyCertificationSeal> => {
  const result = await client.query<WeeklyCertificationSeal>(
    `SELECT seal_id, btrim(seal_sha256) AS seal_sha256, canonical_record
       FROM reader_summary_weekly_certification_seals
      WHERE tenant_id = $1::uuid
        AND workspace_id = $2::uuid
        AND scope_type = 'workspace'
        AND scope_key = 'workspace'
        AND week_started_on = $3::date`,
    [
      readerSummaryPublicationFixtureScope.tenantId,
      readerSummaryPublicationFixtureScope.workspaceId,
      weekStartedOn,
    ],
  );
  const seal = result.rows[0];
  assert(seal !== undefined, "weekly DB certification seal must exist");
  return seal;
};

const buildPayload = (
  seal: WeeklyCertificationSeal,
  artifactId: string,
  salt: string,
): WeeklyAtomicPayload => {
  const modelSealSha256 = canonicalizeReaderSummaryWeeklyJson({
    artifactId,
    manifestSealId: seal.seal_id,
    salt,
  }).sha256;
  const modelSealId =
    `reader_summary.weekly_model_input.v1:${modelSealSha256}`;
  const output = {
    schemaVersion: "reader_summary.weekly_model_output.v1",
    sealId: modelSealId,
    sealSha: modelSealSha256,
    weekStartedOn,
    weekEndedOn,
    headline: `Atomic weekly headline ${salt}`,
    synthesis: `Atomic weekly synthesis ${salt}`,
  };
  const editorialQuality = {
    policyVersion: "reader_summary.weekly_editorial_quality.v2",
    publicationDecision: "allow",
    blockingPassed: true,
  };
  const proofBody = {
    schemaVersion: "reader_summary.weekly_publication_proof.v1",
    artifactId,
    tenantId: readerSummaryPublicationFixtureScope.tenantId,
    workspaceId: readerSummaryPublicationFixtureScope.workspaceId,
    scope: { type: "workspace" },
    weekStartedOn,
    weekEndedOn,
    manifestSealId: seal.seal_id,
    manifestSealSha256: seal.seal_sha256,
    modelInputSealId: modelSealId,
    modelInputSealSha256: modelSealSha256,
    artifactSha256: canonicalizeReaderSummaryWeeklyJson(output).sha256,
    editorialQualitySha256:
      canonicalizeReaderSummaryWeeklyJson(editorialQuality).sha256,
    authorities: seal.canonical_record.days.map((day) => ({ ...day })),
    citations: [],
  };
  const proofSha256 = canonicalizeReaderSummaryWeeklyJson(proofBody).sha256;
  const proof = {
    ...proofBody,
    authorizationId:
      `reader_summary.weekly_publication_authorization.v1:${proofSha256}`,
    sha256: proofSha256,
  };
  const artifactPayload = {
    schemaVersion: "reader_summary.weekly_persisted_artifact.v1",
    output,
    publicationProof: proof,
  };
  const periodStartedAt = `${weekStartedOn}T00:00:00.000Z`;
  const periodEndedAt = "2026-06-08T00:00:00.000Z";
  return {
    schemaVersion: "reader_summary.weekly_artifact_persistence.v2",
    artifactId,
    tenantId: readerSummaryPublicationFixtureScope.tenantId,
    workspaceId: readerSummaryPublicationFixtureScope.workspaceId,
    scopeType: "workspace",
    scopeKey: "workspace",
    interestId: null,
    cadence: "weekly",
    weekStartedOn,
    weekEndedOn,
    periodStartedAt,
    periodEndedAt,
    periodTimezone: "UTC",
    periodKey: `weekly:${periodStartedAt}:${periodEndedAt}:UTC`,
    sealId: modelSealId,
    sealSha256: modelSealSha256,
    manifestSealId: seal.seal_id,
    manifestSealSha256: seal.seal_sha256,
    headline: output.headline,
    summaryText: output.synthesis,
    modelVersion: output.schemaVersion,
    promptVersion: editorialQuality.policyVersion,
    artifactPayload,
    artifactPayloadSha256:
      canonicalizeReaderSummaryWeeklyJson(artifactPayload).sha256,
    citations: [],
    qualitySignals: {
      kind: "weekly",
      editorialQuality,
      weeklyPublicationProof: proof,
    },
    proof,
  };
};

const persistWithSerializableRetry = async (
  client: PoolClient,
  payload: WeeklyAtomicPayload,
): Promise<WeeklyAtomicRow> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      const result = await client.query<WeeklyAtomicRow>(
        `SELECT * FROM persist_reader_summary_weekly_artifact($1::jsonb)`,
        [JSON.stringify(payload)],
      );
      const row = result.rows[0];
      assert(
        result.rows.length === 1 && row !== undefined,
        "weekly persistence function must return one row",
      );
      await client.query("COMMIT");
      return row;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      if (postgresCode(error) === "40001" && attempt < 4) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("weekly persistence exhausted SERIALIZABLE retries");
};

const postgresCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;

const assertExactResult = (
  row: WeeklyAtomicRow,
  payload: WeeklyAtomicPayload,
): void => {
  assert(
    row.artifact_id === payload.artifactId &&
      row.artifact_payload_sha256 === payload.artifactPayloadSha256 &&
      row.proof_sha256 === payload.proof.sha256,
    "weekly persistence returned a mismatched artifact or proof",
  );
};

const readWeeklyState = async (client: PoolClient): Promise<unknown> => {
  const result = await client.query(
    `SELECT
       (SELECT count(*)::TEXT FROM reader_summary_publication_slots
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS slots,
       (SELECT count(*)::TEXT FROM reader_summary_artifacts
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS artifacts,
       (SELECT xmin::TEXT FROM reader_summary_publication_slots
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS slot_xmin,
       (SELECT updated_at::TEXT FROM reader_summary_publication_slots
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS slot_updated_at,
       (SELECT xmin::TEXT FROM reader_summary_artifacts
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS artifact_xmin,
       (SELECT updated_at::TEXT FROM reader_summary_artifacts
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS artifact_updated_at`,
    [
      readerSummaryPublicationFixtureScope.tenantId,
      readerSummaryPublicationFixtureScope.workspaceId,
      `${weekStartedOn}T00:00:00.000Z`,
    ],
  );
  return result.rows[0];
};

const assertFaultRollback = async (
  client: PoolClient,
  seal: WeeklyCertificationSeal,
  collidingDailyArtifactId: string,
): Promise<void> => {
  assert(
    /^[0-9a-f-]{36}$/iu.test(collidingDailyArtifactId),
    "certification seal must expose a daily artifact id",
  );
  const before = await readWeeklyState(client);
  await assertRejectsContaining(
    () =>
      persistWithSerializableRetry(
        client,
        buildPayload(seal, collidingDailyArtifactId, "fault"),
      ),
    "duplicate key",
    "an artifact insert fault must abort weekly persistence",
  );
  assertDeepEqual(
    await readWeeklyState(client),
    before,
    "artifact failure must roll back the precreated weekly slot",
  );
};

const invalidBindings = (
  payload: WeeklyAtomicPayload,
): readonly (readonly [string, WeeklyAtomicPayload])[] => [
  [
    "session scope diverged",
    { ...payload, tenantId: "99999999-9999-4999-8999-999999999999" },
  ],
  [
    "week binding is invalid",
    { ...payload, weekEndedOn: "2026-06-08" },
  ],
  [
    "immutable proof binding is invalid",
    { ...payload, sealSha256: "f".repeat(64) },
  ],
  [
    "immutable database certification seal",
    { ...payload, manifestSealSha256: "e".repeat(64) },
  ],
];

const assertDirectWeeklyWriteDenied = async (
  client: PoolClient,
  payload: WeeklyAtomicPayload,
): Promise<void> => {
  await assertRejectsContaining(
    () =>
      client.query(
        `UPDATE reader_summary_artifacts
            SET headline = headline
          WHERE id = $1::uuid`,
        [payload.artifactId],
      ),
    "database publication authority",
    "runtime must not mutate a weekly artifact directly",
  );
};

const assertDailyRowsUnchanged = async (
  client: PoolClient,
  seal: WeeklyCertificationSeal,
): Promise<void> => {
  const artifactIds = seal.canonical_record.days.map((day) =>
    String(day.artifactId),
  );
  const result = await client.query<{ readonly daily_rows: string }>(
    `SELECT count(*)::TEXT AS daily_rows
       FROM reader_summary_artifacts
      WHERE id = ANY($1::uuid[])
        AND cadence = 'daily'
        AND status IN ('COMPLETED', 'NO_SIGNAL')`,
    [artifactIds],
  );
  assert(
    result.rows[0]?.daily_rows === "7",
    "weekly atomic persistence must leave all seven daily artifacts unchanged",
  );
};

const reverseObject = (
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(value).reverse());
