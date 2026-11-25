import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReaderSummaryDailySqlClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor-row";

import {
  assertPgCatalogOnlySecurityDefinerSearchPaths,
} from "./reader-summary-daily-canonical-recovery-v4-postgres-contract";
import {
  DailyCanonicalRecoveryRuntimeFailureError,
  type CanonicalRecoveryAuthority,
  type CanonicalRecoveryFinalizer,
} from "./reader-summary-daily-canonical-recovery-v4";
import { ReaderSummaryDailyCanonicalRecoveryV4Executor } from "./reader-summary-daily-canonical-recovery-v4-executor";
import {
  PostgresCanonicalRecoveryInvalidProductRetrySetAuthorizer,
  canonicalInvalidProductRetrySetSha256,
  invalidProductRetryDates,
  type InvalidProductRetryDate,
} from "./reader-summary-daily-canonical-recovery-v4-invalid-product-retry-set";

const migration =
  "prisma/migrations/20260806010000_reader_summary_daily_v4_invalid_product_retry_set/migration.sql";
const receiptMigration =
  "prisma/migrations/20260806010100_reader_summary_daily_v4_canonical_output_receipt_v3/migration.sql";
const prismaSchema = "prisma/schema.prisma";

/** Static fail-closed gate for the exact Jul25--Jul30 retry-set migration. */
export const assertReaderSummaryDailyCanonicalRecoveryV4InvalidProductRetrySetMigrationContract = (): void => {
  assert(existsSync(resolve(migration)), "invalid-product retry-set migration is missing");
  const sql = readFileSync(resolve(migration), "utf8");
  const authorizer = functionSql(
    sql,
    "authorize_reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set",
    "-- A negative-fenced original",
  );
  const binding = functionSql(
    sql,
    "assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding",
    "CREATE FUNCTION public.\"authorize_reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set\"",
  );
  const projection = functionSql(
    sql,
    "reader_summary_daily_canonical_recovery_v4_terminals_from_projection",
    "CREATE OR REPLACE FUNCTION public.\"read_reader_summary_daily_canonical_recovery_v4_terminals\"",
  );

  assertPgCatalogOnlySecurityDefinerSearchPaths(sql);
  assert(
    sql.includes("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE") &&
      authorizer.includes("current_setting('transaction_isolation') <> 'serializable'") &&
      authorizer.includes("v_retry_count NOT IN (0, 6)") &&
      authorizer.includes("FOR UPDATE") &&
      authorizer.includes("FOR KEY SHARE") &&
      authorizer.includes('assert_reader_summary_daily_canonical_recovery_v4_binding') &&
      authorizer.includes("RETURN QUERY") &&
      authorizer.includes("ORDER BY retry.\"requested_utc_date\"") &&
      authorizer.includes("invalid-product terminal-set digest is invalid"),
    "retry-set authorization must be serializable, atomic, ordered, and digest-bound",
  );
  assert(
    ["25", "26", "27", "28", "29", "30"].every((day) =>
      sql.includes(`DATE '2026-07-${day}'`)) &&
      !authorizer.includes("DATE '2026-07-24'") &&
      authorizer.includes("'invalid_product_retry_set_v1'") &&
      authorizer.includes("'invalid_product'") &&
      sql.includes("response_bytes\" IS NOT NULL") &&
      authorizer.includes("reader_summary_publications") &&
      sql.includes("weekly_evidence_sha256\" IS NOT NULL"),
    "retry-set scope must be exact Jul25--Jul30 and preserve payload-free originals",
  );
  assert(
    binding.includes("target_date NOT IN") &&
      binding.includes("v_original.\"fencing_token\" >= 0") &&
      binding.includes("v_retry.\"terminal_set_sha256\"") &&
      binding.includes("invalid_product_retry_set_sha256") &&
      binding.includes("ambiguity_retry_model_identity") &&
      binding.includes("invalid-product retry binding is invalid"),
    "every new attempt must retain the closed category, set digest, and V4 identity",
  );
  assert(
    sql.includes("invalid_category\" TEXT") &&
      sql.includes("terminal_set_sha256\" CHAR(64)") &&
      sql.includes("identity is immutable") &&
      sql.includes("invalid_category\" IS DISTINCT FROM OLD") &&
      sql.includes("terminal_set_sha256\" IS DISTINCT FROM OLD"),
    "only the safe invalid category and terminal-set digest may be durable",
  );
  assert(
      sql.includes("negative claim rewrite target diverged") &&
      sql.includes("lease.\"fencing_token\" < 0") &&
      sql.includes("lease.\"fencing_token\" > 0") &&
      sql.includes("lease.\"requested_utc_date\" = DATE '2026-07-23'") &&
      sql.includes("retry.\"state\" = 'FINALIZED'") &&
      sql.includes("retry.\"state\" = 'FAILED_AMBIGUOUS' AND retry.\"fencing_token\" < 0"),
    "negative originals and the legacy positive-fence retry must hide after terminal failure",
  );
  assert(
    projection.includes("WITH projection AS") &&
      projection.includes("FROM projection AS terminal") &&
      projection.includes("invalid_product") &&
      projection.includes("terminal.invalid_category = 'invalid_product'") &&
      projection.includes("terminal.terminal_set_sha256 ~ '^[0-9a-f]{64}$'") &&
      projection.includes("unavailable_payload_free") &&
      projection.includes("COALESCE(terminal.retry_attempt_ordinal, 1)::SMALLINT") &&
      projection.includes(
        "terminal.retry_attempt_ordinal = 2 AND terminal.requested_utc_date IN",
      ) &&
      projection.includes(
        "terminal.retry_attempt_ordinal IS NULL AND terminal.original_fencing_token < 0",
      ) &&
      !projection.includes("read_reader_summary_daily_canonical_recovery_v4_unavailable") &&
      projection.includes("terminal projection has nonterminal or invalid work") &&
      sql.includes("TO \"social_monitor_reader_summary_daily_terminal\""),
    "terminal read must preserve payload-free original terminals in one owner-only projection",
  );

  assert(existsSync(resolve(receiptMigration)), "canonical output receipt migration is missing");
  const receiptSql = readFileSync(resolve(receiptMigration), "utf8");
  const evidenceRecorderClone = sqlBlock(
    receiptSql,
    "DO $clone_reader_summary_daily_canonical_recovery_v4_evidence_recorders$",
    "$clone_reader_summary_daily_canonical_recovery_v4_evidence_recorders$;",
  );
  assertPgCatalogOnlySecurityDefinerSearchPaths(receiptSql);
  assert(
    receiptSql.includes("provenance_v2") &&
      receiptSql.includes("provenance_v3") &&
      receiptSql.includes("reader_summary.daily_canonical_recovery_provenance.v2") &&
      receiptSql.includes("reader_summary.daily_canonical_recovery_provenance.v3") &&
      receiptSql.includes("rawOutputSha256") &&
      receiptSql.includes("rawOutputByteLength") &&
      receiptSql.includes("canonicalOutputSha256") &&
      receiptSql.includes("canonicalOutputByteLength") &&
      receiptSql.includes("selectedOutputSha256") &&
      !receiptSql.includes("rawOutputBytes"),
    "receipt migration must preserve V2 while closing V3 raw/canonical metadata without raw bytes",
  );
  assert(
    receiptSql.includes("V2 provenance verifier clone target diverged") &&
      receiptSql.includes("V3 provenance verifier rewrite target diverged") &&
      receiptSql.includes("V2 evidence recorder clone target diverged") &&
      receiptSql.includes("V3 evidence recorder rewrite target diverged") &&
      receiptSql.includes("record_reader_summary_daily_canonical_recovery_v4_evidence_v2") &&
      receiptSql.includes("record_reader_summary_daily_canonical_recovery_v4_evidence_v3") &&
      receiptSql.includes("clone_reader_summary_daily_canonical_recovery_v4_evidence_recorders") &&
      receiptSql.includes("attestationSha256") &&
      receiptSql.includes('v_lease."receipt_bytes" IS DISTINCT FROM convert_to') &&
      evidenceRecorderClone.includes("public.jsonb_object_length(v_recovery) <> 15") &&
      evidenceRecorderClone.includes("rawOutputSha256") &&
      evidenceRecorderClone.includes("rawOutputByteLength") &&
      evidenceRecorderClone.includes(
        "public.jsonb_object_length(v_receipt->'attestation') <> 12",
      ) &&
      evidenceRecorderClone.includes(
        "btrim(v_receipt->'attestation'->>'selectedOutputSha256') IS DISTINCT FROM",
      ) &&
      evidenceRecorderClone.includes(
        "pg_catalog.strpos(v_v3_definition, 'outputTextByteLength') <> 0",
      ) &&
      receiptSql.includes("'responseSha256', 'canonicalOutputSha256'") &&
      receiptSql.includes("'responseSha256', 'responseByteLength', 'attestationSha256'") &&
      receiptSql.includes("'canonicalOutputSha256', 'canonicalOutputByteLength', 'rawOutputSha256'") &&
      receiptSql.includes("pg_catalog.strpos(v_v3_definition, v_v3_receipt_tail) = 0") &&
      receiptSql.includes("social_monitor.reader_summary.weekly.generate") &&
      receiptSql.includes("TO \"social_monitor_tenant_system_runtime\"") &&
      !/GRANT\s+EXECUTE[\s\S]*?TO\s+PUBLIC/iu.test(receiptSql),
    "receipt migration must independently bind raw attestation and retain least privilege",
  );
  assert(
    receiptSql.includes(
      'CREATE OR REPLACE FUNCTION public."complete_reader_summary_daily_canonical_recovery_v4"(',
    ) &&
      receiptSql.includes("V2 receipts bind the") &&
      receiptSql.includes("raw selected-output digest") &&
      receiptSql.includes("'canonicalOutputSha256', 'canonicalOutputByteLength', 'rawOutputSha256'") &&
      receiptSql.includes("v_receipt->>'rawOutputByteLength')::INTEGER <= 1000000") &&
      receiptSql.includes("octet_length(exact_response) <= 1000000") &&
      receiptSql.includes("v_attestation->>'selectedOutputSha256' IS NOT DISTINCT FROM") &&
      receiptSql.includes("v_receipt->>'schemaVersion' IS NOT DISTINCT FROM '1'") &&
      receiptSql.includes("v_receipt->>'schemaVersion' IS NOT DISTINCT FROM '2'") &&
      receiptSql.includes('public."reader_summary_weekly_canonical_json"(v_receipt)') &&
      !receiptSql.includes("rawOutputBytes"),
    "completion must accept only canonical V2 or raw/canonical V3 receipts without raw bytes",
  );

  assert(existsSync(resolve(prismaSchema)), "Prisma schema is missing");
  const schema = readFileSync(resolve(prismaSchema), "utf8");
  const retryModelStart = schema.indexOf(
    "model ReaderSummaryDailyCanonicalRecoveryV4AmbiguityRetry {",
  );
  const retryModelEnd = schema.indexOf("\n}", retryModelStart);
  const retryModel = schema.slice(retryModelStart, retryModelEnd);
  assert(
    retryModelStart >= 0 && retryModelEnd > retryModelStart &&
      /invalidCategory\s+String\?\s+@map\("invalid_category"\)/u.test(retryModel) &&
      /terminalSetSha256\s+String\?\s+@map\("terminal_set_sha256"\)\s+@db\.Char\(64\)/u.test(retryModel),
    "Prisma ambiguity-retry model must map nullable invalid category and terminal-set digest",
  );

  const publicationGuardSql = sqlBlock(
    sql,
    "DO $rewrite_publish_reader_summary_pre_evidence_invalid_product_retry_set_guard$",
    "$rewrite_publish_reader_summary_pre_evidence_invalid_product_retry_set_guard$;",
  );
  assert(
    publicationGuardSql.includes(
      "rewrite_publish_reader_summary_pre_evidence_invalid_product_retry_set_guard",
    ) &&
      publicationGuardSql.includes("v_job.\"period_started_at\" IN (") &&
      publicationGuardSql.includes("AND EXISTS (") &&
      publicationGuardSql.includes("assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding") &&
      publicationGuardSql.includes("retry.\"terminal_set_sha256\"") &&
      publicationGuardSql.includes("recoveryV4'->>'modelJobIdentity'") &&
      publicationGuardSql.includes("recoveryV4'->>'sourceAuthoritySha256'") &&
      publicationGuardSql.includes("DATE '2026-07-23'") &&
      !publicationGuardSql.includes("DATE '2026-07-24'") &&
      ["25", "26", "27", "28", "29", "30"].every((day) =>
        publicationGuardSql.includes(`DATE '2026-07-${day}'`)),
    "publisher guard must retain Jul23 and bind only the exact authorized Jul25--Jul30 retry set",
  );
};

