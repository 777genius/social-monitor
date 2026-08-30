import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  CanonicalRecoveryAuthority,
  CanonicalRecoveryWork,
} from "./reader-summary-daily-canonical-recovery-v4";
import { assertPgCatalogOnlySecurityDefinerSearchPaths } from "./reader-summary-daily-canonical-recovery-v4-postgres-contract";
import type { RecoveryPostgresClient } from "./reader-summary-production-recovery-postgres-contract";
const schema =
  "prisma/migrations/20260804130000_reader_summary_daily_v4_ambiguity_retry_schema/migration.sql";
const transitions =
  "prisma/migrations/20260804130100_reader_summary_daily_v4_ambiguity_retry_transitions/migration.sql";
const consumers =
  "prisma/migrations/20260804130200_reader_summary_daily_v4_ambiguity_retry_consumers/migration.sql";
const evidence =
  "prisma/migrations/20260804130300_reader_summary_daily_v4_ambiguity_retry_evidence/migration.sql";
const periodGuard = "prisma/migrations/20260805090000_reader_summary_daily_v4_ambiguity_retry_period_guard/migration.sql";
const backupRestoreContract = "ops/recovery/backup-restore-contract.json";
const tenantGuardContract = "ops/security/tenant-db-guard-contract.json";
const preMigrationBootstrap =
  "ops/deploy/reader-summary-publication-pre-migration.sql";
const postMigrationBootstrap =
  "ops/deploy/reader-summary-publication-post-migration.sql";
const tenant = "00000000-0000-7000-8000-000000000901";
const workspace = "00000000-0000-7000-8000-000000000902";
const date = "2026-07-23";
const retryTable = "reader_summary_daily_canonical_recovery_v4_ambiguity_retries";
type Client = Pick<RecoveryPostgresClient, "query">;
type OriginalSnapshot = Readonly<{
  snapshot: string;
  modelJobIdentity: string;
  sourceAuthoritySha256: string;
  state: string;
  preModelConsumedAt: string | null;
  runningAt: string | null;
  failedAmbiguousAt: string | null;
  payloadFree: boolean;
}>;
export type CanonicalRecoveryV4AmbiguityRetryFixture = Readonly<{
  retryWork: CanonicalRecoveryWork;
  assertAfterExecution(): Promise<void>;
}>;

/**
 * Static gate for the append-only ambiguity exception. The exception is an
 * exact Jul23 authorization, not a general retry mechanism.
 */
