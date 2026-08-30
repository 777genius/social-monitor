import {
  canonicalJsonBytes,
  sha256,
} from "./reader-summary-daily-canonical-recovery-v4";
import type { RecoveryPostgresClient } from "./reader-summary-production-recovery-postgres-contract";

const tenantId = "00000000-0000-7000-8000-000000000901";
const workspaceId = "00000000-0000-7000-8000-000000000902";
const ownerRole = '"social_monitor_reader_summary_publication_owner"';
const terminalRole = '"social_monitor_reader_summary_daily_terminal"';
const routeTable =
  'public."reader_summary_daily_canonical_recovery_v4_route_authorities"';

type Client = Pick<RecoveryPostgresClient, "query">;

/**
 * PostgreSQL 18 assertions for the append-only active model-route overlay.
 * Every mutation probe is isolated in a transaction that is always rolled back.
 */
export const assertReaderSummaryActiveModelRoutePostgresContract = async (
  auditor: RecoveryPostgresClient,
): Promise<void> => {
  await assertExactCanonicalAuthority(auditor);
  await assertCatalogSecurity(auditor);
  await assertImmutableAuthority(auditor);
  await assertLegacyCompletionRejectedWithoutMutation(auditor);
};

const assertExactCanonicalAuthority = async (client: Client): Promise<void> => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query(`SET LOCAL ROLE ${ownerRole}`);
    const result = await client.query<{
      routeCount: string;
      planCount: string;
      plansMatch: boolean;
      recordExact: boolean;
      bytesExact: boolean;
      shaExact: boolean;
      legacyShaExact: boolean;
      canonicalSha256: string;
    }>(`
      WITH first_plan AS (
        SELECT canonical_record, canonical_bytes, btrim(canonical_sha256) AS canonical_sha256
        FROM public."reader_summary_daily_canonical_recovery_v4_plans"
        WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID AND ordinal = 1
      ), second_plan AS (
        SELECT canonical_record, canonical_bytes, btrim(canonical_sha256) AS canonical_sha256
        FROM public."reader_summary_daily_canonical_recovery_v4_plans"
        WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID AND ordinal = 2
      ), expected AS (
        SELECT jsonb_build_object(
          'schemaVersion', 'reader_summary.daily_canonical_recovery_route_authority.v2',
          'tenantId', $1::UUID::TEXT,
          'workspaceId', $2::UUID::TEXT,
          'legacyPlanIdentity', first_plan.canonical_record->>'identity',
          'legacyPlanSha256', first_plan.canonical_sha256,
          'supersededModelContract', jsonb_build_object(
            'purpose', 'social_monitor.reader_summary.weekly.generate',
            'provider', 'codex',
            'model', 'gpt-5.6-sol',
            'reasoningEffort', 'xhigh',
            'runtimeEngine', 'subscription-runtime-cli',
            'selectedOutputKind', 'output_text'
          ),
          'modelContract', jsonb_build_object(
            'purpose', 'social_monitor.reader_summary.daily.canonical_recovery.v2',
            'provider', 'codex',
            'model', 'gpt-5.6-sol',
            'reasoningEffort', 'high',
            'runtimeEngine', 'subscription-runtime-cli',
            'selectedOutputKind', 'output_text'
          )
        ) AS canonical_record
        FROM first_plan
      )
      SELECT
        (SELECT count(*)::TEXT FROM ${routeTable}) AS "routeCount",
        (SELECT count(*)::TEXT
         FROM public."reader_summary_daily_canonical_recovery_v4_plans"
         WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID) AS "planCount",
        first_plan.canonical_record = second_plan.canonical_record
          AND first_plan.canonical_bytes = second_plan.canonical_bytes
          AND first_plan.canonical_sha256 = second_plan.canonical_sha256
          AND COALESCE(first_plan.canonical_record->>'identity', '') <> ''
          AND first_plan.canonical_bytes = convert_to(
            public."reader_summary_weekly_canonical_json_unbounded"(
              first_plan.canonical_record
            ), 'UTF8'
          )
          AND first_plan.canonical_sha256 = encode(
            sha256(first_plan.canonical_bytes), 'hex'
          ) AS "plansMatch",
        authority.canonical_record = expected.canonical_record AS "recordExact",
        authority.canonical_bytes = convert_to(
          public."reader_summary_weekly_canonical_json_unbounded"(
            expected.canonical_record
          ), 'UTF8'
        ) AS "bytesExact",
        btrim(authority.canonical_sha256) = encode(
          sha256(authority.canonical_bytes), 'hex'
        ) AS "shaExact",
        btrim(authority.legacy_plan_sha256) = first_plan.canonical_sha256
          AND authority.canonical_record->>'legacyPlanSha256' =
            first_plan.canonical_sha256 AS "legacyShaExact",
        btrim(authority.canonical_sha256) AS "canonicalSha256"
      FROM ${routeTable} AS authority
      CROSS JOIN first_plan
      CROSS JOIN second_plan
      CROSS JOIN expected
      WHERE authority.tenant_id = $1::UUID AND authority.workspace_id = $2::UUID
    `, [tenantId, workspaceId]);
    const row = result.rows[0];
    assert(
      result.rows.length === 1 && row?.routeCount === "1" && row.planCount === "2" &&
        row.plansMatch === true && row.recordExact === true && row.bytesExact === true &&
        row.shaExact === true && row.legacyShaExact === true &&
        /^[0-9a-f]{64}$/u.test(row.canonicalSha256),
      `active model-route canonical authority diverged: ${JSON.stringify(row)}`,
    );
  } finally {
    await client.query("ROLLBACK");
  }
};