const functionSql = (sql: string, name: string, endMarker: string): string => {
  const start = sql.indexOf(`FUNCTION public."${name}"(`);
  const end = sql.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`invalid-product retry-set function ${name} is missing`);
  }
  return sql.slice(start, end);
};

const sqlBlock = (
  sql: string,
  startMarker: string,
  endMarker: string,
): string => {
  const start = sql.indexOf(startMarker);
  const endStart = sql.indexOf(endMarker, start);
  if (start < 0 || endStart < 0 || endStart <= start) {
    throw new Error(`invalid-product retry-set SQL block ${startMarker} is missing`);
  }
  return sql.slice(start, endStart + endMarker.length);
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type ContractClient = Readonly<{
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly T[] }>>;
}>;

type TerminalSnapshot = Readonly<{
  requestedUtcDate: string;
  modelJobIdentity: string;
  sourceAuthoritySha256: string;
  sourceAuthorityBytesSha256: string;
  sourceAuthorityBytesHex: string;
  state: string;
  fencingToken: string;
  payloadFree: boolean;
}>;

type RetrySnapshot = Readonly<{
  requestedUtcDate: string;
  modelJobIdentity: string;
  authorizationSha256: string;
  state: string;
  invalidCategory: string;
  terminalSetSha256: string;
  attemptOrdinal: string;
}>;