export const assertReaderSummaryDailyCanonicalRecoveryV4AmbiguityRetryMigrationContract = (): void => {
  const schemaSql = readFileSync(resolve(schema), "utf8");
  const transitionSql = readFileSync(resolve(transitions), "utf8");
  const consumerSql = readFileSync(resolve(consumers), "utf8");
  const evidenceSql = readFileSync(resolve(evidence), "utf8");
  const periodGuardSql = readFileSync(resolve(periodGuard), "utf8");
  const backupContract = readFileSync(resolve(backupRestoreContract), "utf8");
  const tenantGuard = readFileSync(resolve(tenantGuardContract), "utf8");
  const preBootstrapSql = readFileSync(resolve(preMigrationBootstrap), "utf8");
  const postBootstrapSql = readFileSync(resolve(postMigrationBootstrap), "utf8");
  const sql = `${schemaSql}\n${transitionSql}\n${consumerSql}\n${evidenceSql}\n${periodGuardSql}`;
  const authorization = exactFunctionBody(
    periodGuardSql,
    "authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry",
  );
  const effectiveAttemptLock = functionBody(
    schemaSql,
    "lock_reader_summary_daily_canonical_recovery_v4_effective_attempt",
    "CREATE FUNCTION public.\"authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry\"",
  );
  const claim = exactFunctionBody(
    transitionSql,
    "claim_reader_summary_daily_canonical_recovery_v4",
  );
  const renew = exactFunctionBody(
    transitionSql,
    "renew_reader_summary_daily_canonical_recovery_v4_lease",
  );
  const markRunning = exactFunctionBody(
    transitionSql,
    "mark_reader_summary_daily_canonical_recovery_v4_running",
  );
  const complete = exactFunctionBody(
    transitionSql,
    "complete_reader_summary_daily_canonical_recovery_v4",
  );
  const prepare = exactFunctionBody(
    periodGuardSql,
    "prepare_reader_summary_daily_canonical_recovery_v4_publication",
  );
  const periodGuardEvidence = exactFunctionBody(
    periodGuardSql,
    "record_reader_summary_daily_canonical_recovery_v4_evidence",
  );
  const collisionGuard = (marker: string): string => authorization.slice(authorization.indexOf(marker), authorization.indexOf("IF FOUND THEN", authorization.indexOf(marker)));
  const publicationGuard = collisionGuard('PERFORM publication."id"');
  const evidenceGuard = collisionGuard('PERFORM evidence."publication_id"');
  const exactSlotPredicates = ['publication."scope_type" = \'workspace\'', 'publication."scope_key" = \'workspace\'', 'publication."cadence" = \'daily\'', 'publication."period_timezone" = \'UTC\'', 'publication."period_started_at" = (c_date::TIMESTAMP AT TIME ZONE \'UTC\')', 'publication."period_ended_at" = ((c_date + 1)::TIMESTAMP AT TIME ZONE \'UTC\')'] as const;
  const finalize = exactFunctionBody(
    consumerSql,
    "finalize_reader_summary_daily_canonical_recovery_v4",
  );

  assertPgCatalogOnlySecurityDefinerSearchPaths(sql);
  assert(
    schemaSql.includes(`CREATE TABLE public."${retryTable}"`) &&
      schemaSql.includes("PRIMARY KEY (\"tenant_id\", \"workspace_id\", \"requested_utc_date\")") &&
      schemaSql.includes("UNIQUE (\"model_job_identity\")") &&
      schemaSql.includes("\"attempt_ordinal\" = 2") &&
      schemaSql.includes("\"supersedes_model_job_identity\"") &&
      schemaSql.includes(
        'CREATE TRIGGER "rs_daily_recovery_v4_superseded_original_immutable"',
      ),
    "ambiguity retry must persist one immutable attempt-2 row and identity",
  );
  assert(
    schemaSql.includes("DATE '2026-07-23'") &&
      !/2026-0[89]-/u.test(sql) &&
      !/DATE '2026-07-(?:2[4-9]|30)'/u.test(schemaSql),
    "ambiguity retry scope must be exactly Jul23 and never widen into August",
  );
  assert(
    schemaSql.includes("ENABLE ROW LEVEL SECURITY") &&
      schemaSql.includes("FORCE ROW LEVEL SECURITY") &&
      schemaSql.includes("rs_daily_recovery_v4_ambiguity_retries_owner_only") &&
      schemaSql.includes('REVOKE ALL PRIVILEGES ON TABLE') &&
      schemaSql.includes("FROM PUBLIC, \"social_monitor_reader_summary_daily_terminal\"") &&
      schemaSql.includes('"social_monitor_reader_summary_publication_runtime"') &&
      schemaSql.includes('"social_monitor_tenant_system_runtime"') &&
      schemaSql.includes("GRANT EXECUTE ON FUNCTION") &&
      !/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL\s+PRIVILEGES)\s+ON\s+TABLE[\s\S]*ambiguity_retries/iu.test(schemaSql),
    "ambiguity retry table must remain FORCE RLS and inaccessible directly",
  );
  assert(
    authorization.includes("current_setting('transaction_isolation') <> 'serializable'") &&
      authorization.includes("session_user <> 'social_monitor_reader_summary_daily_terminal'") &&
      authorization.indexOf('FROM public."reader_summary_daily_canonical_recovery_v4_leases"') <
        authorization.indexOf(`FROM public."${retryTable}"`) &&
      authorization.includes("FOR UPDATE") &&
      authorization.includes("FOR KEY SHARE") &&
      exactSlotPredicates.every((part) => publicationGuard.includes(part)) &&
      !['requested_utc_date', 'publication_kind', 'semantic_status'].some((part) => publicationGuard.includes(part)) &&
      exactSlotPredicates.every((part) => evidenceGuard.includes(part.replace("publication.", "evidence."))) &&
      !evidenceGuard.includes('requested_utc_date') &&
      !/\b(?:UPDATE|DELETE\s+FROM)\s+public\."reader_summary_daily_canonical_recovery_v4_leases"/iu
        .test(authorization),
    "authorization must lock the exact daily slot without treating requested date as published history",
  );
  assert(
    effectiveAttemptLock.indexOf('FROM public."reader_summary_daily_canonical_recovery_v4_leases"') <
      effectiveAttemptLock.indexOf(`FROM public."${retryTable}"`) &&
      (effectiveAttemptLock.match(/FOR UPDATE/gu)?.length ?? 0) === 2 &&
      effectiveAttemptLock.includes("lost its FAILED_AMBIGUOUS original binding") &&
      transitionSql.includes("lock_reader_summary_daily_canonical_recovery_v4_effective_attempt") &&
      transitionSql.includes("current_setting('transaction_isolation') <> 'serializable'") &&
      transitionSql.includes("fencing_token") && transitionSql.includes("lease_expires_at"),
    "claim and all retry transitions must use the original-to-retry fence order",
  );
  assert(
      authorization.includes("pre_model_consumed_at\" IS NULL") &&
      authorization.includes("running_at\" IS NULL") &&
      authorization.includes("failed_ambiguous_at\" IS NULL") &&
      authorization.includes('"fencing_token" <= 0') &&
      authorization.includes('"failed_ambiguous_at" < v_original."running_at"') &&
      authorization.includes("completed_at\" IS NOT NULL") &&
      authorization.includes("authorized_at < v_now - INTERVAL '5 minutes'") &&
      authorization.includes("session_user, v_now, v_model_identity, 'AUTHORIZED'") &&
      authorization.includes("response_bytes\" IS NOT NULL") &&
      authorization.includes("receipt_bytes\" IS NOT NULL") &&
      authorization.includes("publication_id\" IS NOT NULL") &&
      authorization.includes("weekly_publication_evidence") &&
      authorization.includes("reader_summary_daily_canonical_recovery_v4_model_identity"),
    "authorization must fail closed unless the exact unresolved original and frozen authority bind",
  );
  assert(
    schemaSql.includes("'codex', 'gpt-5.6-sol', 'xhigh', 'output_text'") &&
      schemaSql.includes("original_model_job_identity") &&
      schemaSql.includes("source_authority_sha256") &&
      schemaSql.includes("authorization_sha256") &&
      transitionSql.includes(
        "v_receipt->>'modelJobIdentity' IS DISTINCT FROM btrim(v_lease.\"model_job_identity\")",
      ) &&
      transitionSql.includes("SET \"state\" = 'FAILED_AMBIGUOUS'") &&
      transitionSql.includes('IF v_retry."state" = \'FAILED_AMBIGUOUS\' THEN') &&
      transitionSql.includes("IF NOT v_has_retry THEN") &&
      transitionSql.includes("RETURN QUERY SELECT 'FAILED_AMBIGUOUS'") &&
      transitionSql.includes(
        'REVOKE ALL ON FUNCTION\n  public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"',
      ),
    "attempt-2 identity and terminal ambiguity behavior must be deterministic and one-shot",
  );
  for (const name of [
    "verify_reader_summary_daily_canonical_recovery_v4_provenance",
    "prepare_reader_summary_daily_canonical_recovery_v4_publication",
    "finalize_reader_summary_daily_canonical_recovery_v4",
    "read_reader_summary_daily_canonical_recovery_v4_finalized",
  ]) {
    assert(
      exactFunctionBody(consumerSql, name).includes(
        "reader_summary_daily_canonical_recovery_v4_effective_leases",
      ),
      `${name} must select the successful effective attempt`,
    );
  }
  assert(
    evidenceSql.includes("reader_summary_daily_canonical_recovery_v4_effective_leases") &&
      evidenceSql.includes("assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding") &&
      consumerSql.includes("assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding") &&
      periodGuardEvidence.includes('v_publication."period_started_at" <> (v_day::TIMESTAMP AT TIME ZONE \'UTC\')') &&
      periodGuardEvidence.includes('v_publication."period_ended_at" <> ((v_day + 1)::TIMESTAMP AT TIME ZONE \'UTC\')') &&
      periodGuardEvidence.includes('v_day, v_job."id", v_artifact."id"') &&
      !periodGuardEvidence.includes('v_publication."requested_utc_date" <> v_day'),
    "provenance and evidence must bind attempt-2 through the exact period, not a backdated request",
  );
  assert(
    consumerSql.includes("target_date NOT IN (DATE '2026-07-23', DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30')"),
    "historical omission allowlist must remain exact",
  );
  assert(
    countOccurrences(backupContract, `"${retryTable}"`) === 2 &&
      backupContract.includes(`"select count(*) from ${retryTable}"`),
    "ambiguity retry audit state must be included in backup and restore validation",
  );
  assert(
    countOccurrences(tenantGuard, `"table": "${retryTable}"`) === 2 &&
      countOccurrences(tenantGuard, schema) === 2,
    "ambiguity retry table must remain declared as tenant-scoped forward RLS state",
  );
  assert(
    countOccurrences(preBootstrapSql, `'${retryTable}'`) >= 5 &&
      countOccurrences(postBootstrapSql, `'${retryTable}'`) >= 3 &&
      preBootstrapSql.includes("v_v4_table_count NOT IN (0, 3, 4, 5)") &&
      postBootstrapSql.includes("v_v4_table_count NOT IN (0, 3, 4, 5)") &&
      preBootstrapSql.includes(
        "v_owner_count <> 4 + v_weekly_review_manifest_table_count\n        + v_v4_table_count",
      ) &&
      postBootstrapSql.includes(
        "v_owner_count <> 4 + v_weekly_review_manifest_table_count\n      + v_v4_table_count",
      ) &&
      schemaSql.includes("v_v4_table_count <> 4") &&
      schemaSql.includes("ambiguity retry final protected-table ownership is unsafe"),
    "bootstraps must accept only 0/3/4/5 V4 ownership windows after the schema's strict four-table assertion",
  );
  assert(
    claim.includes("attempt_ordinal SMALLINT") &&
      claim.includes("v_retry.\"attempt_ordinal\"") &&
      claim.includes("1::SMALLINT") &&
      [renew, markRunning, complete, prepare, finalize].every((transition) =>
        transition.includes("target_model_job_identity CHAR(64)") &&
        transition.includes("target_attempt_ordinal SMALLINT") &&
        transition.includes("v_attempt IS DISTINCT FROM target_attempt_ordinal") &&
        transition.includes("btrim(v_lease.\"model_job_identity\") IS DISTINCT FROM") &&
        transition.includes("stale attempt identity"),
      ) &&
      transitionSql.includes(
        'DROP FUNCTION IF EXISTS public."renew_reader_summary_daily_canonical_recovery_v4_lease"',
      ) &&
      transitionSql.includes(
        'DROP FUNCTION IF EXISTS public."mark_reader_summary_daily_canonical_recovery_v4_running"',
      ) &&
      transitionSql.includes(
        'DROP FUNCTION IF EXISTS public."complete_reader_summary_daily_canonical_recovery_v4"',
      ) &&
      consumerSql.includes(
        'DROP FUNCTION IF EXISTS public."prepare_reader_summary_daily_canonical_recovery_v4_publication"',
      ) &&
      consumerSql.includes(
        'DROP FUNCTION IF EXISTS public."finalize_reader_summary_daily_canonical_recovery_v4"',
      ) &&
      transitionSql.includes("UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT, TIMESTAMPTZ") &&
      prepare.includes('retry."attempt_ordinal" = target_attempt_ordinal') &&
      prepare.includes('btrim(retry."model_job_identity") = btrim(target_model_job_identity)') &&
      prepare.includes('publication."period_started_at" = (target_date::TIMESTAMP AT TIME ZONE \'UTC\')') &&
      prepare.includes('publication."period_ended_at" = ((target_date + 1)::TIMESTAMP AT TIME ZONE \'UTC\')') &&
      ['v_target_slot_publication_count <> 1', 'v_target_slot_publication_id IS DISTINCT FROM target_publication_id', 'ORDER BY publication."id"\n    FOR KEY SHARE\n  LOOP'].every((part) => prepare.includes(part)) &&
      prepare.includes('verify_reader_summary_daily_canonical_recovery_v4_provenance') &&
      !prepare.includes('publication."requested_utc_date" = target_date') &&
      finalize.includes('retry."attempt_ordinal" = target_attempt_ordinal') &&
      finalize.includes('btrim(retry."model_job_identity") = btrim(target_model_job_identity)') &&
      prepare.indexOf("stale attempt identity") <
        prepare.indexOf('verify_reader_summary_daily_canonical_recovery_v4_provenance') &&
      transitionSql.includes("TO \"social_monitor_reader_summary_daily_terminal\"") &&
      consumerSql.includes("TO \"social_monitor_tenant_system_runtime\""),
    "claim and every attempt transition must carry exact identity and ordinal with no legacy callback overload",
  );
  assert(
    authorization.includes("v_has_retry := FOUND") &&
      authorization.includes("IF v_has_retry THEN") &&
      authorization.includes("assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding") &&
      authorization.includes("RETURN QUERY SELECT btrim(v_retry.\"model_job_identity\")") &&
      authorization.includes("authorization time is invalid") &&
      authorization.indexOf("IF v_has_retry THEN") <
        authorization.indexOf("authorization time is invalid"),
    "an exact committed authorization replay must return the immutable attempt-2 identity before any new authorization write",
  );
  assert(
    periodGuardSql.includes("-- @social-monitor-forward-migration") &&
    periodGuardSql.includes("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE") &&
      !/DROP\s+FUNCTION/iu.test(periodGuardSql) &&
      periodGuardSql.includes("SET search_path = pg_catalog") &&
      ['rewrite_publish_reader_summary_pre_evidence_period_guard', 'retry cannot supersede target publication slot', 'publication."id" IS DISTINCT FROM v_artifact."id" FOR KEY SHARE', 'rewrite_finalize_reader_summary_daily_canonical_recovery_v4_period_guard', 'slot."current_publication_id" = target_publication_id', 'FOR UPDATE OF publication, job, artifact, evidence', 'btrim(evidence."canonical_sha256") = btrim(target_weekly_evidence_sha256)'].every((part) => periodGuardSql.includes(part)) &&
      periodGuardSql.includes('TO "social_monitor_reader_summary_daily_terminal"'),
    "period guard must be an append-only hardened migration with terminal-only authorization",
  );
};