const assertCatalogSecurity = async (client: Client): Promise<void> => {
  const result = await client.query<{
    tableOwner: string;
    rlsEnabled: boolean;
    rlsForced: boolean;
    policyExact: boolean;
    triggersExact: boolean;
    functionsExact: boolean;
    ownerFunctionExecute: boolean;
    restrictedFunctionExecute: boolean;
    ownerTablePrivileges: boolean;
    restrictedTablePrivileges: boolean;
  }>(`
    WITH target_relation AS (
      SELECT relation.*
      FROM pg_catalog.pg_class AS relation
      WHERE relation.oid = '${routeTable}'::REGCLASS
    ), owner_role AS (
      SELECT oid FROM pg_catalog.pg_roles
      WHERE rolname = 'social_monitor_reader_summary_publication_owner'
    ), route_functions AS (
      SELECT procedure.*
      FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid = ANY(ARRAY[
        'public.reject_rs_daily_v4_route_authority_mutation()'::REGPROCEDURE,
        'public.rs_daily_v4_active_route_record(UUID,UUID)'::REGPROCEDURE,
        'public.assert_rs_daily_v4_active_route_authority(UUID,UUID)'::REGPROCEDURE,
        'public.adopt_rs_daily_v4_active_route_authority(UUID,UUID)'::REGPROCEDURE
      ])
    ), restricted_roles(role_name) AS (
      VALUES
        ('public'),
        ('social_monitor_reader_summary_daily_terminal'),
        ('social_monitor_reader_summary_publication_runtime'),
        ('social_monitor_tenant_system_runtime')
    )
    SELECT
      pg_catalog.pg_get_userbyid(target_relation.relowner) AS "tableOwner",
      target_relation.relrowsecurity AS "rlsEnabled",
      target_relation.relforcerowsecurity AS "rlsForced",
      (SELECT count(*) = 1 AND bool_and(
         policy.polname = 'rs_daily_v4_route_authorities_owner_only'
         AND policy.polcmd = '*'
         AND policy.polpermissive
         AND policy.polroles = ARRAY[owner_role.oid]::OID[]
         AND pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) = 'true'
         AND pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) = 'true'
       )
       FROM pg_catalog.pg_policy AS policy
       CROSS JOIN owner_role
       WHERE policy.polrelid = target_relation.oid) AS "policyExact",
      (SELECT count(*) = 2 AND bool_and(
         trigger.tgenabled = 'O'
         AND trigger.tgfoid =
           'public.reject_rs_daily_v4_route_authority_mutation()'::REGPROCEDURE
         AND CASE trigger.tgname
           WHEN 'rs_daily_v4_route_authorities_immutable' THEN trigger.tgtype = 27
           WHEN 'rs_daily_v4_route_authorities_no_truncate' THEN trigger.tgtype = 34
           ELSE FALSE
         END
       )
       FROM pg_catalog.pg_trigger AS trigger
       WHERE trigger.tgrelid = target_relation.oid AND NOT trigger.tgisinternal
      ) AS "triggersExact",
      (SELECT count(*) = 4 AND bool_and(
         procedure.prosecdef
         AND procedure.provolatile = 'v'
         AND procedure.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
         AND pg_catalog.pg_get_userbyid(procedure.proowner) =
           'social_monitor_reader_summary_publication_owner'
         AND NOT EXISTS (
           SELECT 1
           FROM pg_catalog.aclexplode(COALESCE(
             procedure.proacl,
             pg_catalog.acldefault('f', procedure.proowner)
           )) AS privilege
           WHERE privilege.privilege_type = 'EXECUTE'
             AND privilege.grantee <> procedure.proowner
         )
       ) FROM route_functions AS procedure) AS "functionsExact",
      (SELECT count(*) = 4 AND bool_and(pg_catalog.has_function_privilege(
         'social_monitor_reader_summary_publication_owner', procedure.oid, 'EXECUTE'
       )) FROM route_functions AS procedure) AS "ownerFunctionExecute",
      (SELECT bool_or(pg_catalog.has_function_privilege(
         restricted_roles.role_name, procedure.oid, 'EXECUTE'
       )) FROM restricted_roles CROSS JOIN route_functions AS procedure
      ) AS "restrictedFunctionExecute",
      pg_catalog.has_table_privilege(
        'social_monitor_reader_summary_publication_owner', target_relation.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'
      ) AS "ownerTablePrivileges",
      (SELECT bool_or(pg_catalog.has_table_privilege(
         restricted_roles.role_name, target_relation.oid,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'
       )) FROM restricted_roles) AS "restrictedTablePrivileges"
    FROM target_relation
  `);
  const row = result.rows[0];
  assert(
    result.rows.length === 1 &&
      row?.tableOwner === "social_monitor_reader_summary_publication_owner" &&
      row.rlsEnabled === true && row.rlsForced === true && row.policyExact === true &&
      row.triggersExact === true && row.functionsExact === true &&
      row.ownerFunctionExecute === true && row.restrictedFunctionExecute === false &&
      row.ownerTablePrivileges === true && row.restrictedTablePrivileges === false,
    `active model-route catalog security diverged: ${JSON.stringify(row)}`,
  );
};