/**
 * Runs the disposable PG18 incident shape: Jul24 remains ordinary, the six
 * exact originals terminalize without payloads, a digest authorizes attempt2,
 * and replay is observably read-only before the real V4 executor resumes.
 */
export const assertReaderSummaryDailyCanonicalRecoveryV4InvalidProductRetrySetPostgresContract = async (
  input: Readonly<{
    auditor: ContractClient;
    terminal: ReaderSummaryDailySqlClient;
    terminalSession: ContractClient;
    authority: CanonicalRecoveryAuthority;
    finalizer: CanonicalRecoveryFinalizer;
    completeJul24(): Promise<Readonly<{ kind: string }>>;
    now: () => Date;
    tenantId: string;
    workspaceId: string;
    workerId: string;
  }>,
): Promise<string> => {
  const jul24 = await input.completeJul24();
  assert(jul24.kind === "completed", "ordinary Jul24 must remain a V4 completion");

  let failedRuntimeCalls = 0;
  const failureExecutor = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
    authority: input.authority,
    finalizer: input.finalizer,
    now: input.now,
    runtime: {
      runtimeEngine: "subscription-runtime-cli" as const,
      run: async () => {
        failedRuntimeCalls += 1;
        throw new DailyCanonicalRecoveryRuntimeFailureError(false);
      },
    },
  });
  for (const requestedUtcDate of invalidProductRetryDates) {
    let terminalized = false;
    try {
      await failureExecutor.runOne({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        workerId: input.workerId,
      });
    } catch (error) {
      terminalized = error instanceof DailyCanonicalRecoveryRuntimeFailureError &&
        error.terminalized;
    }
    assert(
      terminalized,
      `invalid-product attempt1 ${requestedUtcDate} did not terminalize`,
    );
  }
  assert(
    failedRuntimeCalls === invalidProductRetryDates.length,
    "invalid-product fixture did not make exactly six failed attempt1 calls",
  );

  const originalsBefore = await terminalSnapshots(input.auditor);
  assertExactFailedOriginals(originalsBefore);
  await assertInitialNegativeTerminalsProject({
    terminal: input.terminalSession,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
  });
  const terminalSetSha256 = canonicalInvalidProductRetrySetSha256(
    originalsBefore.map((row) => ({
      requestedUtcDate: row.requestedUtcDate as InvalidProductRetryDate,
      modelJobIdentity: row.modelJobIdentity,
      sourceAuthoritySha256: row.sourceAuthoritySha256,
    })),
  );
  assertThrows(
    () => canonicalInvalidProductRetrySetSha256(originalsBefore.slice(0, 5).map(
      (row) => ({
        requestedUtcDate: row.requestedUtcDate as InvalidProductRetryDate,
        modelJobIdentity: row.modelJobIdentity,
        sourceAuthoritySha256: row.sourceAuthoritySha256,
      }),
    )),
    "partial terminal set was accepted",
  );
  assertThrows(
    () => canonicalInvalidProductRetrySetSha256([{
      requestedUtcDate: "2026-07-24" as InvalidProductRetryDate,
      modelJobIdentity: originalsBefore[0]!.modelJobIdentity,
      sourceAuthoritySha256: originalsBefore[0]!.sourceAuthoritySha256,
    }]),
    "Jul24 terminal set was accepted",
  );
  await assertFailedAttemptTwoDoesNotLoop({
    terminal: input.terminalSession,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    terminalSetSha256,
    now: input.now,
  });
  assert(
    failedRuntimeCalls === invalidProductRetryDates.length,
    "failed attempt2 no-loop probe made a model call",
  );

  const authorizer = new PostgresCanonicalRecoveryInvalidProductRetrySetAuthorizer(
    input.terminal,
  );
  await assertInvalidProductAuthorizerNegativeProbes({
    auditor: input.auditor,
    terminalSetSha256,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
  });
  const mixedTerminalSetSha256 = canonicalInvalidProductRetrySetSha256(
    originalsBefore.map((row, index) => ({
      requestedUtcDate: row.requestedUtcDate as InvalidProductRetryDate,
      modelJobIdentity: index === 0 ? "f".repeat(64) : row.modelJobIdentity,
      sourceAuthoritySha256: row.sourceAuthoritySha256,
    })),
  );
  await assertRejects(
    authorizer.authorize({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      terminalSetSha256: mixedTerminalSetSha256,
    }),
    "mixed terminal set digest was authorized",
  );

  const authorized = await authorizer.authorize({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    terminalSetSha256,
  });
  assert(
    authorized.map((entry) => entry.requestedUtcDate).join(",") ===
      invalidProductRetryDates.join(","),
    "invalid-product authorization did not return the exact ordered six rows",
  );
  const originalsAfterAuthorization = await terminalSnapshots(input.auditor);
  assert(
    canonicalSnapshot(originalsAfterAuthorization) === canonicalSnapshot(originalsBefore),
    "invalid-product authorization changed an attempt1 terminal",
  );
  const retriesBeforeReplay = await retrySnapshots(input.auditor);
  assertExactAuthorizedRetries(retriesBeforeReplay, terminalSetSha256);
  await assertAuthorizedInvalidProductPublisherRaces({
    auditor: input.auditor,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
  });

  const replay = await authorizer.authorize({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    terminalSetSha256,
  });
  assert(
    canonicalSnapshot(replay) === canonicalSnapshot(authorized) &&
      canonicalSnapshot(await retrySnapshots(input.auditor)) ===
        canonicalSnapshot(retriesBeforeReplay) &&
      canonicalSnapshot(await terminalSnapshots(input.auditor)) ===
        canonicalSnapshot(originalsBefore),
    "invalid-product authorization replay performed writes or changed hashes",
  );
  return terminalSetSha256;
};