/**
 * Creates an intentionally expired original only in the disposable PostgreSQL
 * fixture, then verifies the production SQL grants exactly one replacement.
 */
export const prepareReaderSummaryDailyCanonicalRecoveryV4AmbiguityRetryFixture = async (
  input: Readonly<{
    auditor: Client;
    firstTerminal: Client;
    rogue: Client;
    authority: CanonicalRecoveryAuthority;
    authorizer: Readonly<{
      authorize(input: Readonly<{
        tenantId: string;
        workspaceId: string;
        requestedUtcDate: string;
        originalModelJobIdentity: string;
        sourceAuthoritySha256: string;
        authorizedAt: string;
      }>): Promise<Readonly<{
        modelJobIdentity: string;
        authorizationSha256: string;
      }>>;
    }>;
    assertPublishedHistory?: (input: Readonly<{
      originalModelJobIdentity: string;
      sourceAuthoritySha256: string;
    }>) => Promise<void>;
    tenantId: string;
    workspaceId: string;
  }>,
): Promise<CanonicalRecoveryV4AmbiguityRetryFixture> => {
  assert(
    input.tenantId === tenant && input.workspaceId === workspace,
    "ambiguity retry fixture must use the one reviewed tenant and workspace",
  );
  const initial = await input.authority.claim({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    workerId: "ambiguity-retry-fixture-original",
    invokedAt: new Date().toISOString(),
  });
  if (initial.kind !== "claimed" || initial.work.requestedUtcDate !== date) {
    throw new Error("ambiguity retry fixture could not consume Jul23 original work");
  }
  await input.authority.markRunning(initial.work, new Date().toISOString());

  // This transition is fixture-only: it exercises the existing ambiguity path.
  await input.auditor.query(
    `UPDATE public."reader_summary_daily_canonical_recovery_v4_leases"
     SET lease_expires_at = transaction_timestamp() - INTERVAL '1 second'
     WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID
       AND requested_utc_date = $3::DATE`,
    [tenant, workspace, date],
  );
  const failed = await input.authority.claim({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    workerId: "ambiguity-retry-fixture-detect",
    invokedAt: new Date().toISOString(),
  });
  assert(
    failed.kind === "failed_ambiguous" && failed.requestedUtcDate === date,
    "expired consumed original must remain FAILED_AMBIGUOUS before explicit authorization",
  );
  const original = await originalSnapshot(input.auditor);
  assert(
    original.state === "FAILED_AMBIGUOUS" &&
      original.preModelConsumedAt !== null && original.runningAt !== null &&
      original.failedAmbiguousAt !== null && original.payloadFree,
    "fixture original is not a durable unresolved ambiguity",
  );
  assert(
    failed.modelJobIdentity === original.modelJobIdentity &&
      failed.sourceAuthoritySha256 === original.sourceAuthoritySha256,
    "terminal claim did not map the failed original binding for authorization",
  );
  await input.assertPublishedHistory?.({
    originalModelJobIdentity: original.modelJobIdentity,
    sourceAuthoritySha256: original.sourceAuthoritySha256,
  });

  await assertRetryAcl(input.auditor);
  await assertRejected(input.firstTerminal, "wrong source hash", [
    tenant,
    workspace,
    date,
    original.modelJobIdentity,
    alternateSha(original.sourceAuthoritySha256),
    new Date().toISOString(),
  ]);
  await assertRejected(input.firstTerminal, "wrong original identity", [
    tenant,
    workspace,
    date,
    alternateSha(original.modelJobIdentity),
    original.sourceAuthoritySha256,
    new Date().toISOString(),
  ]);
  await assertRejected(input.firstTerminal, "wrong retry date", [
    tenant,
    workspace,
    "2026-07-24",
    original.modelJobIdentity,
    original.sourceAuthoritySha256,
    new Date().toISOString(),
  ]);
  await assertRejected(input.firstTerminal, "cross-tenant retry authorization", [
    "00000000-0000-7000-8000-000000000903",
    workspace,
    date,
    original.modelJobIdentity,
    original.sourceAuthoritySha256,
    new Date().toISOString(),
  ]);
  await assertRejected(input.firstTerminal, "cross-workspace retry authorization", [
    tenant,
    "00000000-0000-7000-8000-000000000903",
    date,
    original.modelJobIdentity,
    original.sourceAuthoritySha256,
    new Date().toISOString(),
  ]);
  await assertDirectTableRejected(input.firstTerminal, "terminal direct retry table read");
  await assertDirectTableRejected(input.rogue, "rogue direct retry table read");

  const authorizationInput = {
    tenantId: tenant,
    workspaceId: workspace,
    requestedUtcDate: date,
    originalModelJobIdentity: original.modelJobIdentity,
    sourceAuthoritySha256: original.sourceAuthoritySha256,
    authorizedAt: new Date().toISOString(),
  };
  // Simulate a COMMIT that reaches PostgreSQL while the client loses the
  // acknowledgement. A distinct terminal connection is the reconnect path.
  const authorized = await authorizeRetry(input.firstTerminal, [
    authorizationInput.tenantId,
    authorizationInput.workspaceId,
    authorizationInput.requestedUtcDate,
    authorizationInput.originalModelJobIdentity,
    authorizationInput.sourceAuthoritySha256,
    authorizationInput.authorizedAt,
  ]);
  assert(
    authorized.modelJobIdentity !== original.modelJobIdentity &&
      isSha(authorized.modelJobIdentity) && isSha(authorized.authorizationSha256),
    "authorized retry must have a distinct deterministic identity and authorization audit hash",
  );
  await assertRetryRow(input.auditor, original, authorized);
  const retryAfterCommit = await retrySnapshot(input.auditor);
  const replay = await input.authorizer.authorize({
    ...authorizationInput,
    authorizedAt: new Date().toISOString(),
  });
  assert(
    replay.modelJobIdentity === authorized.modelJobIdentity &&
      replay.authorizationSha256 === authorized.authorizationSha256 &&
      (await retrySnapshot(input.auditor)) === retryAfterCommit,
    "client acknowledgement loss replay changed or failed to return the committed retry",
  );
  await assertRejected(input.firstTerminal, "mismatched replay source hash", [
    tenant,
    workspace,
    date,
    original.modelJobIdentity,
    alternateSha(original.sourceAuthoritySha256),
    new Date().toISOString(),
  ]);
  assert(
    (await retrySnapshot(input.auditor)) === retryAfterCommit &&
      (await originalSnapshot(input.auditor)).snapshot === original.snapshot,
    "authorization replay mutated retry or original FAILED_AMBIGUOUS history",
  );
  await assertDirectOriginalMutationRejected(input.auditor);

  // The retry begins with the same worker and fence as the original. Without
  // identity+ordinal binding, stale attempt-1 callbacks would mutate it.
  const retryClaim = await input.authority.claim({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    workerId: initial.work.workerId,
    invokedAt: new Date().toISOString(),
  });
  if (retryClaim.kind !== "claimed") {
    throw new Error("ambiguity retry fixture could not claim attempt 2");
  }
  assert(
    retryClaim.work.attemptOrdinal === 2 &&
      retryClaim.work.modelJobIdentity === authorized.modelJobIdentity &&
      retryClaim.work.workerId === initial.work.workerId &&
      retryClaim.work.fencingToken === initial.work.fencingToken,
    "attempt 2 must first claim with the original worker and fence but a new identity",
  );
  const retryBeforeStaleCallbacks = await retrySnapshot(input.auditor);
  await assertStaleAttemptCallbacksRejected(input.authority, initial.work);
  await assertStaleAttemptPublicationCallbacksRejected(
    input.rogue,
    input.auditor,
    initial.work,
  );
  assert(
    (await retrySnapshot(input.auditor)) === retryBeforeStaleCallbacks,
    "stale attempt-1 callbacks changed the claimed attempt-2 row bytes",
  );

  return Object.freeze({
    retryWork: retryClaim.work,
    assertAfterExecution: async () => {
      const result = await input.auditor.query<{
        originalSnapshot: string;
        retryRows: string;
        retryState: string;
        retryIdentity: string;
        effectiveIdentity: string;
        publicationCount: string;
        evidenceCount: string;
      }>(`
        SELECT
          (SELECT encode(sha256(convert_to(to_jsonb(original_lease)::TEXT, 'UTF8')), 'hex')
             FROM public."reader_summary_daily_canonical_recovery_v4_leases" original_lease
            WHERE original_lease.tenant_id = $1::UUID
              AND original_lease.workspace_id = $2::UUID
              AND original_lease.requested_utc_date = $3::DATE) AS "originalSnapshot",
          (SELECT count(*)::TEXT FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" retry
            WHERE retry.tenant_id = $1::UUID AND retry.workspace_id = $2::UUID
              AND retry.requested_utc_date = $3::DATE) AS "retryRows",
          (SELECT retry.state FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" retry
            WHERE retry.tenant_id = $1::UUID AND retry.workspace_id = $2::UUID
              AND retry.requested_utc_date = $3::DATE) AS "retryState",
          (SELECT btrim(retry.model_job_identity)
             FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" retry
            WHERE retry.tenant_id = $1::UUID AND retry.workspace_id = $2::UUID
              AND retry.requested_utc_date = $3::DATE) AS "retryIdentity",
          (SELECT btrim(lease.model_job_identity)
             FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" lease
            WHERE lease.tenant_id = $1::UUID AND lease.workspace_id = $2::UUID
              AND lease.requested_utc_date = $3::DATE) AS "effectiveIdentity",
          (SELECT count(*)::TEXT FROM public.reader_summary_publications publication
            WHERE publication.tenant_id = $1::UUID AND publication.workspace_id = $2::UUID
              AND publication.period_started_at = ($3::DATE::TIMESTAMP AT TIME ZONE 'UTC')
              AND publication.period_ended_at = (($3::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC')) AS "publicationCount",
          (SELECT count(*)::TEXT FROM public.reader_summary_weekly_publication_evidence evidence
            WHERE evidence.tenant_id = $1::UUID AND evidence.workspace_id = $2::UUID
              AND evidence.period_started_at = ($3::DATE::TIMESTAMP AT TIME ZONE 'UTC')
              AND evidence.period_ended_at = (($3::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC')
              AND evidence.requested_utc_date = $3::DATE) AS "evidenceCount"
      `, [tenant, workspace, date]);
      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("ambiguity retry final-state readback is missing");
      }
      assert(
        row.originalSnapshot === original.snapshot && row.retryRows === "1" &&
          row.retryState === "FINALIZED" &&
          row.retryIdentity === authorized.modelJobIdentity &&
          row.effectiveIdentity === authorized.modelJobIdentity &&
          row.publicationCount === "1" && row.evidenceCount === "1",
        `ambiguity retry did not finalize exactly one bound effective publication: ${JSON.stringify(row)}`,
      );
      const readback = await serializable(input.firstTerminal, (client) => client.query<{
        requested_utc_date: string;
        model_job_identity: string;
      }>(`SELECT requested_utc_date::TEXT, model_job_identity
           FROM public."read_reader_summary_daily_canonical_recovery_v4_finalized"(
             $1::UUID, $2::UUID
           )
          WHERE requested_utc_date = $3::DATE`, [tenant, workspace, date]));
      assert(
        readback.rows.length === 1 && readback.rows[0]?.requested_utc_date === date &&
          readback.rows[0]?.model_job_identity.trim() === authorized.modelJobIdentity,
        "finalized readback did not expose the successful retry identity",
      );
    },
  });
};