const assertImmutableAuthority = async (client: Client): Promise<void> => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query(`SET LOCAL ROLE ${ownerRole}`);
    const before = await routeSnapshot(client);
    const mutations = [
      `UPDATE ${routeTable} SET adopted_at = adopted_at
       WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID`,
      `DELETE FROM ${routeTable}
       WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID`,
      `TRUNCATE TABLE ${routeTable}`,
    ] as const;
    for (const [index, sql] of mutations.entries()) {
      const savepoint = `active_route_immutable_${index + 1}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      let rejection: unknown;
      try {
        await client.query(sql, index === 2 ? [] : [tenantId, workspaceId]);
      } catch (error) {
        rejection = error;
      } finally {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      }
      assert(
        rejection !== undefined && errorMessage(rejection).includes(
          "daily canonical recovery v4 route authority is immutable",
        ),
        `active model-route mutation ${index + 1} was not rejected by the immutable trigger`,
      );
      assert(
        (await routeSnapshot(client)) === before,
        `active model-route mutation ${index + 1} changed the authority snapshot`,
      );
    }
  } finally {
    await client.query("ROLLBACK");
  }
};

const assertLegacyCompletionRejectedWithoutMutation = async (
  client: Client,
): Promise<void> => {
  const workerId = "active-route-legacy-rejection-pg18";
  const responseBytes = canonicalJsonBytes(validOutput);
  const responseSha256 = sha256(responseBytes);
  const attestation = {
    schemaVersion: 1,
    requestId: "active-route-legacy-rejection",
    purpose: "social_monitor.reader_summary.weekly.generate",
    canonicalRequestSha256: "a".repeat(64),
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort: "xhigh",
    runtimeEngine: "subscription-runtime-cli",
    runtimePackageVersion: "1.0.0",
    launcherSha256: "b".repeat(64),
    selectedOutputKind: "output_text",
    selectedOutputSha256: responseSha256,
  } as const;
  const attestationBytes = canonicalJsonBytes(attestation);
  const attestationSha256 = sha256(attestationBytes);

  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query(`SET LOCAL SESSION AUTHORIZATION ${terminalRole}`);
    const claim = await client.query<{
      outcome: string;
      requestedUtcDate: string | null;
      modelJobIdentity: string | null;
      attemptOrdinal: string | null;
      sourceAuthoritySha256: string | null;
      fencingToken: string | null;
    }>(`
      SELECT outcome,
        requested_utc_date::TEXT AS "requestedUtcDate",
        btrim(model_job_identity) AS "modelJobIdentity",
        attempt_ordinal::TEXT AS "attemptOrdinal",
        btrim(source_canonical_sha256) AS "sourceAuthoritySha256",
        fencing_token::TEXT AS "fencingToken"
      FROM public."claim_reader_summary_daily_canonical_recovery_v4"(
        $1::UUID,$2::UUID,$3::TEXT,$4::TIMESTAMPTZ
      )
    `, [tenantId, workspaceId, workerId, new Date().toISOString()]);
    const work = claim.rows[0];
    assert(
      claim.rows.length === 1 && work?.outcome === "CLAIMED" &&
        work.requestedUtcDate === "2026-07-23" &&
        typeof work.modelJobIdentity === "string" &&
        /^[0-9a-f]{64}$/u.test(work.modelJobIdentity) &&
        work.attemptOrdinal === "1" &&
        typeof work.sourceAuthoritySha256 === "string" &&
        /^[0-9a-f]{64}$/u.test(work.sourceAuthoritySha256) &&
        typeof work.fencingToken === "string" && /^[1-9][0-9]*$/u.test(work.fencingToken),
      `active model-route legacy rejection did not claim exact Jul23 work: ${JSON.stringify(work)}`,
    );
    await client.query(`
      SELECT public."mark_reader_summary_daily_canonical_recovery_v4_running"(
        $1::UUID,$2::UUID,$3::DATE,$4::CHAR(64),$5::SMALLINT,$6::TEXT,
        $7::BIGINT,$8::TIMESTAMPTZ
      )
    `, [
      tenantId, workspaceId, work.requestedUtcDate, work.modelJobIdentity,
      work.attemptOrdinal, workerId, work.fencingToken, new Date().toISOString(),
    ]);
    const receipt = {
      schemaVersion: 2,
      modelJobIdentity: work.modelJobIdentity,
      requestedUtcDate: work.requestedUtcDate,
      sourceAuthoritySha256: work.sourceAuthoritySha256,
      canonicalOutputSha256: responseSha256,
      canonicalOutputByteLength: responseBytes.length,
      rawOutputSha256: responseSha256,
      rawOutputByteLength: responseBytes.length,
      attestationSha256,
      attestation,
    } as const;
    const receiptBytes = canonicalJsonBytes(receipt);

    await client.query("RESET SESSION AUTHORIZATION");
    const before = await effectiveLeaseSnapshotAsOwner(client);
    await client.query(`SET LOCAL SESSION AUTHORIZATION ${terminalRole}`);
    const savepoint = "active_route_legacy_completion";
    await client.query(`SAVEPOINT ${savepoint}`);
    let rejection: unknown;
    try {
      await client.query(`
        SELECT * FROM public."complete_reader_summary_daily_canonical_recovery_v4"(
          $1::UUID,$2::UUID,$3::DATE,$4::CHAR(64),$5::SMALLINT,$6::TEXT,
          $7::BIGINT,$8::TIMESTAMPTZ,$9::BYTEA,$10::CHAR(64),$11::JSONB,
          $12::BYTEA,$13::CHAR(64),$14::BYTEA,$15::CHAR(64)
        )
      `, [
        tenantId, workspaceId, work.requestedUtcDate, work.modelJobIdentity,
        work.attemptOrdinal, workerId, work.fencingToken, new Date().toISOString(),
        responseBytes, responseSha256, JSON.stringify(attestation),
        attestationBytes, attestationSha256, receiptBytes, sha256(receiptBytes),
      ]);
    } catch (error) {
      rejection = error;
    } finally {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    }
    await client.query("RESET SESSION AUTHORIZATION");
    const after = await effectiveLeaseSnapshotAsOwner(client);
    assert(
      rejection !== undefined && errorMessage(rejection).includes(
        "daily canonical recovery v4 output text attestation is invalid",
      ),
      `legacy weekly.generate/xhigh completion was rejected for the wrong reason: ${errorMessage(rejection)}`,
    );
    assert(
      after === before,
      "legacy weekly.generate/xhigh completion changed the effective lease snapshot",
    );
  } finally {
    await client.query("ROLLBACK");
  }
};

const routeSnapshot = async (client: Client): Promise<string> => {
  const result = await client.query<{ snapshot: string }>(`
    SELECT encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json_unbounded"(
        jsonb_agg(to_jsonb(authority) ORDER BY authority.tenant_id, authority.workspace_id)
      ), 'UTF8'
    )), 'hex') AS snapshot
    FROM ${routeTable} AS authority
  `);
  return exactSnapshot(result.rows[0]?.snapshot, "active model-route authority");
};

const effectiveLeaseSnapshotAsOwner = async (client: Client): Promise<string> => {
  await client.query(`SET LOCAL ROLE ${ownerRole}`);
  try {
    const result = await client.query<{ snapshot: string }>(`
      SELECT encode(sha256(convert_to(
        public."reader_summary_weekly_canonical_json_unbounded"(
          jsonb_build_object(
            'original', (SELECT to_jsonb(lease)
              FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
              WHERE lease.tenant_id = $1::UUID AND lease.workspace_id = $2::UUID
                AND lease.requested_utc_date = DATE '2026-07-23'),
            'retry', (SELECT to_jsonb(retry)
              FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
              WHERE retry.tenant_id = $1::UUID AND retry.workspace_id = $2::UUID
                AND retry.requested_utc_date = DATE '2026-07-23')
          )
        ), 'UTF8'
      )), 'hex') AS snapshot
    `, [tenantId, workspaceId]);
    return exactSnapshot(result.rows[0]?.snapshot, "active model-route effective lease");
  } finally {
    await client.query("RESET ROLE");
  }
};

const exactSnapshot = (value: unknown, label: string): string => {
  assert(
    typeof value === "string" && /^[0-9a-f]{64}$/u.test(value),
    `${label} snapshot is invalid`,
  );
  return value;
};

const validOutput = Object.freeze({
  headline: "Canonical route rejection probe",
  executiveSummary: "Immutable evidence only.",
  narrativeSections: [],
  content: {},
  topStories: [],
  interestHighlights: [],
  repeatedSignals: [],
  risksAndUnknowns: [],
  citationMap: [],
  qualityFlags: ["no_signal"],
  confidence: { level: "low", score: 0, rationale: "No invented evidence." },
  noSignalReason: "No immutable signal was selected.",
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