/**
 * Before an operator admits attempt2, the six negative-fenced attempt1 rows
 * are intentionally hidden from the claim path but remain ordinary generic
 * unavailable terminals. This reads the public terminal function directly so
 * the one-projection implementation is exercised before any retry exists.
 */
const assertInitialNegativeTerminalsProject = async (input: Readonly<{
  terminal: ContractClient;
  tenantId: string;
  workspaceId: string;
}>): Promise<void> => {
  await input.terminal.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const terminals = await input.terminal.query<{
      outcome: string;
      requestedUtcDate: string;
      reasonCode: string | null;
      attemptOrdinal: string | null;
    }>(`
      SELECT outcome, to_char(requested_utc_date, 'YYYY-MM-DD') AS "requestedUtcDate",
        reason_code AS "reasonCode", attempt_ordinal::TEXT AS "attemptOrdinal"
      FROM public."read_reader_summary_daily_canonical_recovery_v4_terminals"(
        $1::UUID,$2::UUID
      )
      ORDER BY requested_utc_date
    `, [input.tenantId, input.workspaceId]);
    assert(
      terminals.rows.length === 8 &&
        terminals.rows.every((row, index) =>
          row.requestedUtcDate ===
            (index < 2
              ? ["2026-07-23", "2026-07-24"][index]
              : invalidProductRetryDates[index - 2]) &&
          (index < 2
            ? row.outcome === "FINALIZED" && row.reasonCode === null &&
              row.attemptOrdinal === null
            : row.outcome === "UNAVAILABLE" &&
              row.reasonCode === "model_result_not_durably_persisted_after_consumed_attempt" &&
              row.attemptOrdinal === "1")),
      "negative-fenced attempt1 terminals did not remain generic unavailable before authorization",
    );
  } finally {
    await input.terminal.query("ROLLBACK");
  }
};

/** Rolls back a real attempt2 terminalization after proving its next claim skips it. */
const assertFailedAttemptTwoDoesNotLoop = async (input: Readonly<{
  terminal: ContractClient;
  tenantId: string;
  workspaceId: string;
  terminalSetSha256: string;
  now: () => Date;
}>): Promise<void> => {
  const workerId = "daily-recovery-pg18-invalid-product-no-loop";
  await input.terminal.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const authorized = await input.terminal.query(`
      SELECT * FROM public."authorize_reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set"(
        $1::UUID,$2::UUID,$3::CHAR(64)
      )
    `, [input.tenantId, input.workspaceId, input.terminalSetSha256]);
    assert(authorized.rows.length === invalidProductRetryDates.length,
      "no-loop probe did not authorize six attempt2 rows");
    const first = await claimAttempt(input.terminal, input.tenantId, input.workspaceId, workerId, input.now());
    assert(
      first.outcome === "CLAIMED" && first.requestedUtcDate === "2026-07-25" &&
        first.attemptOrdinal === "2" && first.modelJobIdentity !== "" && first.fencingToken !== "",
      "no-loop probe did not claim the first invalid-product retry",
    );
    await input.terminal.query(`
      SELECT * FROM public."mark_reader_summary_daily_canonical_recovery_v4_running"(
        $1::UUID,$2::UUID,$3::DATE,$4::CHAR(64),$5::SMALLINT,$6::TEXT,$7::BIGINT,$8::TIMESTAMPTZ
      )
    `, [input.tenantId, input.workspaceId, first.requestedUtcDate, first.modelJobIdentity,
      first.attemptOrdinal, workerId, first.fencingToken, input.now().toISOString()]);
    const failed = await input.terminal.query<{ reason_code: string }>(`
      SELECT * FROM public."fail_reader_summary_daily_canonical_recovery_v4_runtime_result"(
        $1::UUID,$2::UUID,$3::DATE,$4::CHAR(64),$5::SMALLINT,$6::TEXT,$7::BIGINT
      )
    `, [input.tenantId, input.workspaceId, first.requestedUtcDate, first.modelJobIdentity,
      first.attemptOrdinal, workerId, first.fencingToken]);
    assert(
      failed.rows.length === 1 && failed.rows[0]?.reason_code === "invalid_product",
      "no-loop probe did not persist the closed invalid-product terminal category",
    );
    const next = await claimAttempt(
      input.terminal, input.tenantId, input.workspaceId, `${workerId}-next`, input.now(),
    );
    assert(
      next.outcome === "CLAIMED" && next.requestedUtcDate === "2026-07-26" &&
        next.attemptOrdinal === "2",
      "failed invalid-product attempt2 remained claimable instead of advancing",
    );
  } finally {
    await input.terminal.query("ROLLBACK");
  }
};

const assertInvalidProductAuthorizerNegativeProbes = async (input: Readonly<{
  auditor: ContractClient; terminalSetSha256: string; tenantId: string; workspaceId: string;
}>): Promise<void> => {
  await assertInvalidProductAuthorizerRejectsWithoutMutation({
    client: input.auditor, label: "partial retry set", expected: "invalid-product retry set is partial",
    prepare: (client) => withPublisherOwner(client, () => insertInvalidProductProbeRetry(client, input.terminalSetSha256, "2026-07-25", 2, input.tenantId, input.workspaceId)),
    invoke: (client) => invokeInvalidProductRetrySetAuthorizer(client, input.tenantId, input.workspaceId, input.terminalSetSha256),
  });
  await assertInvalidProductAuthorizerRejectsWithoutMutation({
    client: input.auditor, label: "Jul24 widened retry date", expected: "ambiguity retry is outside its authorized scope",
    prepare: async () => undefined,
    invoke: (client) => withPublisherOwner(client, () => client.query(
      `SELECT public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"($1::UUID,$2::UUID,DATE '2026-07-24')`,
      [input.tenantId, input.workspaceId],
    )),
  });
  await assertInvalidProductAuthorizerRejectsWithoutMutation({
    client: input.auditor, label: "attempt ordinal 3", expected: "ambiguity retry binding is invalid",
    prepare: (client) => withPublisherOwner(client, async () => {
      await client.query('ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" DROP CONSTRAINT "rs_daily_recovery_v4_ambiguity_retries_scope_check"');
      await insertInvalidProductProbeRetry(client, input.terminalSetSha256, "2026-07-25", 3, input.tenantId, input.workspaceId);
    }),
    invoke: (client) => withPublisherOwner(client, () => client.query(
      `SELECT public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"($1::UUID,$2::UUID,DATE '2026-07-25')`,
      [input.tenantId, input.workspaceId],
    )),
  });
};