const originalSnapshot = async (client: Client): Promise<OriginalSnapshot> => {
  const result = await client.query<{
    snapshot: string;
    model_job_identity: string;
    source_authority_sha256: string;
    state: string;
    pre_model_consumed_at: string | null;
    running_at: string | null;
    failed_ambiguous_at: string | null;
    payload_free: boolean;
  }>(`
    SELECT encode(sha256(convert_to(to_jsonb(lease)::TEXT, 'UTF8')), 'hex') AS snapshot,
      btrim(lease.model_job_identity) AS model_job_identity,
      btrim(lease.source_authority_sha256) AS source_authority_sha256,
      lease.state, lease.pre_model_consumed_at::TEXT, lease.running_at::TEXT,
      lease.failed_ambiguous_at::TEXT,
      (lease.response_bytes IS NULL AND lease.response_sha256 IS NULL AND
       lease.attestation IS NULL AND lease.attestation_bytes IS NULL AND
       lease.attestation_sha256 IS NULL AND lease.receipt_bytes IS NULL AND
       lease.receipt_sha256 IS NULL AND lease.completed_at IS NULL AND
       lease.reader_summary_job_id IS NULL AND
       lease.reader_summary_artifact_id IS NULL AND lease.publication_id IS NULL AND
       lease.publication_report_sha256 IS NULL AND lease.publication_proof_sha256 IS NULL AND
       lease.weekly_evidence_sha256 IS NULL AND lease.public_evidence_sha256 IS NULL AND
       lease.public_frontend_sha256 IS NULL AND lease.publication_prepared_at IS NULL AND
       lease.finalized_at IS NULL) AS payload_free
    FROM public."reader_summary_daily_canonical_recovery_v4_leases" lease
    WHERE lease.tenant_id = $1::UUID AND lease.workspace_id = $2::UUID
      AND lease.requested_utc_date = $3::DATE
  `, [tenant, workspace, date]);
  const row = result.rows[0];
  if (row === undefined || !isSha(row.model_job_identity) ||
      !isSha(row.source_authority_sha256)) {
    throw new Error("ambiguity retry original snapshot is invalid");
  }
  return Object.freeze({
    snapshot: row.snapshot,
    modelJobIdentity: row.model_job_identity,
    sourceAuthoritySha256: row.source_authority_sha256,
    state: row.state,
    preModelConsumedAt: row.pre_model_consumed_at,
    runningAt: row.running_at,
    failedAmbiguousAt: row.failed_ambiguous_at,
    payloadFree: row.payload_free,
  });
};

