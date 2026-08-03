import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import {
  buildReaderSummaryWeeklyReviewManifestPersistencePayload,
} from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-review-manifest";
import {
  canonicalizeReaderSummaryWeeklyJson,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  createReaderSummaryWeeklyReviewManifest,
  deriveReaderSummaryWeeklyReviewStoryCandidates,
  type ReaderSummaryWeeklyReviewAuthority,
  type ReaderSummaryWeeklyReviewSelection,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";
import {
  assertPostgres as assert,
  assertPostgresDeepEqual as assertDeepEqual,
  assertPostgresRejectsContaining as assertRejectsContaining,
} from "./reader-summary-publication-postgres-assertions";
import {
  readerSummaryPublicationFixtureScope,
  setReaderSummaryPublicationSessionScope,
} from "./reader-summary-publication-postgres-fixture-scope";
import {
  createReaderSummaryPublicationRunningFixture,
} from "./reader-summary-publication-postgres-running-fixture";
import {
  readerSummaryPublicationDbOwnedRequest,
} from "./reader-summary-weekly-publication-evidence-postgres-contract";
import {
  loadReaderSummaryWeeklyProductionDbState,
  readerSummaryWeeklyReviewAuthorityFromProductionState,
  resolveReaderSummaryWeeklyProductionWindow,
} from "./reader-summary-weekly-production-postgres-contract";

type PersistRow = Readonly<{
  outcome: "persisted" | "replayed";
  manifest_id: string;
  manifest_sha256: string;
  seal_id: string;
}>;

export type ReaderSummaryWeeklyReviewManifestCatalogSnapshot = Readonly<{
  append_only_trigger_contract: string[] | null;
  capability_function_execute: boolean | null;
  capability_table_acl: boolean | null;
  database_owner_function_execute: boolean | null;
  database_owner_table_acl: boolean | null;
  function_definition: string | null;
  function_fixed_search_path: boolean | null;
  function_owner: string | null;
  function_security_definer: boolean | null;
  manifest_function: string | null;
  mutation_function: string | null;
  mutation_function_fixed_search_path: boolean | null;
  mutation_function_owner: string | null;
  publication_owner_schema_create: boolean | null;
  public_function_execute: boolean | null;
  public_table_acl: boolean | null;
  rls_enabled: boolean | null;
  rls_forced: boolean | null;
  runtime_direct_execute: boolean | null;
  runtime_direct_select: boolean | null;
  runtime_select_only: boolean | null;
  table_name: string | null;
  table_owner: string | null;
  tenant_policy: boolean | null;
  tenant_scope_week_unique_constraint: boolean | null;
  unexpected_function_execute: boolean | null;
  unmanaged_index_count: string | null;
}>;

type ManifestContractParams = Readonly<{
  adminClient: PoolClient;
  auditorClient: PoolClient;
  concurrentRuntimeClient: PoolClient;
  runtimeClient: PoolClient;
  runtimeRole: string;
}>;

type MutablePayload = Record<string, unknown>;

const tableName = "reader_summary_weekly_review_manifests";
const functionName = "persist_reader_summary_weekly_review_manifest(jsonb)";
const mutationFunctionName =
  "reject_reader_summary_weekly_review_manifest_mutation()";
const publicationOwner = "social_monitor_reader_summary_publication_owner";
const requiredTriggerContract = [
  "reader_summary_weekly_review_manifests_append_only_delete:11",
  "reader_summary_weekly_review_manifests_append_only_truncate:34",
  "reader_summary_weekly_review_manifests_append_only_update:19",
];
const historicalWeekStartedOn = "2026-07-20";
const historicalWeekDates = [
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
] as const;

export const assertReaderSummaryWeeklyReviewManifestPostgresContract = async (
  params: ManifestContractParams,
): Promise<void> => {
  await assertCatalogContract(params);
  const authority = await createHistoricalAuthority(params.runtimeClient);
  const candidate = evolutionCandidate(authority);
  const validSelection = evolutionSelection(candidate);
  const manifest = createManifest(authority, [validSelection]);
  const payload = payloadFor(manifest);

  await assertRejectedPayloads(params.runtimeClient, authority, candidate, payload);
  const outcomes = await Promise.all([
    persistWithSerializableRetry(params.runtimeClient, payload),
    persistWithSerializableRetry(params.concurrentRuntimeClient, payload),
  ]);
  assertDeepEqual(
    outcomes.map((row) => row.outcome).sort(),
    ["persisted", "replayed"],
    "identical weekly review manifest race must persist once and replay once",
  );
  for (const row of outcomes) assertPersistedRow(row, manifest);

  const beforeReplay = await manifestState(params.runtimeClient, manifest.manifestId);
  const replay = await persistWithSerializableRetry(
    params.runtimeClient,
    reversePayload(payload),
  );
  assert(replay.outcome === "replayed", "exact weekly review replay must be idempotent");
  assertPersistedRow(replay, manifest);
  assertDeepEqual(
    await manifestState(params.runtimeClient, manifest.manifestId),
    beforeReplay,
    "exact weekly review replay must not mutate durable state",
  );

  const conflicting = createManifest(authority, [{
    story: candidate.story,
    label: "observation",
    citationSelectors: [candidate.citations[0]!.selector],
  }]);
  await assertRejectsContaining(
    () => persistWithSerializableRetry(params.runtimeClient, payloadFor(conflicting)),
    "conflicts with immutable seal-bound replay",
    "different manifest content cannot reuse a certification seal",
  );
  assertDeepEqual(
    await manifestState(params.runtimeClient, manifest.manifestId),
    beforeReplay,
    "conflicting weekly review replay must not mutate durable state",
  );

  await assertTenantScope(params.runtimeClient, payload, manifest.manifestId);
  await assertRuntimeWriteDenied(params.runtimeClient, manifest.manifestId);
  await assertAppendOnlyMutationGuards(params.adminClient, manifest.manifestId);
};

const assertCatalogContract = async (
  params: ManifestContractParams,
): Promise<void> => {
  const result = await params.auditorClient.query<ReaderSummaryWeeklyReviewManifestCatalogSnapshot>(
    `WITH runtime_login AS (
       SELECT member_row.oid
       FROM pg_catalog.pg_auth_members AS membership_row
       JOIN pg_catalog.pg_roles AS granted_row
         ON granted_row.oid = membership_row.roleid
       JOIN pg_catalog.pg_roles AS member_row
         ON member_row.oid = membership_row.member
       WHERE granted_row.rolname =
           'social_monitor_reader_summary_publication_runtime'
         AND NOT membership_row.admin_option
         AND membership_row.inherit_option
         AND NOT membership_row.set_option
     ), target_table AS (
       SELECT class_row.*
       FROM pg_catalog.pg_class AS class_row
       WHERE class_row.oid = $1::regclass
     ), persist_function AS (
       SELECT procedure_row.*,
              pg_catalog.pg_get_functiondef(procedure_row.oid) AS definition
       FROM pg_catalog.pg_proc AS procedure_row
       WHERE procedure_row.oid = $2::regprocedure
     ), mutation_function AS (
       SELECT procedure_row.*
       FROM pg_catalog.pg_proc AS procedure_row
       WHERE procedure_row.oid = $3::regprocedure
     )
     SELECT
       target_table.oid::regclass::text AS table_name,
       pg_catalog.pg_get_userbyid(target_table.relowner) AS table_owner,
       target_table.relrowsecurity AS rls_enabled,
       target_table.relforcerowsecurity AS rls_forced,
       EXISTS (
         SELECT 1 FROM pg_catalog.pg_policy AS policy_row
         WHERE policy_row.polrelid = target_table.oid
           AND policy_row.polname = 'tenant_isolation'
       ) AS tenant_policy,
       persist_function.oid::regprocedure::text AS manifest_function,
       pg_catalog.pg_get_userbyid(persist_function.proowner) AS function_owner,
       persist_function.prosecdef AS function_security_definer,
       persist_function.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
         AS function_fixed_search_path,
       persist_function.definition AS function_definition,
       mutation_function.oid::regprocedure::text AS mutation_function,
       pg_catalog.pg_get_userbyid(mutation_function.proowner) AS mutation_function_owner,
       mutation_function.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
         AS mutation_function_fixed_search_path,
       pg_catalog.has_schema_privilege(
         'social_monitor_reader_summary_publication_owner',
         'public',
         'CREATE'
       ) AS publication_owner_schema_create,
       EXISTS (
         SELECT 1 FROM pg_catalog.aclexplode(
           COALESCE(target_table.relacl,
             pg_catalog.acldefault('r', target_table.relowner))
         ) AS acl_row
         WHERE acl_row.grantee = 0
       ) AS public_table_acl,
       EXISTS (
         SELECT 1 FROM pg_catalog.aclexplode(
           COALESCE(target_table.relacl,
             pg_catalog.acldefault('r', target_table.relowner))
         ) AS acl_row
         JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = acl_row.grantee
         WHERE role_row.rolname = 'pg_database_owner'
       ) AS database_owner_table_acl,
       EXISTS (
         SELECT 1 FROM pg_catalog.aclexplode(
           COALESCE(target_table.relacl,
             pg_catalog.acldefault('r', target_table.relowner))
         ) AS acl_row
         JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = acl_row.grantee
         WHERE role_row.rolname = 'social_monitor_reader_summary_publication_runtime'
       ) AS capability_table_acl,
       (SELECT count(*) FROM runtime_login) = 1
         AND pg_catalog.has_table_privilege(
           (SELECT oid FROM runtime_login), target_table.oid, 'SELECT'
         )
         AND NOT pg_catalog.has_table_privilege(
           (SELECT oid FROM runtime_login), target_table.oid,
           'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
         ) AS runtime_select_only,
       EXISTS (
         SELECT 1 FROM pg_catalog.aclexplode(
           COALESCE(target_table.relacl,
             pg_catalog.acldefault('r', target_table.relowner))
         ) AS acl_row
         JOIN runtime_login ON runtime_login.oid = acl_row.grantee
         WHERE acl_row.privilege_type = 'SELECT'
       ) AS runtime_direct_select,
       EXISTS (
         SELECT 1 FROM pg_catalog.aclexplode(
           COALESCE(persist_function.proacl,
             pg_catalog.acldefault('f', persist_function.proowner))
         ) AS acl_row
         WHERE acl_row.grantee = 0 AND acl_row.privilege_type = 'EXECUTE'
       ) AS public_function_execute,
       EXISTS (
         SELECT 1 FROM pg_catalog.aclexplode(
           COALESCE(persist_function.proacl,
             pg_catalog.acldefault('f', persist_function.proowner))
         ) AS acl_row
         JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = acl_row.grantee
         WHERE role_row.rolname = 'pg_database_owner'
           AND acl_row.privilege_type = 'EXECUTE'
       ) AS database_owner_function_execute,
       EXISTS (
         SELECT 1 FROM pg_catalog.aclexplode(
           COALESCE(persist_function.proacl,
             pg_catalog.acldefault('f', persist_function.proowner))
         ) AS acl_row
         JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = acl_row.grantee
         WHERE role_row.rolname = 'social_monitor_reader_summary_publication_runtime'
           AND acl_row.privilege_type = 'EXECUTE'
       ) AS capability_function_execute,
       (SELECT count(*) FROM runtime_login) = 1
         AND pg_catalog.has_function_privilege(
           (SELECT oid FROM runtime_login), persist_function.oid, 'EXECUTE'
         ) AS runtime_direct_execute,
       EXISTS (
         SELECT 1 FROM pg_catalog.aclexplode(
           COALESCE(persist_function.proacl,
             pg_catalog.acldefault('f', persist_function.proowner))
         ) AS acl_row
         WHERE acl_row.privilege_type = 'EXECUTE'
           AND acl_row.grantee NOT IN (
             persist_function.proowner,
             (SELECT oid FROM runtime_login)
           )
       ) AS unexpected_function_execute,
       ARRAY(
         SELECT trigger_row.tgname || ':' || trigger_row.tgtype::text
         FROM pg_catalog.pg_trigger AS trigger_row
         WHERE trigger_row.tgrelid = target_table.oid
           AND NOT trigger_row.tgisinternal
           AND trigger_row.tgfoid =
             'public.reject_reader_summary_weekly_review_manifest_mutation()'::regprocedure
         ORDER BY trigger_row.tgname
       ) AS append_only_trigger_contract,
       EXISTS (
         SELECT 1
         FROM pg_catalog.pg_constraint AS constraint_row
         WHERE constraint_row.conrelid = target_table.oid
           AND constraint_row.contype = 'u'
           AND constraint_row.conname =
             'reader_summary_weekly_review_manifests_scope_week_key'
           AND (
             SELECT string_agg(
               attribute_row.attname::text,
               ',' ORDER BY key_column.ordinality
             )
             FROM unnest(constraint_row.conkey) WITH ORDINALITY AS
               key_column(attnum, ordinality)
             JOIN pg_catalog.pg_attribute AS attribute_row
               ON attribute_row.attrelid = target_table.oid
               AND attribute_row.attnum = key_column.attnum
           ) = 'tenant_id,workspace_id,scope_type,scope_key,week_started_on'
       ) AS tenant_scope_week_unique_constraint,
       (
         SELECT count(*)::text
         FROM pg_catalog.pg_index AS index_row
         LEFT JOIN pg_catalog.pg_constraint AS constraint_row
           ON constraint_row.conindid = index_row.indexrelid
         WHERE index_row.indrelid = target_table.oid
           AND constraint_row.oid IS NULL
       ) AS unmanaged_index_count
     FROM target_table
     FULL JOIN persist_function ON TRUE
     FULL JOIN mutation_function ON TRUE
     WHERE NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class AS seal_relation
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(seal_relation.relacl, ARRAY[]::pg_catalog.aclitem[])
       ) AS acl_row
       JOIN pg_catalog.pg_roles AS grantee_role
         ON grantee_role.oid = acl_row.grantee
       WHERE seal_relation.oid =
           'public.reader_summary_weekly_certification_seals'::REGCLASS
         AND grantee_role.rolname =
           'social_monitor_reader_summary_publication_owner'
         AND acl_row.privilege_type = 'REFERENCES'
     )
       AND NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_attribute AS seal_column
         CROSS JOIN LATERAL pg_catalog.aclexplode(
           COALESCE(seal_column.attacl, ARRAY[]::pg_catalog.aclitem[])
         ) AS acl_row
         JOIN pg_catalog.pg_roles AS grantee_role
           ON grantee_role.oid = acl_row.grantee
         WHERE seal_column.attrelid =
             'public.reader_summary_weekly_certification_seals'::REGCLASS
           AND seal_column.attname = 'seal_id'
           AND grantee_role.rolname =
             'social_monitor_reader_summary_publication_owner'
           AND acl_row.privilege_type = 'REFERENCES'
       )`,
    [
      `public.${tableName}`,
      `public.${functionName}`,
      `public.${mutationFunctionName}`,
    ],
  );
  const row = result.rows[0];
  assert(
    readerSummaryWeeklyReviewManifestCatalogIsSecure(row, result.rows.length),
    "weekly review manifest PostgreSQL catalog contract is insecure or incomplete",
  );
};

export const readerSummaryWeeklyReviewManifestCatalogIsSecure = (
  row: ReaderSummaryWeeklyReviewManifestCatalogSnapshot | undefined,
  rowCount: number,
): boolean => {
  const definition = row?.function_definition ?? "";
  return rowCount === 1 &&
    row !== undefined &&
    row.table_name === tableName &&
    row.table_owner === publicationOwner &&
    row.publication_owner_schema_create === false &&
    row.rls_enabled === true &&
    row.rls_forced === true &&
    row.tenant_policy === true &&
    row.manifest_function === functionName &&
    row.function_owner === publicationOwner &&
    row.function_security_definer === true &&
    row.function_fixed_search_path === true &&
    row.mutation_function === mutationFunctionName &&
    row.mutation_function_owner === publicationOwner &&
    row.mutation_function_fixed_search_path === true &&
    row.public_table_acl === false &&
    row.database_owner_table_acl === false &&
    row.capability_table_acl === false &&
    row.runtime_select_only === true &&
    row.runtime_direct_select === true &&
    row.public_function_execute === false &&
    row.database_owner_function_execute === false &&
    row.capability_function_execute === false &&
    row.runtime_direct_execute === true &&
    row.unexpected_function_execute === false &&
    JSON.stringify(row.append_only_trigger_contract) ===
      JSON.stringify(requiredTriggerContract) &&
    row.tenant_scope_week_unique_constraint === true &&
    row.unmanaged_index_count === "0" &&
    /current_setting\('transaction_isolation'\)\s*<>\s*'serializable'/iu.test(definition) &&
    /FOR\s+UPDATE/iu.test(definition) &&
    /FOR\s+SHARE\s+OF\s+evidence_row/iu.test(definition) &&
    /DATE\s+'2026-07-23'/iu.test(definition) &&
    /historical_unavailable/iu.test(definition) &&
    /missing sealed evidence/iu.test(definition) &&
    /cannot duplicate a story on one date/iu.test(definition) &&
    !/\bAS\s+seal\b/iu.test(definition) &&
    !/\bLOCK\s+TABLE\b/iu.test(definition);
};

export const assertReaderSummaryWeeklyReviewManifestMigrationContract = (
  sql: string,
): void => {
  const owner = '"social_monitor_reader_summary_publication_owner"';
  const schemaOwner = '"social_monitor_public_schema_owner"';
  const certificationSealReferencesGrant = `GRANT REFERENCES ("seal_id") ON TABLE "reader_summary_weekly_certification_seals"
TO ${owner};`;
  const certificationSealReferencesRevocation = `REVOKE REFERENCES ("seal_id") ON TABLE "reader_summary_weekly_certification_seals"
FROM ${owner};`;
  const sealOwnershipNormalization = `DO $normalize_weekly_certification_seal_owner$
DECLARE
  v_seal_owner NAME;
  v_seal_relation_kind "char";
BEGIN
  SELECT pg_get_userbyid(relation.relowner), relation.relkind
  INTO v_seal_owner, v_seal_relation_kind
  FROM pg_class AS relation
  WHERE relation.oid =
    to_regclass('public.reader_summary_weekly_certification_seals');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'weekly certification seal is missing';
  END IF;
  IF v_seal_relation_kind NOT IN ('r', 'p') OR v_seal_owner NOT IN (
    'social_monitor_public_schema_owner',
    'social_monitor_reader_summary_publication_owner'
  ) THEN
    RAISE EXCEPTION
      'weekly certification seal has an unexpected owner or relation kind '
        '(owner=%, kind=%)',
      v_seal_owner,
      v_seal_relation_kind;
  END IF;
  IF v_seal_owner = 'social_monitor_public_schema_owner' THEN
    GRANT social_monitor_reader_summary_publication_owner
    TO social_monitor_public_schema_owner
    WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
    SET LOCAL ROLE social_monitor_public_schema_owner;
    GRANT CREATE ON SCHEMA public
    TO social_monitor_reader_summary_publication_owner;
    ALTER TABLE public.reader_summary_weekly_certification_seals
      OWNER TO social_monitor_reader_summary_publication_owner;
    REVOKE CREATE ON SCHEMA public
    FROM social_monitor_reader_summary_publication_owner;
    RESET ROLE;
    REVOKE social_monitor_reader_summary_publication_owner
    FROM social_monitor_public_schema_owner GRANTED BY CURRENT_USER;
  END IF;
END
$normalize_weekly_certification_seal_owner$;`;
  const ownershipPrelude = `${sealOwnershipNormalization}

SET LOCAL ROLE ${schemaOwner};

GRANT USAGE, CREATE ON SCHEMA public
TO ${owner};

SET LOCAL ROLE ${owner};

${certificationSealReferencesGrant}

CREATE TABLE "reader_summary_weekly_review_manifests" (`;
  const finalPrivilegeRevocation = `RESET ROLE;
SET LOCAL ROLE ${owner};

${certificationSealReferencesRevocation}

RESET ROLE;
SET LOCAL ROLE ${schemaOwner};

REVOKE CREATE ON SCHEMA public
FROM ${owner};

RESET ROLE;
COMMIT;`;
  const ownerRoleSwitches = sql.match(
    /SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";/gu,
  ) ?? [];
  const schemaOwnerRoleSwitches = sql.match(
    /SET LOCAL ROLE "?social_monitor_public_schema_owner"?;/gu,
  ) ?? [];
  const roleResets = sql.match(/RESET ROLE;/gu) ?? [];

  assert(
    sql.includes(ownershipPrelude) &&
      sql.trimEnd().endsWith(finalPrivilegeRevocation) &&
      sql.split(certificationSealReferencesGrant).length === 2 &&
      sql.split(certificationSealReferencesRevocation).length === 2 &&
      ownerRoleSwitches.length === 2 &&
      schemaOwnerRoleSwitches.length === 3 &&
      roleResets.length === 4 &&
      !/ALTER\s+TABLE\s+"reader_summary_weekly_review_manifests"\s+OWNER\s+TO/iu.test(sql),
    "weekly review manifest migration must normalize the reviewed seal owner, create under the durable owner, and revoke temporary column REFERENCES and schema CREATE",
  );
};

const createHistoricalAuthority = async (
  client: PoolClient,
): Promise<ReaderSummaryWeeklyReviewAuthority> => {
  for (const date of historicalWeekDates) {
    const fixture = await createReaderSummaryPublicationRunningFixture(
      client,
      "COMPLETED",
      date,
      {
        githubEvidenceMode:
          date === "2026-07-23" ? "historical_unavailable" : "verified",
      },
    );
    const outcome = await publish(client, readerSummaryPublicationDbOwnedRequest(fixture));
    assert(outcome === "published", `historical fixture ${date} must publish`);
  }
  await sealHistoricalWeek(client);
  const window = resolveReaderSummaryWeeklyProductionWindow(historicalWeekStartedOn);
  const state = await loadReaderSummaryWeeklyProductionDbState(
    client,
    {
      tenantId: readerSummaryPublicationFixtureScope.tenantId,
      workspaceId: readerSummaryPublicationFixtureScope.workspaceId,
      scope: { type: "workspace" },
    },
    window,
  );
  assert(
    state.status === "complete" &&
      state.blockingReasons.length === 0 &&
      state.certifications.some((row) =>
        row.requestedUtcDate === "2026-07-23" &&
        row.githubEvidence.mode === "historical_unavailable",
      ),
    "Jul 23 historical authority must be the sole accepted historical exception",
  );
  return readerSummaryWeeklyReviewAuthorityFromProductionState(state);
};

const sealHistoricalWeek = async (client: PoolClient): Promise<void> => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
  try {
    const result = await client.query<{ readonly outcome: string }>(
      `SELECT outcome
         FROM seal_reader_summary_weekly_certification(
           $1::uuid, $2::uuid, 'workspace', 'workspace', $3::date
         )`,
      [
        readerSummaryPublicationFixtureScope.tenantId,
        readerSummaryPublicationFixtureScope.workspaceId,
        historicalWeekStartedOn,
      ],
    );
    assert(result.rows[0]?.outcome === "sealed", "historical week must seal exactly once");
    await client.query("COMMIT");
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};

const evolutionCandidate = (
  authority: ReaderSummaryWeeklyReviewAuthority,
) => {
  const candidate = deriveReaderSummaryWeeklyReviewStoryCandidates(authority)
    .find((entry) => new Set(entry.citations.map((citation) => citation.requestedUtcDate)).size >= 2);
  if (candidate === undefined) {
    throw new Error("weekly review fixture did not provide an evolving sealed story");
  }
  return candidate;
};

const evolutionSelection = (
  candidate: ReturnType<typeof evolutionCandidate>,
): ReaderSummaryWeeklyReviewSelection => {
  const before = candidate.citations[0];
  const after = candidate.citations.at(-1);
  if (before === undefined || after === undefined || before.requestedUtcDate >= after.requestedUtcDate) {
    throw new Error("weekly review fixture cannot form an evolution selection");
  }
  return {
    story: candidate.story,
    label: "evolution",
    citationSelectors: [before.selector, after.selector],
    beforeCitationSelector: before.selector,
    afterCitationSelector: after.selector,
  };
};

const createManifest = (
  authority: ReaderSummaryWeeklyReviewAuthority,
  selections: readonly ReaderSummaryWeeklyReviewSelection[],
) => createReaderSummaryWeeklyReviewManifest({
  authority,
  selections,
  modelResponseSha256: "a".repeat(64),
  executionAttestation: {
    schemaVersion: 1,
    requestId: `weekly-review-pg18:${randomUUID()}`,
    purpose: "social_monitor.reader_summary.weekly.review",
    canonicalRequestSha256: "b".repeat(64),
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort: "xhigh",
    runtimeEngine: "subscription-runtime-cli",
    runtimePackageVersion: "1.2.3",
    launcherSha256: "c".repeat(64),
    selectedOutputKind: "structured_output",
    selectedOutputSha256: "a".repeat(64),
  },
});

const payloadFor = (manifest: ReturnType<typeof createManifest>): MutablePayload =>
  JSON.parse(JSON.stringify(
    buildReaderSummaryWeeklyReviewManifestPersistencePayload(manifest),
  )) as MutablePayload;

const assertRejectedPayloads = async (
  client: PoolClient,
  authority: ReaderSummaryWeeklyReviewAuthority,
  candidate: ReturnType<typeof evolutionCandidate>,
  validPayload: MutablePayload,
): Promise<void> => {
  const cases: readonly [string, MutablePayload, string][] = [
    [
      "forged canonical bytes",
      { ...validPayload, canonicalBytesBase64: Buffer.from("forged bytes").toString("base64") },
      "canonical binding is invalid",
    ],
    [
      "forged manifest hash",
      { ...validPayload, manifestSha256: "f".repeat(64) },
      "canonical binding is invalid",
    ],
    [
      "missing sealed evidence",
      rebuildPayload({ ...validPayload, citations: [], observations: [] }),
      "missing sealed evidence",
    ],
    [
      "forged citation",
      rebuildPayload(mutateCitation(validPayload, (citation) => ({
        ...citation,
        sourceContentHash: "f".repeat(64),
      }))),
      "citation is not sealed daily provider evidence",
    ],
    [
      "duplicate story date",
      rebuildPayload(duplicateCitation(validPayload)),
      "cannot duplicate a story on one date",
    ],
    [
      "invalid evolution",
      rebuildPayload(mutateObservation(validPayload, (observation) => ({
        ...observation,
        afterCitationSelector: observation.beforeCitationSelector,
      }))),
      "observation labels or selectors are invalid",
    ],
    [
      "invalid resolution",
      invalidResolutionPayload(authority, candidate),
      "observation labels or selectors are invalid",
    ],
    [
      "forged seal",
      forgedSealPayload(validPayload),
      "requires the exact certification seal",
    ],
    [
      "forged scope",
      forgedScopePayload(validPayload),
      "requires the exact certification seal",
    ],
  ];
  for (const [label, payload, expected] of cases) {
    await assertRejectsContaining(
      () => persistWithSerializableRetry(client, payload),
      expected,
      `weekly review manifest must reject ${label}`,
    );
  }
};

const invalidResolutionPayload = (
  authority: ReaderSummaryWeeklyReviewAuthority,
  candidate: ReturnType<typeof evolutionCandidate>,
): MutablePayload => {
  const first = candidate.citations[0]!;
  const last = candidate.citations.at(-1)!;
  const resolution = createManifest(authority, [{
    story: candidate.story,
    label: "resolution",
    citationSelectors: [first.selector, last.selector],
    terminalCitationSelector: last.selector,
  }]);
  return rebuildPayload(mutateObservation(payloadFor(resolution), (observation) => ({
    ...observation,
    terminalCitationSelector: first.selector,
  })));
};

const mutateCitation = (
  payload: MutablePayload,
  mutate: (citation: Record<string, unknown>) => Record<string, unknown>,
): MutablePayload => {
  const citations = payload.citations as Record<string, unknown>[];
  const first = citations[0];
  if (first === undefined) throw new Error("weekly review fixture has no citation");
  return { ...payload, citations: [mutate(first), ...citations.slice(1)] };
};

const duplicateCitation = (payload: MutablePayload): MutablePayload => {
  const citations = payload.citations as Record<string, unknown>[];
  const first = citations[0];
  if (first === undefined) throw new Error("weekly review fixture has no citation");
  return { ...payload, citations: [...citations, { ...first }] };
};

const mutateObservation = (
  payload: MutablePayload,
  mutate: (observation: Record<string, unknown>) => Record<string, unknown>,
): MutablePayload => {
  const observations = payload.observations as Record<string, unknown>[];
  const first = observations[0];
  if (first === undefined) throw new Error("weekly review fixture has no observation");
  return { ...payload, observations: [mutate(first), ...observations.slice(1)] };
};

const forgedSealPayload = (payload: MutablePayload): MutablePayload => {
  const sealSha256 = "f".repeat(64);
  const sealId = `reader_summary.weekly_certification_seal.v1:${sealSha256}`;
  const reviewAuthority = {
    ...(payload.reviewAuthority as Record<string, unknown>),
    sealId,
    sealSha256,
  };
  return rebuildPayload({ ...payload, sealId, sealSha256, reviewAuthority });
};

const forgedScopePayload = (payload: MutablePayload): MutablePayload => {
  const interestId = "11111111-1111-4111-8111-111111111111";
  const scope = { type: "interest", interestId };
  const reviewAuthority = {
    ...(payload.reviewAuthority as Record<string, unknown>),
    scope: { ...scope },
    scopeKey: `interest:${interestId}`,
  };
  return rebuildPayload({
    ...payload,
    scope,
    scopeKey: `interest:${interestId}`,
    reviewAuthority,
  });
};

const rebuildPayload = (payload: MutablePayload): MutablePayload => {
  const reviewAuthority = payload.reviewAuthority as Record<string, unknown>;
  const executionAttestation = payload.executionAttestation as Record<string, unknown>;
  const authorityCanonical = canonicalizeReaderSummaryWeeklyJson(reviewAuthority);
  const attestationCanonical = canonicalizeReaderSummaryWeeklyJson(executionAttestation);
  const canonicalRecord = {
    schemaVersion: "reader_summary.weekly_review_manifest.v1",
    tenantId: payload.tenantId,
    workspaceId: payload.workspaceId,
    scope: payload.scope,
    scopeKey: payload.scopeKey,
    weekStartedOn: payload.weekStartedOn,
    weekEndedOn: payload.weekEndedOn,
    sealId: payload.sealId,
    sealSha256: payload.sealSha256,
    reviewAuthority,
    reviewAuthoritySha256: authorityCanonical.sha256,
    observations: payload.observations,
    citations: payload.citations,
    modelResponseSha256: payload.modelResponseSha256,
    executionAttestation,
    executionAttestationSha256: attestationCanonical.sha256,
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(canonicalRecord);
  const manifestId = `reader_summary.weekly_review_manifest.v1:${canonical.sha256}`;
  return {
    ...payload,
    manifestId,
    manifestSha256: canonical.sha256,
    reviewAuthoritySha256: authorityCanonical.sha256,
    reviewAuthorityBytesBase64: Buffer.from(authorityCanonical.toBytes()).toString("base64"),
    executionAttestationSha256: attestationCanonical.sha256,
    executionAttestationBytesBase64: Buffer.from(attestationCanonical.toBytes()).toString("base64"),
    canonicalRecord: { ...canonicalRecord, manifestId, manifestSha256: canonical.sha256 },
    canonicalBytesBase64: Buffer.from(canonical.toBytes()).toString("base64"),
  };
};

const persistWithSerializableRetry = async (
  client: PoolClient,
  payload: MutablePayload,
): Promise<PersistRow> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
    try {
      const result = await client.query<PersistRow>(
        `SELECT * FROM persist_reader_summary_weekly_review_manifest($1::jsonb)`,
        [JSON.stringify(payload)],
      );
      const row = result.rows[0];
      if (result.rows.length !== 1 || row === undefined) {
        throw new Error("weekly review manifest function returned no exact result");
      }
      await client.query("COMMIT");
      return row;
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (retryableConflict(error) && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("weekly review manifest SERIALIZABLE retries were exhausted");
};

const assertPersistedRow = (
  row: PersistRow,
  manifest: ReturnType<typeof createManifest>,
): void => {
  assert(
    row.manifest_id === manifest.manifestId &&
      row.manifest_sha256 === manifest.manifestSha256 &&
      row.seal_id === manifest.sealId,
    "weekly review persistence response must be exact",
  );
};

const manifestState = async (
  client: PoolClient,
  manifestId: string,
): Promise<unknown> => (
  await client.query(
    `SELECT manifest_id, btrim(manifest_sha256) AS manifest_sha256,
            seal_id, xmin::text AS xmin,
            encode(canonical_bytes, 'hex') AS canonical_bytes
       FROM reader_summary_weekly_review_manifests
      WHERE manifest_id = $1`,
    [manifestId],
  )
).rows;

const assertTenantScope = async (
  client: PoolClient,
  payload: MutablePayload,
  manifestId: string,
): Promise<void> => {
  await setReaderSummaryPublicationSessionScope(client, {
    tenantId: "00000000-0000-7000-8000-000000000011",
    workspaceId: "00000000-0000-7000-8000-000000000012",
  });
  try {
    const hidden = await client.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count
         FROM reader_summary_weekly_review_manifests
        WHERE manifest_id = $1`,
      [manifestId],
    );
    assert(hidden.rows[0]?.count === "0", "FORCE RLS must hide a manifest across tenant scope");
    await assertRejectsContaining(
      () => persistWithSerializableRetry(client, payload),
      "session scope diverged",
      "cross-tenant manifest persistence must fail closed",
    );
  } finally {
    await setReaderSummaryPublicationSessionScope(client);
  }
};

const assertAppendOnlyMutationGuards = async (
  admin: PoolClient,
  manifestId: string,
): Promise<void> => {
  const operations = [
    `UPDATE reader_summary_weekly_review_manifests
        SET recorded_at = recorded_at WHERE manifest_id = $1`,
    `DELETE FROM reader_summary_weekly_review_manifests WHERE manifest_id = $1`,
    `TRUNCATE TABLE reader_summary_weekly_review_manifests`,
  ] as const;
  for (const operation of operations) {
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
          await admin.query(operation, operation.includes("$1") ? [manifestId] : []);
        } finally {
          await admin.query("ROLLBACK").catch(() => undefined);
        }
      },
      "append-only",
      `publication-owner mutation must be blocked: ${operation.split(" ")[0]}`,
    );
  }
};

const assertRuntimeWriteDenied = async (
  client: PoolClient,
  manifestId: string,
): Promise<void> => {
  const operations = [
    `INSERT INTO reader_summary_weekly_review_manifests
       SELECT * FROM reader_summary_weekly_review_manifests WHERE manifest_id = $1`,
    `UPDATE reader_summary_weekly_review_manifests
        SET recorded_at = recorded_at WHERE manifest_id = $1`,
    `DELETE FROM reader_summary_weekly_review_manifests WHERE manifest_id = $1`,
    `TRUNCATE TABLE reader_summary_weekly_review_manifests`,
  ] as const;
  for (const operation of operations) {
    await assertRejectsContaining(
      () => client.query(operation, operation.includes("$1") ? [manifestId] : []),
      "permission denied",
      `runtime must retain SELECT-only table access: ${operation.split(" ")[0]}`,
    );
  }
};

const publish = async (
  client: PoolClient,
  payload: Readonly<Record<string, unknown>>,
): Promise<string> => {
  const result = await client.query<{ readonly outcome: string }>(
    `SELECT outcome FROM publish_reader_summary($1::jsonb)`,
    [JSON.stringify(payload)],
  );
  const outcome = result.rows[0]?.outcome;
  if (outcome === undefined) throw new Error("weekly review fixture publication returned no outcome");
  return outcome;
};

const retryableConflict = (error: unknown): boolean =>
  typeof error === "object" && error !== null &&
  "code" in error &&
  ((error as Readonly<{ code?: unknown }>).code === "40001" ||
    (error as Readonly<{ code?: unknown }>).code === "40P01");

const reversePayload = (payload: MutablePayload): MutablePayload =>
  Object.fromEntries(Object.entries(payload).reverse());