const assertInvalidProductAuthorizerRejectsWithoutMutation = async (input: Readonly<{
  client: ContractClient; label: string; expected: string; prepare(client: ContractClient): Promise<void>; invoke(client: ContractClient): Promise<void>;
}>): Promise<void> => {
  await input.client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await input.prepare(input.client); const before = await invalidProductAuthorizerSnapshot(input.client);
    await input.client.query("SAVEPOINT invalid_product_authorizer_negative_probe");
    let message: string | undefined; try { await input.invoke(input.client); } catch (error) { message = error instanceof Error ? error.message : String(error); }
    await input.client.query("ROLLBACK TO SAVEPOINT invalid_product_authorizer_negative_probe");
    const after = await invalidProductAuthorizerSnapshot(input.client);
    assert(message?.includes(input.expected) && after === before, `invalid-product authorizer ${input.label} was accepted or mutated durable rows: ${message ?? "accepted"}`);
  } finally { await input.client.query("ROLLBACK"); }
};

const invalidProductAuthorizerSnapshot = async (client: ContractClient): Promise<string> => canonicalSnapshot([
  await terminalSnapshots(client), await retrySnapshots(client),
]);

const invokeInvalidProductRetrySetAuthorizer = async (client: ContractClient, tenantId: string, workspaceId: string, terminalSetSha256: string): Promise<void> => {
  await client.query('SET LOCAL SESSION AUTHORIZATION "social_monitor_reader_summary_daily_terminal"');
  await client.query(`SELECT * FROM public."authorize_reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set"($1::UUID,$2::UUID,$3::CHAR(64))`, [tenantId, workspaceId, terminalSetSha256]);
};

const insertInvalidProductProbeRetry = (client: ContractClient, terminalSetSha256: string, requestedUtcDate: string, attemptOrdinal: number, tenantId: string, workspaceId: string): Promise<unknown> => client.query(`
  INSERT INTO public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" ("tenant_id","workspace_id","requested_utc_date","attempt_ordinal","supersedes_model_job_identity","superseded_pre_model_consumed_at","superseded_running_at","superseded_failed_ambiguous_at","source_authority_sha256","authorization_sha256","authorization_reason","invalid_category","terminal_set_sha256","authorized_by","authorized_at","model_job_identity","state")
  SELECT lease."tenant_id",lease."workspace_id",lease."requested_utc_date",$3::SMALLINT,lease."model_job_identity",lease."pre_model_consumed_at",lease."running_at",lease."failed_ambiguous_at",authority."source_authority_sha256",authorization_digest.sha256,'invalid_product_retry_set_v1','invalid_product',$1::CHAR(64),'social_monitor_reader_summary_daily_terminal',transaction_timestamp(),public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_model_identity"(lease."tenant_id",lease."workspace_id",lease."requested_utc_date",authority."source_authority_sha256",lease."model_job_identity",authorization_digest.sha256),'AUTHORIZED'
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" lease JOIN public."reader_summary_daily_canonical_recovery_v4_authorities" authority ON authority."tenant_id"=lease."tenant_id" AND authority."workspace_id"=lease."workspace_id" AND authority."requested_utc_date"=lease."requested_utc_date" CROSS JOIN LATERAL (SELECT public."reader_summary_daily_canonical_recovery_v4_invalid_product_retry_authorization_sha256"(lease."tenant_id",lease."workspace_id",lease."requested_utc_date",$1::TEXT,lease."model_job_identity",authority."source_authority_sha256") AS sha256) AS authorization_digest
  WHERE lease."requested_utc_date"=$2::DATE AND lease."tenant_id"=$4::UUID AND lease."workspace_id"=$5::UUID
`, [terminalSetSha256, requestedUtcDate, attemptOrdinal, tenantId, workspaceId]);

const claimAttempt = async (
  terminal: ContractClient,
  tenantId: string,
  workspaceId: string,
  workerId: string,
  now: Date,
): Promise<Readonly<{
  outcome: string;
  requestedUtcDate: string;
  modelJobIdentity: string;
  attemptOrdinal: string;
  fencingToken: string;
}>> => {
  const result = await terminal.query<{
    outcome: string;
    requestedUtcDate: string | null;
    modelJobIdentity: string | null;
    attemptOrdinal: string | null;
    fencingToken: string | null;
  }>(`
    SELECT outcome, requested_utc_date::TEXT AS "requestedUtcDate",
      btrim(model_job_identity) AS "modelJobIdentity", attempt_ordinal::TEXT AS "attemptOrdinal",
      fencing_token::TEXT AS "fencingToken"
    FROM public."claim_reader_summary_daily_canonical_recovery_v4"(
      $1::UUID,$2::UUID,$3::TEXT,$4::TIMESTAMPTZ
    )
  `, [tenantId, workspaceId, workerId, now.toISOString()]);
  const row = result.rows[0];
  if (row === undefined || result.rows.length !== 1) {
    throw new Error("no-loop probe claim did not return one row");
  }
  return Object.freeze({
    outcome: row.outcome,
    requestedUtcDate: row.requestedUtcDate ?? "",
    modelJobIdentity: row.modelJobIdentity ?? "",
    attemptOrdinal: row.attemptOrdinal ?? "",
    fencingToken: row.fencingToken ?? "",
  });
};

type PublisherRaceRetry = Readonly<{
  requestedUtcDate: string;
  modelJobIdentity: string;
  sourceAuthoritySha256: string;
  terminalSetSha256: string;
}>;
type PublisherRaceIds = Readonly<{
  candidateArtifact: string;
  candidateJob: string;
  priorArtifact: string;
  priorEvent: string;
  priorJob: string;
  priorPublication: string;
}>;