const retrySnapshot = async (client: Client): Promise<string> => {
  const result = await client.query<{ snapshot: string; rows: string }>(`
    SELECT
      (SELECT encode(sha256(convert_to(to_jsonb(retry)::TEXT, 'UTF8')), 'hex')
         FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" retry
        WHERE retry.tenant_id = $1::UUID AND retry.workspace_id = $2::UUID
          AND retry.requested_utc_date = $3::DATE) AS snapshot,
      (SELECT count(*)::TEXT
         FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" retry
        WHERE retry.tenant_id = $1::UUID AND retry.workspace_id = $2::UUID
          AND retry.requested_utc_date = $3::DATE) AS rows
  `, [tenant, workspace, date]);
  const row = result.rows[0];
  if (row?.rows !== "1" || !isSha(row.snapshot)) {
    throw new Error("ambiguity retry snapshot is invalid or created another attempt");
  }
  return row.snapshot;
};

const assertStaleAttemptCallbacksRejected = async (
  authority: CanonicalRecoveryAuthority,
  originalWork: CanonicalRecoveryWork,
): Promise<void> => {
  if (originalWork.attemptOrdinal !== 1) {
    throw new Error("ambiguity retry fixture original work lacks attempt ordinal 1");
  }
  const now = new Date().toISOString();
  await assertStaleCallbackRejected(
    () => authority.renew(originalWork, now),
    "renew",
  );
  await assertStaleCallbackRejected(
    () => authority.markRunning(originalWork, new Date().toISOString()),
    "mark_running",
  );
  const bytes = Buffer.from("{}", "utf8");
  await assertStaleCallbackRejected(
    () => authority.complete(originalWork, {
      completedAt: new Date().toISOString(),
      responseBytes: bytes,
      responseSha256: "a".repeat(64),
      attestation: {},
      attestationBytes: bytes,
      attestationSha256: "b".repeat(64),
      receiptBytes: bytes,
      receiptSha256: "c".repeat(64),
    }),
    "complete",
  );
};

const assertStaleAttemptPublicationCallbacksRejected = async (
  systemRuntime: Client,
  auditor: Client,
  originalWork: CanonicalRecoveryWork,
): Promise<void> => {
  if (originalWork.attemptOrdinal !== 1) {
    throw new Error("ambiguity retry fixture original work lacks attempt ordinal 1");
  }
  const values = [
    tenant,
    workspace,
    date,
    originalWork.modelJobIdentity,
    originalWork.attemptOrdinal,
    originalWork.workerId,
    originalWork.fencingToken.toString(),
    "30000000-0000-4000-8000-000000000003",
    "40000000-0000-4000-8000-000000000004",
    "40000000-0000-4000-8000-000000000004",
    "a".repeat(64),
    "b".repeat(64),
    "c".repeat(64),
    "d".repeat(64),
    "e".repeat(64),
  ];
  const beforePrepare = await retrySnapshot(auditor);
  await assertStaleCallbackRejected(
    () => serializable(systemRuntime, (transaction) => transaction.query(`
      SELECT public."prepare_reader_summary_daily_canonical_recovery_v4_publication"(
        $1::UUID, $2::UUID, $3::DATE, $4::CHAR(64), $5::SMALLINT,
        $6::TEXT, $7::BIGINT, $8::UUID, $9::UUID, $10::UUID,
        $11::CHAR(64), $12::CHAR(64), $13::CHAR(64), $14::CHAR(64), $15::CHAR(64)
      )
    `, values)),
    "prepare",
  );
  assert(
    (await retrySnapshot(auditor)) === beforePrepare,
    "stale attempt-1 prepare changed attempt-2 bytes",
  );
  const beforeFinalize = await retrySnapshot(auditor);
  await assertStaleCallbackRejected(
    () => serializable(systemRuntime, (transaction) => transaction.query(`
      SELECT public."finalize_reader_summary_daily_canonical_recovery_v4"(
        $1::UUID, $2::UUID, $3::DATE, $4::CHAR(64), $5::SMALLINT,
        $6::TEXT, $7::BIGINT, $8::UUID, $9::UUID, $10::UUID,
        $11::CHAR(64), $12::CHAR(64), $13::CHAR(64), $14::CHAR(64), $15::CHAR(64)
      )
    `, values)),
    "finalize",
  );
  assert(
    (await retrySnapshot(auditor)) === beforeFinalize,
    "stale attempt-1 finalize changed attempt-2 bytes",
  );
};