/** Exercises the ordinary publisher against every bound Jul25--Jul30 retry slot. */
const assertAuthorizedInvalidProductPublisherRaces = async (input: Readonly<{
  auditor: ContractClient;
  tenantId: string;
  workspaceId: string;
}>): Promise<void> => {
  const retries = await publisherRaceRetries(input.auditor, input.tenantId, input.workspaceId);
  await input.auditor.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    for (const [index, retry] of retries.entries()) {
      const ids = publisherRaceIdsFor(index);
      const periodStartedAt = `${retry.requestedUtcDate}T00:00:00.000Z`;
      const periodEndedAt = new Date(
        Date.parse(periodStartedAt) + 86_400_000,
      ).toISOString();
      const periodKey = `daily:${periodStartedAt}:${periodEndedAt}:UTC`;
      await seedPublisherRacePrior({
        client: input.auditor,
        ids,
        periodEndedAt,
        periodKey,
        periodStartedAt,
        requestedUtcDate: retry.requestedUtcDate,
        tenantId: input.tenantId,
        timestamp: "2026-08-05T12:00:00.000Z",
        workspaceId: input.workspaceId,
      });
      const before = await publisherRaceSlotState({
        client: input.auditor,
        ids,
        periodEndedAt,
        periodStartedAt,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
      });
      await seedPublisherRaceCandidate({
        client: input.auditor,
        ids,
        periodEndedAt,
        periodKey,
        periodStartedAt,
        retry,
        tenantId: input.tenantId,
        timestamp: "2026-08-05T13:00:00.000Z",
        workspaceId: input.workspaceId,
      });
      await input.auditor.query('SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"');
      const savepoint = `invalid_product_publisher_race_${index}`;
      await input.auditor.query(`SAVEPOINT ${savepoint}`);
      let message: string | undefined;
      try {
        await input.auditor.query(`SELECT * FROM public."publish_reader_summary"($1::JSONB)`, [
          JSON.stringify({
            schemaVersion: "reader_summary.publication_command.v2",
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            readerSummaryJobId: ids.candidateJob,
            readerSummaryArtifactId: ids.candidateArtifact,
          }),
        ]);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      await input.auditor.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await input.auditor.query("RESET ROLE");
      const after = await publisherRaceSlotState({
        client: input.auditor,
        ids,
        periodEndedAt,
        periodStartedAt,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
      });
      assert(
        message?.includes("retry cannot supersede target publication slot") &&
          JSON.stringify(after) === JSON.stringify(before),
        `invalid-product publisher race ${retry.requestedUtcDate} was not rejected without changing its slot: ${message ?? "accepted"}`,
      );
    }
  } finally {
    await input.auditor.query("ROLLBACK");
  }
};

const publisherRaceRetries = async (
  client: ContractClient,
  tenantId: string,
  workspaceId: string,
): Promise<readonly PublisherRaceRetry[]> => {
  const result = await client.query<PublisherRaceRetry>(`
    SELECT to_char(retry."requested_utc_date", 'YYYY-MM-DD') AS "requestedUtcDate",
      btrim(retry."model_job_identity") AS "modelJobIdentity",
      btrim(retry."source_authority_sha256") AS "sourceAuthoritySha256",
      btrim(retry."terminal_set_sha256") AS "terminalSetSha256"
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = $1::UUID AND retry."workspace_id" = $2::UUID
      AND retry."requested_utc_date" IN (
        DATE '2026-07-25', DATE '2026-07-26', DATE '2026-07-27',
        DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
      )
      AND retry."state" = 'AUTHORIZED' AND retry."attempt_ordinal" = 2
      AND retry."invalid_category" = 'invalid_product'
      AND retry."authorization_reason" = 'invalid_product_retry_set_v1'
    ORDER BY retry."requested_utc_date"
  `, [tenantId, workspaceId]);
  assert(
    result.rows.length === invalidProductRetryDates.length &&
      result.rows.every((retry, index) =>
        retry.requestedUtcDate === invalidProductRetryDates[index] &&
        [retry.modelJobIdentity, retry.sourceAuthoritySha256, retry.terminalSetSha256]
          .every((value) => /^[0-9a-f]{64}$/u.test(value))),
    "publisher race fixture lacks the exact six authorized invalid-product retry bindings",
  );
  return result.rows;
};

const publisherRaceIdsFor = (index: number): PublisherRaceIds => {
  const id = (offset: number): string =>
    `f1000000-0000-4000-8000-${String(index * 10 + offset).padStart(12, "0")}`;
  return {
    priorArtifact: id(1), priorEvent: id(2), priorJob: id(3), priorPublication: id(4),
    candidateArtifact: id(5), candidateJob: id(6),
  };
};

const seedPublisherRacePrior = async (input: Readonly<{
  client: ContractClient;
  ids: PublisherRaceIds;
  periodEndedAt: string;
  periodKey: string;
  periodStartedAt: string;
  requestedUtcDate: string;
  tenantId: string;
  timestamp: string;
  workspaceId: string;
}>): Promise<void> => {
  await withPublisherOwner(input.client, () => input.client.query(`
    INSERT INTO public."reader_summary_artifacts" (id,tenant_id,workspace_id,scope_type,scope_key,interest_id,cadence,period_started_at,period_ended_at,period_timezone,period_key,user_id,subscription_id,status,schema_version,model_version,prompt_version,headline,summary_text,artifact_payload,citations,quality_signals,created_at,updated_at)
    VALUES ($1::UUID,$2::UUID,$3::UUID,'workspace','workspace',NULL,'daily',$4::TIMESTAMPTZ,$5::TIMESTAMPTZ,'UTC',$6::TEXT,NULL,NULL,'COMPLETED',1,'codex:invalid-product-race','invalid-product-race','prior fixture','prior fixture','{}'::JSONB,'[]'::JSONB,jsonb_build_object('qualityFlags','[]'::JSONB),$7::TIMESTAMPTZ,$7::TIMESTAMPTZ)
  `, [input.ids.priorArtifact, input.tenantId, input.workspaceId, input.periodStartedAt, input.periodEndedAt, input.periodKey, input.timestamp]));
  await input.client.query(`
    INSERT INTO public."reader_summary_jobs" (id,tenant_id,workspace_id,scope_type,scope_key,interest_id,cadence,period_started_at,period_ended_at,period_timezone,period_key,user_id,subscription_id,status,idempotency_key,requested_at,started_at,completed_at,failed_at,reader_summary_artifact_id,failure_reason,created_at,updated_at)
    VALUES ($1::UUID,$2::UUID,$3::UUID,'workspace','workspace',NULL,'daily',$4::TIMESTAMPTZ,$5::TIMESTAMPTZ,'UTC',$6::TEXT,NULL,NULL,'COMPLETED','invalid-product-race-prior:'||$1::TEXT,$7::TIMESTAMPTZ,$7::TIMESTAMPTZ,$7::TIMESTAMPTZ,NULL,$8::UUID,NULL,$7::TIMESTAMPTZ,$7::TIMESTAMPTZ)
  `, [input.ids.priorJob, input.tenantId, input.workspaceId, input.periodStartedAt, input.periodEndedAt, input.periodKey, input.timestamp, input.ids.priorArtifact]);
  await input.client.query(`
    INSERT INTO public."outbox_events" (id,tenant_id,workspace_id,event_type,schema_version,payload,status,correlation_id,causation_id,created_at)
    VALUES ($1::UUID,$2::UUID,$3::UUID,'invalid-product-race',1,'{}'::JSONB,'PENDING','invalid-product-race',NULL,$4::TIMESTAMPTZ)
  `, [input.ids.priorEvent, input.tenantId, input.workspaceId, input.timestamp]);
  await withPublisherOwner(input.client, () => input.client.query(`
    WITH publication AS (
      INSERT INTO public."reader_summary_publications" (id,tenant_id,workspace_id,scope_type,scope_key,cadence,period_started_at,period_ended_at,period_timezone,period_key,requested_utc_date,publication_kind,reader_summary_job_id,reader_summary_artifact_id,semantic_status,requested_at,model_version,model_authority,report_sha256,proof_sha256,exact_proof,outbox_event_id,published_at)
      VALUES ($1::UUID,$2::UUID,$3::UUID,'workspace','workspace','daily',$4::TIMESTAMPTZ,$5::TIMESTAMPTZ,'UTC',$6::TEXT,$7::DATE,'EXACT',$8::UUID,$9::UUID,'COMPLETED',$10::TIMESTAMPTZ,'codex:invalid-product-race',3,repeat('a',64),repeat('b',64),'{"schemaVersion":"reader_summary.publication_proof.v1"}'::JSONB,$11::UUID,$10::TIMESTAMPTZ)
      RETURNING id
    )
    INSERT INTO public."reader_summary_publication_slots" (tenant_id,workspace_id,scope_type,scope_key,cadence,period_started_at,period_ended_at,period_timezone,current_publication_id,updated_at)
    SELECT $2::UUID,$3::UUID,'workspace','workspace','daily',$4::TIMESTAMPTZ,$5::TIMESTAMPTZ,'UTC',publication.id,$10::TIMESTAMPTZ FROM publication
  `, [input.ids.priorPublication, input.tenantId, input.workspaceId, input.periodStartedAt, input.periodEndedAt, input.periodKey, input.requestedUtcDate, input.ids.priorJob, input.ids.priorArtifact, input.timestamp, input.ids.priorEvent]));
};

const seedPublisherRaceCandidate = async (input: Readonly<{
  client: ContractClient;
  ids: PublisherRaceIds;
  periodEndedAt: string;
  periodKey: string;
  periodStartedAt: string;
  retry: PublisherRaceRetry;
  tenantId: string;
  timestamp: string;
  workspaceId: string;
}>): Promise<void> => {
  await withPublisherOwner(input.client, () => input.client.query(`
    INSERT INTO public."reader_summary_artifacts" (id,tenant_id,workspace_id,scope_type,scope_key,interest_id,cadence,period_started_at,period_ended_at,period_timezone,period_key,user_id,subscription_id,status,schema_version,model_version,prompt_version,headline,summary_text,artifact_payload,citations,quality_signals,created_at,updated_at)
    VALUES ($1::UUID,$2::UUID,$3::UUID,'workspace','workspace',NULL,'daily',$4::TIMESTAMPTZ,$5::TIMESTAMPTZ,'UTC',$6::TEXT,NULL,NULL,'RUNNING',1,'codex:invalid-product-race','invalid-product-race','bound candidate','bound candidate',jsonb_build_object('schemaVersion','reader_summary.artifact.v1','readerSummaryId',$1::TEXT,'tenantId',$2::TEXT,'workspaceId',$3::TEXT,'scope',jsonb_build_object('type','workspace'),'period',jsonb_build_object('cadence','daily','startedAt',to_char($4::TIMESTAMPTZ AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'endedAt',to_char($5::TIMESTAMPTZ AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'timezone','UTC','periodKey',$6::TEXT),'lineage',jsonb_build_object('modelVersion','codex:invalid-product-race','promptVersion','invalid-product-race'),'headline','bound candidate','executiveSummary','bound candidate','citationMap','[]'::JSONB,'qualityFlags','["no_signal"]'::JSONB,'noSignalReason','invalid-product publisher race'),'[]'::JSONB,jsonb_build_object('qualityFlags','["no_signal"]'::JSONB,'githubProjectionAudit',jsonb_build_object('recoveryV4',jsonb_build_object('schemaVersion','reader_summary.daily_canonical_recovery_provenance.v3','recoveryVersion','reader_summary.daily_canonical_recovery.v4','selectedOutputKind','output_text','sourceAuthoritySchemaVersion',2,'tenantId',$2::TEXT,'workspaceId',$3::TEXT,'requestedUtcDate',$7::TEXT,'ingestionCutoff','2026-08-05T13:00:00.000Z','sourceAuthoritySha256',$8::TEXT,'modelJobIdentity',$9::TEXT,'canonicalOutputSha256',repeat('a',64),'canonicalOutputByteLength',2,'rawOutputSha256',repeat('b',64),'rawOutputByteLength',2,'githubProjectionSha256',repeat('c',64)))),$10::TIMESTAMPTZ,$10::TIMESTAMPTZ)
  `, [input.ids.candidateArtifact, input.tenantId, input.workspaceId, input.periodStartedAt, input.periodEndedAt, input.periodKey, input.retry.requestedUtcDate, input.retry.sourceAuthoritySha256, input.retry.modelJobIdentity, input.timestamp]));
  await input.client.query(`
    INSERT INTO public."reader_summary_jobs" (id,tenant_id,workspace_id,scope_type,scope_key,interest_id,cadence,period_started_at,period_ended_at,period_timezone,period_key,user_id,subscription_id,status,idempotency_key,requested_at,started_at,completed_at,failed_at,reader_summary_artifact_id,failure_reason,created_at,updated_at)
    VALUES ($1::UUID,$2::UUID,$3::UUID,'workspace','workspace',NULL,'daily',$4::TIMESTAMPTZ,$5::TIMESTAMPTZ,'UTC',$6::TEXT,NULL,NULL,'RUNNING','invalid-product-race-candidate:'||$1::TEXT,$7::TIMESTAMPTZ,NULL,NULL,NULL,$8::UUID,NULL,$7::TIMESTAMPTZ,$7::TIMESTAMPTZ)
  `, [input.ids.candidateJob, input.tenantId, input.workspaceId, input.periodStartedAt, input.periodEndedAt, input.periodKey, input.timestamp, input.ids.candidateArtifact]);
};