const assertStaleCallbackRejected = async (
  operation: () => Promise<unknown>,
  label: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("stale attempt identity")) return;
    throw new Error(`stale attempt-1 ${label} rejected for the wrong reason: ${message}`);
  }
  throw new Error(`stale attempt-1 ${label} mutated attempt 2`);
};

const assertRetryAcl = async (client: Client): Promise<void> => {
  const result = await client.query<{
    publicTable: boolean;
    terminalTable: boolean;
    systemTable: boolean;
    publicationRuntimeTable: boolean;
    publicAuthorize: boolean;
    terminalAuthorize: boolean;
    systemAuthorize: boolean;
    publicationRuntimeAuthorize: boolean;
    terminalLockHelper: boolean;
    terminalBindingHelper: boolean;
    publicTransitions: boolean;
    terminalTransitions: boolean;
    systemTransitions: boolean;
    publicationRuntimeTransitions: boolean;
    callbackOverloads: string;
    obsoleteRenewAbsent: boolean;
    obsoleteRunningAbsent: boolean;
    obsoleteCompleteAbsent: boolean;
  }>(`
    SELECT
      has_table_privilege('public', 'public.${retryTable}',
        'SELECT,INSERT,UPDATE,DELETE') AS "publicTable",
      has_table_privilege('social_monitor_reader_summary_daily_terminal',
        'public.${retryTable}', 'SELECT,INSERT,UPDATE,DELETE') AS "terminalTable",
      has_table_privilege('social_monitor_tenant_system_runtime',
        'public.${retryTable}', 'SELECT,INSERT,UPDATE,DELETE') AS "systemTable",
      has_table_privilege('social_monitor_reader_summary_publication_runtime',
        'public.${retryTable}', 'SELECT,INSERT,UPDATE,DELETE') AS "publicationRuntimeTable",
      has_function_privilege('public',
        'public.authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry(UUID,UUID,DATE,CHAR,CHAR,TIMESTAMPTZ)',
        'EXECUTE') AS "publicAuthorize",
      has_function_privilege('social_monitor_reader_summary_daily_terminal',
        'public.authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry(UUID,UUID,DATE,CHAR,CHAR,TIMESTAMPTZ)',
        'EXECUTE') AS "terminalAuthorize",
      has_function_privilege('social_monitor_tenant_system_runtime',
        'public.authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry(UUID,UUID,DATE,CHAR,CHAR,TIMESTAMPTZ)',
        'EXECUTE') AS "systemAuthorize",
      has_function_privilege('social_monitor_reader_summary_publication_runtime',
        'public.authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry(UUID,UUID,DATE,CHAR,CHAR,TIMESTAMPTZ)',
        'EXECUTE') AS "publicationRuntimeAuthorize",
      has_function_privilege('social_monitor_reader_summary_daily_terminal',
        'public.lock_reader_summary_daily_canonical_recovery_v4_effective_attempt(UUID,UUID,DATE)',
        'EXECUTE') AS "terminalLockHelper",
      has_function_privilege('social_monitor_reader_summary_daily_terminal',
        'public.assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding(UUID,UUID,DATE)',
        'EXECUTE') AS "terminalBindingHelper",
      (SELECT bool_and(has_function_privilege('public', procedure.name, 'EXECUTE'))
       FROM unnest(ARRAY[
         'public.renew_reader_summary_daily_canonical_recovery_v4_lease(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ)',
         'public.mark_reader_summary_daily_canonical_recovery_v4_running(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ)',
         'public.complete_reader_summary_daily_canonical_recovery_v4(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ,BYTEA,CHAR,JSONB,BYTEA,CHAR,BYTEA,CHAR)'
       ]) procedure(name)) AS "publicTransitions",
      (SELECT bool_and(has_function_privilege('social_monitor_reader_summary_daily_terminal', procedure.name, 'EXECUTE'))
       FROM unnest(ARRAY[
         'public.renew_reader_summary_daily_canonical_recovery_v4_lease(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ)',
         'public.mark_reader_summary_daily_canonical_recovery_v4_running(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ)',
         'public.complete_reader_summary_daily_canonical_recovery_v4(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ,BYTEA,CHAR,JSONB,BYTEA,CHAR,BYTEA,CHAR)'
       ]) procedure(name)) AS "terminalTransitions",
      (SELECT bool_or(has_function_privilege('social_monitor_tenant_system_runtime', procedure.name, 'EXECUTE'))
       FROM unnest(ARRAY[
         'public.renew_reader_summary_daily_canonical_recovery_v4_lease(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ)',
         'public.mark_reader_summary_daily_canonical_recovery_v4_running(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ)',
         'public.complete_reader_summary_daily_canonical_recovery_v4(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ,BYTEA,CHAR,JSONB,BYTEA,CHAR,BYTEA,CHAR)'
       ]) procedure(name)) AS "systemTransitions",
      (SELECT bool_or(has_function_privilege('social_monitor_reader_summary_publication_runtime', procedure.name, 'EXECUTE'))
       FROM unnest(ARRAY[
         'public.renew_reader_summary_daily_canonical_recovery_v4_lease(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ)',
         'public.mark_reader_summary_daily_canonical_recovery_v4_running(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ)',
         'public.complete_reader_summary_daily_canonical_recovery_v4(UUID,UUID,DATE,CHAR,SMALLINT,TEXT,BIGINT,TIMESTAMPTZ,BYTEA,CHAR,JSONB,BYTEA,CHAR,BYTEA,CHAR)'
       ]) procedure(name)) AS "publicationRuntimeTransitions",
      (SELECT count(*)::TEXT FROM pg_proc procedure
       JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = 'public' AND procedure.proname IN (
         'renew_reader_summary_daily_canonical_recovery_v4_lease',
         'mark_reader_summary_daily_canonical_recovery_v4_running',
         'complete_reader_summary_daily_canonical_recovery_v4'
       )) AS "callbackOverloads",
      to_regprocedure('public.renew_reader_summary_daily_canonical_recovery_v4_lease(UUID,UUID,DATE,TEXT,BIGINT,TIMESTAMPTZ)') IS NULL AS "obsoleteRenewAbsent",
      to_regprocedure('public.mark_reader_summary_daily_canonical_recovery_v4_running(UUID,UUID,DATE,TEXT,BIGINT,TIMESTAMPTZ)') IS NULL AS "obsoleteRunningAbsent",
      to_regprocedure('public.complete_reader_summary_daily_canonical_recovery_v4(UUID,UUID,DATE,TEXT,BIGINT,TIMESTAMPTZ,BYTEA,CHAR,JSONB,BYTEA,CHAR,BYTEA,CHAR)') IS NULL AS "obsoleteCompleteAbsent"
  `);
  const row = result.rows[0];
  assert(
    row?.publicTable === false && row.terminalTable === false &&
      row.systemTable === false && row.publicationRuntimeTable === false &&
      row.publicAuthorize === false && row.terminalAuthorize === true &&
      row.systemAuthorize === false && row.publicationRuntimeAuthorize === false &&
      row.terminalLockHelper === false && row.terminalBindingHelper === false &&
      row.publicTransitions === false && row.terminalTransitions === true &&
      row.systemTransitions === false && row.publicationRuntimeTransitions === false &&
      row.callbackOverloads === "3" && row.obsoleteRenewAbsent === true &&
      row.obsoleteRunningAbsent === true && row.obsoleteCompleteAbsent === true,
    `ambiguity retry ACL diverged: ${JSON.stringify(row)}`,
  );
};

const assertRetryRow = async (
  client: Client,
  original: OriginalSnapshot,
  authorized: Readonly<{ modelJobIdentity: string; authorizationSha256: string }>,
): Promise<void> => {
  const result = await client.query<{
    attempt_ordinal: string;
    supersedes_model_job_identity: string;
    source_authority_sha256: string;
    authorization_sha256: string;
    model_job_identity: string;
    state: string;
    superseded_pre_model_consumed_at: string | null;
    superseded_running_at: string | null;
    superseded_failed_ambiguous_at: string | null;
  }>(`
    SELECT attempt_ordinal::TEXT, btrim(supersedes_model_job_identity) AS supersedes_model_job_identity,
      btrim(source_authority_sha256) AS source_authority_sha256, btrim(authorization_sha256) AS authorization_sha256,
      btrim(model_job_identity) AS model_job_identity, state,
      superseded_pre_model_consumed_at::TEXT, superseded_running_at::TEXT,
      superseded_failed_ambiguous_at::TEXT
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
    WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID
      AND requested_utc_date = $3::DATE
  `, [tenant, workspace, date]);
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error("ambiguity retry audit row is missing");
  }
  assert(
    result.rows.length === 1 && row.attempt_ordinal === "2" &&
      row.supersedes_model_job_identity.trim() === original.modelJobIdentity &&
      row.source_authority_sha256.trim() === original.sourceAuthoritySha256 &&
      row.authorization_sha256.trim() === authorized.authorizationSha256 &&
      row.model_job_identity.trim() === authorized.modelJobIdentity &&
      row.state === "AUTHORIZED" &&
      row.superseded_pre_model_consumed_at === original.preModelConsumedAt &&
      row.superseded_running_at === original.runningAt &&
      row.superseded_failed_ambiguous_at === original.failedAmbiguousAt,
    `authorized retry audit binding diverged: ${JSON.stringify(row)}`,
  );
};

const authorizeRetry = async (
  client: Client,
  values: readonly unknown[],
): Promise<Readonly<{ modelJobIdentity: string; authorizationSha256: string }>> => {
  const result = await serializable(client, (transaction) => transaction.query<{
    model_job_identity: string;
    authorization_sha256: string;
  }>(`SELECT * FROM public."authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry"(
      $1::UUID, $2::UUID, $3::DATE, $4::CHAR(64), $5::CHAR(64), $6::TIMESTAMPTZ
    )`, values));
  const row = result.rows[0];
  if (result.rows.length !== 1 || row === undefined || !isSha(row.model_job_identity) ||
      !isSha(row.authorization_sha256)) {
    throw new Error("ambiguity retry authorization did not return exact identities");
  }
  return Object.freeze({
    modelJobIdentity: row.model_job_identity,
    authorizationSha256: row.authorization_sha256,
  });
};

const assertRejected = async (
  client: Client,
  label: string,
  values: readonly unknown[],
): Promise<void> => {
  try {
    await authorizeRetry(client, values);
  } catch {
    return;
  }
  throw new Error(`ambiguity retry admitted ${label}`);
};

const assertDirectTableRejected = async (client: Client, label: string): Promise<void> => {
  try {
    await client.query(`SELECT * FROM public."${retryTable}"`);
  } catch {
    return;
  }
  throw new Error(`ambiguity retry admitted ${label}`);
};

const assertDirectOriginalMutationRejected = async (client: Client): Promise<void> => {
  try {
    await client.query(`
      UPDATE public."reader_summary_daily_canonical_recovery_v4_leases"
      SET failed_ambiguous_at = transaction_timestamp()
      WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID
        AND requested_utc_date = $3::DATE
    `, [tenant, workspace, date]);
  } catch {
    return;
  }
  throw new Error("ambiguity retry admitted mutation of superseded original history");
};

const serializable = async <T>(
  client: Client,
  operation: (transaction: Client) => Promise<T>,
): Promise<T> => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original authorization rejection.
    }
    throw error;
  }
};

const functionBody = (sql: string, name: string, endMarker: string): string => {
  const start = sql.indexOf(`FUNCTION public."${name}"`);
  const end = sql.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`ambiguity retry function ${name} is missing`);
  }
  return sql.slice(start, end);
};

const exactFunctionBody = (sql: string, name: string): string => {
  const start = sql.indexOf(`FUNCTION public."${name}"`);
  const next = sql.indexOf("\nCREATE OR REPLACE FUNCTION public.", start + 1);
  const end = next < 0 ? sql.length : next;
  if (start < 0 || end <= start) {
    throw new Error(`ambiguity retry function ${name} is missing`);
  }
  return sql.slice(start, end);
};

const alternateSha = (value: string): string =>
  `${value[0] === "a" ? "b" : "a"}${value.slice(1)}`;

const countOccurrences = (source: string, value: string): number =>
  source.split(value).length - 1;

const isSha = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

const assert: (condition: unknown, message: string) => asserts condition =
  (condition, message) => {
    if (!condition) throw new Error(message);
  };