const publisherRaceSlotState = async (input: Readonly<{
  client: ContractClient;
  ids: PublisherRaceIds;
  periodEndedAt: string;
  periodStartedAt: string;
  tenantId: string;
  workspaceId: string;
}>): Promise<Readonly<{ artifactStatus: string; publicationCount: string; slotId: string }>> => {
  const result = await input.client.query<{
    artifactStatus: string;
    publicationCount: string;
    slotId: string;
  }>(`
    SELECT artifact.status AS "artifactStatus",
      (SELECT count(*)::TEXT FROM public."reader_summary_publications" AS publication
       WHERE publication.tenant_id=$1::UUID AND publication.workspace_id=$2::UUID
         AND publication.scope_type='workspace' AND publication.scope_key='workspace'
         AND publication.cadence='daily' AND publication.period_timezone='UTC'
         AND publication.period_started_at=$3::TIMESTAMPTZ AND publication.period_ended_at=$4::TIMESTAMPTZ) AS "publicationCount",
      slot.current_publication_id::TEXT AS "slotId"
    FROM public."reader_summary_artifacts" AS artifact
    JOIN public."reader_summary_publication_slots" AS slot
      ON slot.current_publication_id=$5::UUID
    WHERE artifact.id=$6::UUID
  `, [input.tenantId, input.workspaceId, input.periodStartedAt, input.periodEndedAt, input.ids.priorPublication, input.ids.priorArtifact]);
  const row = result.rows[0];
  if (row === undefined || row.artifactStatus !== "COMPLETED" ||
      row.publicationCount !== "1" || row.slotId !== input.ids.priorPublication) {
    throw new Error(`invalid-product publisher race prior state is invalid: ${JSON.stringify(row)}`);
  }
  return Object.freeze(row);
};

let publisherOwnerSavepointSequence = 0;

const withPublisherOwner = async (
  client: ContractClient,
  operation: () => Promise<unknown>,
): Promise<void> => {
  const savepoint = `publisher_owner_${publisherOwnerSavepointSequence += 1}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await client.query('SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"');
    await operation();
    await client.query("RESET ROLE");
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  } catch (error) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch {
      // Preserve the prepare or operation error rather than a cleanup failure.
    }
    throw error;
  }
};

const terminalSnapshots = async (client: ContractClient): Promise<readonly TerminalSnapshot[]> => {
  const result = await client.query<TerminalSnapshot>(`
    SELECT to_char(lease."requested_utc_date", 'YYYY-MM-DD') AS "requestedUtcDate",
      btrim(lease."model_job_identity") AS "modelJobIdentity",
      btrim(lease."source_authority_sha256") AS "sourceAuthoritySha256",
      encode(sha256(authority."source_authority_bytes"), 'hex') AS "sourceAuthorityBytesSha256",
      encode(authority."source_authority_bytes", 'hex') AS "sourceAuthorityBytesHex",
      lease."state" AS "state", lease."fencing_token"::TEXT AS "fencingToken",
      (lease."response_bytes" IS NULL AND lease."response_sha256" IS NULL
        AND lease."attestation" IS NULL AND lease."attestation_bytes" IS NULL
        AND lease."attestation_sha256" IS NULL AND lease."receipt_bytes" IS NULL
        AND lease."receipt_sha256" IS NULL AND lease."completed_at" IS NULL
        AND lease."reader_summary_job_id" IS NULL AND lease."reader_summary_artifact_id" IS NULL
        AND lease."publication_id" IS NULL AND lease."publication_report_sha256" IS NULL
        AND lease."publication_proof_sha256" IS NULL AND lease."weekly_evidence_sha256" IS NULL
        AND lease."public_evidence_sha256" IS NULL AND lease."public_frontend_sha256" IS NULL) AS "payloadFree"
    FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    JOIN public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
      ON authority."tenant_id" = lease."tenant_id"
      AND authority."workspace_id" = lease."workspace_id"
      AND authority."requested_utc_date" = lease."requested_utc_date"
    WHERE lease."requested_utc_date" BETWEEN DATE '2026-07-25' AND DATE '2026-07-30'
    ORDER BY lease."requested_utc_date"
  `);
  return result.rows;
};

const retrySnapshots = async (client: ContractClient): Promise<readonly RetrySnapshot[]> => {
  const result = await client.query<RetrySnapshot>(`
    SELECT to_char("requested_utc_date", 'YYYY-MM-DD') AS "requestedUtcDate",
      btrim("model_job_identity") AS "modelJobIdentity",
      btrim("authorization_sha256") AS "authorizationSha256", "state" AS "state",
      "invalid_category" AS "invalidCategory", btrim("terminal_set_sha256") AS "terminalSetSha256",
      "attempt_ordinal"::TEXT AS "attemptOrdinal"
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
    WHERE "requested_utc_date" BETWEEN DATE '2026-07-25' AND DATE '2026-07-30'
    ORDER BY "requested_utc_date"
  `);
  return result.rows;
};

const assertExactFailedOriginals = (rows: readonly TerminalSnapshot[]): void => {
  assert(
    rows.length === invalidProductRetryDates.length &&
      rows.every((row, index) =>
        row.requestedUtcDate === invalidProductRetryDates[index] &&
        row.state === "FAILED_AMBIGUOUS" &&
        /^-[1-9][0-9]*$/u.test(row.fencingToken) &&
        row.payloadFree &&
        row.sourceAuthoritySha256 === row.sourceAuthorityBytesSha256 &&
        /^[0-9a-f]+$/u.test(row.sourceAuthorityBytesHex) &&
        /^[0-9a-f]{64}$/u.test(row.modelJobIdentity)),
    "invalid-product attempt1 terminals are not exact negative-fenced payload-free identities",
  );
};

const assertExactAuthorizedRetries = (
  rows: readonly RetrySnapshot[],
  terminalSetSha256: string,
): void => {
  assert(
    rows.length === invalidProductRetryDates.length &&
      rows.every((row, index) =>
        row.requestedUtcDate === invalidProductRetryDates[index] &&
        row.state === "AUTHORIZED" && row.attemptOrdinal === "2" &&
        row.invalidCategory === "invalid_product" &&
        row.terminalSetSha256 === terminalSetSha256 &&
        /^[0-9a-f]{64}$/u.test(row.modelJobIdentity) &&
        /^[0-9a-f]{64}$/u.test(row.authorizationSha256)),
    "invalid-product retry authorization is not six exact AUTHORIZED attempt2 rows",
  );
};

const canonicalSnapshot = (value: unknown): string => JSON.stringify(value);

const assertThrows = (operation: () => unknown, message: string): void => {
  try {
    operation();
  } catch {
    return;
  }
  throw new Error(message);
};

const assertRejects = async (operation: Promise<unknown>, message: string): Promise<void> => {
  try {
    await operation;
  } catch {
    return;
  }
  throw new Error(message);
};
