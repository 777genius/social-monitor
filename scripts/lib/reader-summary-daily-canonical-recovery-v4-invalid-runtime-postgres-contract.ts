import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  ReaderSummaryDailySqlClient,
  ReaderSummaryDailySqlResult,
  ReaderSummaryDailySqlTransaction,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor-row";

import {
  DailyCanonicalRecoveryRuntimeFailureError,
  DailyCanonicalRecoveryRuntimeTransportError,
  PostgresCanonicalRecoveryAuthority,
  type CanonicalRecoveryAuthority,
  type CanonicalRecoveryDate,
  type CanonicalRecoveryWork,
} from "./reader-summary-daily-canonical-recovery-v4";
import { ReaderSummaryDailyCanonicalRecoveryV4Executor } from "./reader-summary-daily-canonical-recovery-v4-executor";
import {
  assertPgCatalogOnlySecurityDefinerSearchPaths,
} from "./reader-summary-daily-canonical-recovery-v4-postgres-contract";
import type { RecoveryPostgresClient } from "./reader-summary-production-recovery-postgres-contract";

const migration =
  "prisma/migrations/20260805180000_reader_summary_daily_v4_invalid_runtime_terminalization/migration.sql";
const tenantId = "00000000-0000-7000-8000-000000000901";
const workspaceId = "00000000-0000-7000-8000-000000000902";
const terminalRole = '"social_monitor_reader_summary_daily_terminal"';

/** Static gate for the payload-free fenced invalid-runtime terminal path. */
export const assertReaderSummaryDailyCanonicalRecoveryV4InvalidRuntimeMigrationContract = (): void => {
  assert(existsSync(resolve(migration)), "invalid runtime terminal migration is missing");
  const sql = readFileSync(resolve(migration), "utf8");
  const unavailable = functionSql(
    sql,
    "read_reader_summary_daily_canonical_recovery_v4_unavailable",
    "reconcile_reader_summary_daily_canonical_recovery_v4_expired_invalid_runtime_result",
  );
  const reconciliation = functionSql(
    sql,
    "reconcile_reader_summary_daily_canonical_recovery_v4_expired_invalid_runtime_result",
    "DO $rewrite_claim_reader_summary_daily_canonical_recovery_v4_unavailable$",
  );
  const claimRewrite = blockSql(
    sql,
    "DO $rewrite_claim_reader_summary_daily_canonical_recovery_v4_unavailable$",
    "CREATE FUNCTION public.\"fail_reader_summary_daily_canonical_recovery_v4_runtime_result\"",
  );
  const terminalize = functionSql(
    sql,
    "fail_reader_summary_daily_canonical_recovery_v4_runtime_result",
    "read_reader_summary_daily_canonical_recovery_v4_terminals",
  );

  assertPgCatalogOnlySecurityDefinerSearchPaths(sql);
  assert(
    sql.includes('rs_daily_v4_lease_unavailable_terminal_fence_check') &&
      sql.includes('rs_daily_v4_retry_unavailable_terminal_fence_check') &&
      sql.includes('"fencing_token" >= 0 OR') &&
      sql.includes('"fencing_token" = -lease."fencing_token"') &&
      sql.includes('"response_bytes" IS NULL') &&
      sql.includes('"publication_id" IS NULL') &&
      sql.includes('"lease_owner" IS NULL') &&
      sql.includes('"lease_expires_at" IS NULL') &&
      sql.includes('"absolute_expires_at" IS NULL') &&
      !sql.includes('unavailable_terminalized_at'),
    "unavailable terminal fence must be payload-free, lease-cleared, durable, and schema-stable",
  );
  assert(
    unavailable.includes('v_lease."fencing_token" = 0') &&
      unavailable.includes('(v_attempt = 1 AND v_lease."fencing_token" >= 0)') &&
      unavailable.includes('v_signal_count := pg_catalog.jsonb_array_length') &&
      unavailable.includes('v_signal_count <> 342') &&
      unavailable.includes('reader_summary_daily_canonical_recovery_v4_model_identity') &&
      unavailable.includes('assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding') &&
      unavailable.includes('v_lease."failed_ambiguous_at" < v_lease."running_at"') &&
      !unavailable.includes('target_signal_count'),
    "unavailable terminal signal counts must be derived from immutable authority and reject forgery",
  );
  assert(
    sql.includes("DATE '2026-07-23'") &&
      sql.includes("DATE '2026-07-24'") &&
      unavailable.includes('OR (v_attempt = 2 AND (') &&
      unavailable.includes('v_signal_count <> 342') &&
      reconciliation.includes("c_expired_invalid_date CONSTANT DATE := DATE '2026-07-24'") &&
      reconciliation.includes('v_attempt IS DISTINCT FROM 1') &&
      reconciliation.includes('target_date IS DISTINCT FROM c_expired_invalid_date') &&
      reconciliation.includes('v_lease."fencing_token" > 0') &&
      reconciliation.includes('"fencing_token" = -lease."fencing_token"'),
    "only the exact historical Jul23 terminal and operator-certified expired Jul24 attempt may be reconciled",
  );
  assert(
    claimRewrite.includes('lease."fencing_token" < 0') &&
      claimRewrite.includes('lease."requested_utc_date" = DATE \'2026-07-23\'') &&
      !claimRewrite.includes('read_reader_summary_daily_canonical_recovery_v4_unavailable"('),
    "claim must return the unsealed exact Jul24 ambiguity before it skips sealed unavailable terminals",
  );
  assert(
    terminalize.includes("current_setting('transaction_isolation') <> 'serializable'") &&
      terminalize.includes('"state" IS DISTINCT FROM \'RUNNING\'') &&
      terminalize.includes('"fencing_token" IS DISTINCT FROM target_fencing_token') &&
      terminalize.includes('"state" = \'FAILED_AMBIGUOUS\'') &&
      terminalize.includes('"fencing_token" = -retry."fencing_token"') &&
      terminalize.includes('"fencing_token" = -lease."fencing_token"') &&
      terminalize.includes('runtime terminal has a stale fence'),
    "immediate terminalization must use only the current fenced RUNNING attempt",
  );
  assert(
    sql.includes('GRANT EXECUTE ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_unavailable"') &&
      sql.includes('GRANT EXECUTE ON FUNCTION public."reconcile_reader_summary_daily_canonical_recovery_v4_expired_invalid_runtime_result"') &&
      sql.includes('GRANT EXECUTE ON FUNCTION public."fail_reader_summary_daily_canonical_recovery_v4_runtime_result"') &&
      sql.includes('TO "social_monitor_reader_summary_daily_terminal"') &&
      !/GRANT\s+EXECUTE[\s\S]*?TO\s+PUBLIC/iu.test(sql),
    "invalid runtime terminal functions must be terminal-role-only",
  );
  assert(
    !sql.includes('public."reader_summary_artifacts"') &&
      !sql.includes('public."reader_summary_jobs"') &&
      !sql.includes('public."reader_summary_publications"') &&
      !/\b(?:prompt|warnings|usage|safeMessage)\b/iu.test(
        `${unavailable}\n${reconciliation}\n${terminalize}`,
      ),
    "unavailable terminals must leave legacy artifacts untouched and retain no provider detail",
  );
};

/**
 * PostgreSQL 18 fixture check. It rolls every synthetic transition back, so
 * the ordinary success/replay fixture remains independent of this terminal
 * path while real SQL fences, ACLs, and immutable authority are exercised.
 */
export const assertReaderSummaryDailyCanonicalRecoveryV4InvalidRuntimePostgresContract = async (
  input: Readonly<{ auditor: RecoveryPostgresClient; tenantId: string; workspaceId: string }>,
): Promise<void> => {
  assert(
    input.tenantId === tenantId && input.workspaceId === workspaceId,
    "invalid runtime PostgreSQL fixture scope is invalid",
  );
  await input.auditor.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await input.auditor.query(`SET LOCAL SESSION AUTHORIZATION ${terminalRole}`);
    const authority = new PostgresCanonicalRecoveryAuthority(
      savepointSqlClient(input.auditor),
    );
    const jul23Claim = await authority.claim({
      ...scope(),
      invokedAt: new Date().toISOString(),
    });
    if (
      jul23Claim.kind !== "claimed" ||
      jul23Claim.work.requestedUtcDate !== "2026-07-23"
    ) {
      throw new Error("invalid runtime fixture did not claim the exact Jul23 work");
    }
    await authority.markRunning(jul23Claim.work, new Date().toISOString());
    await authority.terminalizeUnavailable(jul23Claim.work);

    let immediateCalls = 0;
    const immediate = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority: leaseAfterClaim(authority, "2026-07-25"),
      runtime: {
        runtimeEngine: "subscription-runtime-cli" as const,
        run: async () => {
          immediateCalls += 1;
          throw new DailyCanonicalRecoveryRuntimeFailureError(false);
        },
      },
      finalizer: noFinalizer,
      now: () => new Date(),
    });
    const immediateSavepoint = "invalid_runtime_immediate";
    await input.auditor.query(`SAVEPOINT ${immediateSavepoint}`);
    try {
      const immediateOutcome = await immediate.runAll(scope());
      assert(
        immediateOutcome.kind === "leased" &&
          immediateOutcome.requestedUtcDate === "2026-07-25" &&
          immediateCalls === 1,
        "typed invalid result must terminalize once and advance without another model call",
      );
    } finally {
      await input.auditor.query(`ROLLBACK TO SAVEPOINT ${immediateSavepoint}`);
      await input.auditor.query(`RELEASE SAVEPOINT ${immediateSavepoint}`);
    }

    const jul24Claim = await authority.claim({
      ...scope(),
      invokedAt: new Date().toISOString(),
    });
    if (
      jul24Claim.kind !== "claimed" ||
      jul24Claim.work.requestedUtcDate !== "2026-07-24"
    ) {
      throw new Error("invalid runtime fixture did not claim the live Jul24 work");
    }
    const capturedJul24Work = jul24Claim.work;
    await authority.markRunning(capturedJul24Work, new Date().toISOString());
    await assertRuntimeTerminalRejectsWrongLiveBindings(
      input.auditor,
      capturedJul24Work,
    );

    await input.auditor.query("RESET SESSION AUTHORIZATION");
    const expired = await input.auditor.query<{ state: string }>(`
      UPDATE public."reader_summary_daily_canonical_recovery_v4_leases"
      SET lease_expires_at = transaction_timestamp() - INTERVAL '1 second'
      WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID
        AND requested_utc_date = DATE '2026-07-24' AND state = 'RUNNING'
      RETURNING state
    `, [tenantId, workspaceId]);
    assert(
      expired.rows.length === 1 && expired.rows[0]?.state === "RUNNING",
      "invalid runtime fixture could not expire Jul24 running work",
    );
    await input.auditor.query(`SET LOCAL SESSION AUTHORIZATION ${terminalRole}`);

    let expiredCalls = 0;
    let expiredClaims = 0;
    let reconcileCalls = 0;
    let jul25Work: CanonicalRecoveryWork | undefined;
    const observedAuthority: CanonicalRecoveryAuthority = {
      claim: async (claim) => {
        const outcome = await authority.claim(claim);
        if (
          outcome.kind === "failed_ambiguous" &&
          outcome.requestedUtcDate === "2026-07-24"
        ) {
          expiredClaims += 1;
          assert(
            outcome.attemptOrdinal === 1 &&
              outcome.modelJobIdentity === capturedJul24Work.modelJobIdentity &&
              outcome.sourceAuthoritySha256 === capturedJul24Work.sourceAuthoritySha256,
            "expired Jul24 must return its exact unsealed FAILED_AMBIGUOUS attempt",
          );
          let unsealedUnavailableRejected = false;
          try {
            await authority.readUnavailable({
              tenantId,
              workspaceId,
              requestedUtcDate: "2026-07-24",
            });
          } catch {
            unsealedUnavailableRejected = true;
          }
          assert(
            unsealedUnavailableRejected,
            "unsealed expired Jul24 must not be readable as an unavailable terminal",
          );
        }
        return outcome;
      },
      markRunning: (work, at) => authority.markRunning(work, at),
      renew: (work, at) => authority.renew(work, at),
      complete: (work, completion) => authority.complete(work, completion),
      terminalizeUnavailable: (work) => authority.terminalizeUnavailable(work),
      readUnavailable: (read) => authority.readUnavailable(read),
      reconcileExpiredUnavailable: async (reconciliation) => {
        if (authority.reconcileExpiredUnavailable === undefined) {
          throw new Error("invalid runtime PostgreSQL authority lacks reconciliation");
        }
        assert(
          reconciliation.requestedUtcDate === "2026-07-24" &&
            reconciliation.attemptOrdinal === 1 &&
            reconciliation.modelJobIdentity === capturedJul24Work.modelJobIdentity &&
            reconciliation.sourceAuthoritySha256 === capturedJul24Work.sourceAuthoritySha256,
          "expired Jul24 reconciliation did not retain its exact failed attempt binding",
        );
        reconcileCalls += 1;
        return authority.reconcileExpiredUnavailable(reconciliation);
      },
      readFinalized: (read) => authority.readFinalized(read),
      readTerminals: (read) => authority.readTerminals(read),
    };
    const reconciled = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority: leaseAfterClaim(observedAuthority, "2026-07-25", (work) => {
        jul25Work = work;
      }),
      runtime: {
        runtimeEngine: "subscription-runtime-cli" as const,
        run: async () => {
          expiredCalls += 1;
          throw new DailyCanonicalRecoveryRuntimeTransportError();
        },
      },
      finalizer: noFinalizer,
      now: () => new Date(),
    });
    const reconciledOutcome = await reconciled.runAll(scope());
    assert(
      reconciledOutcome.kind === "leased" &&
        reconciledOutcome.requestedUtcDate === "2026-07-25" &&
        expiredCalls === 0 && expiredClaims === 1 && reconcileCalls === 1 &&
        jul25Work?.requestedUtcDate === "2026-07-25",
      "expired Jul24 invalid result must reconcile and advance with zero model calls",
    );
    const unavailable = await authority.readUnavailable({
      tenantId,
      workspaceId,
      requestedUtcDate: "2026-07-24",
    });
    assert(
        unavailable.requestedUtcDate === "2026-07-24" &&
        unavailable.attemptOrdinal === 1 &&
        unavailable.signalCount > 0 &&
        unavailable.sourceAuthoritySha256 === capturedJul24Work.sourceAuthoritySha256 &&
        unavailable.modelJobIdentity === capturedJul24Work.modelJobIdentity,
      "expired Jul24 unavailable terminal lost immutable authority or identity binding",
    );

    await input.auditor.query("RESET SESSION AUTHORIZATION");
    const terminal = await input.auditor.query<{
      authorityCount: string;
      chronology: boolean;
      leaseCleared: boolean;
      payloadFree: boolean;
      state: string;
      terminalized: boolean;
    }>(`
      SELECT
        jsonb_array_length(authority.source_authority_record->'items')::TEXT AS "authorityCount",
        lease.pre_model_consumed_at IS NOT NULL AND lease.running_at IS NOT NULL
          AND lease.failed_ambiguous_at IS NOT NULL
          AND lease.pre_model_consumed_at <= lease.running_at
          AND lease.running_at <= lease.failed_ambiguous_at AS chronology,
        lease.lease_owner IS NULL AND lease.leased_at IS NULL
          AND lease.lease_expires_at IS NULL AND lease.absolute_expires_at IS NULL AS "leaseCleared",
        lease.response_bytes IS NULL AND lease.response_sha256 IS NULL
          AND lease.attestation IS NULL AND lease.attestation_bytes IS NULL
          AND lease.attestation_sha256 IS NULL AND lease.receipt_bytes IS NULL
          AND lease.receipt_sha256 IS NULL AND lease.completed_at IS NULL
          AND lease.reader_summary_job_id IS NULL
          AND lease.reader_summary_artifact_id IS NULL AND lease.publication_id IS NULL
          AND lease.publication_report_sha256 IS NULL
          AND lease.publication_proof_sha256 IS NULL
          AND lease.weekly_evidence_sha256 IS NULL
          AND lease.public_evidence_sha256 IS NULL
          AND lease.public_frontend_sha256 IS NULL
          AND lease.publication_prepared_at IS NULL AND lease.finalized_at IS NULL AS "payloadFree",
        lease.state, lease.fencing_token < 0 AS terminalized
      FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
      JOIN public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
        ON authority.tenant_id = lease.tenant_id
        AND authority.workspace_id = lease.workspace_id
        AND authority.requested_utc_date = lease.requested_utc_date
      WHERE lease.tenant_id = $1::UUID AND lease.workspace_id = $2::UUID
        AND lease.requested_utc_date = DATE '2026-07-24'
    `, [tenantId, workspaceId]);
    const row = terminal.rows[0];
    assert(
      terminal.rows.length === 1 && row?.state === "FAILED_AMBIGUOUS" &&
        row.terminalized && row.chronology && row.leaseCleared && row.payloadFree &&
        row.authorityCount === String(unavailable.signalCount),
      "expired Jul24 terminal must be authority-count-bound, chronological, payload-free, and lease-cleared",
    );
    const beforeReplay = await v4LeaseSnapshot(input.auditor);
    await input.auditor.query(`SET LOCAL SESSION AUTHORIZATION ${terminalRole}`);
    const replay = await reconciled.runAll(scope());
    await input.auditor.query("RESET SESSION AUTHORIZATION");
    assert(
      replay.kind === "leased" && replay.requestedUtcDate === "2026-07-25" &&
        expiredCalls === 0 && reconcileCalls === 1 &&
        (await v4LeaseSnapshot(input.auditor)) === beforeReplay,
      "expired Jul24 reconciliation replay must make zero model calls and zero writes",
    );
  } finally {
    await input.auditor.query("ROLLBACK");
  }
};

const scope = () => ({ tenantId, workspaceId, workerId: "invalid-runtime-pg18" });

const noFinalizer = {
  finalize: async (): Promise<never> => {
    throw new Error("invalid runtime terminal must not finalize");
  },
};

const v4LeaseSnapshot = async (client: RecoveryPostgresClient): Promise<string> => {
  const result = await client.query<{ snapshot: string }>(`
    SELECT encode(sha256(convert_to(jsonb_build_object(
      'jul24', (SELECT to_jsonb(lease) FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
        WHERE lease.tenant_id = $1::UUID AND lease.workspace_id = $2::UUID
          AND lease.requested_utc_date = DATE '2026-07-24'),
      'jul25', (SELECT to_jsonb(lease) FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
        WHERE lease.tenant_id = $1::UUID AND lease.workspace_id = $2::UUID
          AND lease.requested_utc_date = DATE '2026-07-25')
    )::TEXT, 'UTF8')), 'hex') AS snapshot
  `, [tenantId, workspaceId]);
  const snapshot = result.rows[0]?.snapshot;
  if (typeof snapshot !== "string" || !/^[0-9a-f]{64}$/u.test(snapshot)) {
    throw new Error("invalid runtime PostgreSQL replay snapshot is invalid");
  }
  return snapshot;
};

/**
 * Exercise the SQL function directly while Jul24 is live. Every forged input
 * runs behind a savepoint that is unconditionally rolled back, so this
 * rejection fixture cannot affect the success/replay or expiry fixtures.
 */
const assertRuntimeTerminalRejectsWrongLiveBindings = async (
  client: RecoveryPostgresClient,
  work: CanonicalRecoveryWork,
): Promise<void> => {
  await client.query("RESET SESSION AUTHORIZATION");
  const before = await v4LeaseSnapshot(client);
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${terminalRole}`);
  const forged = [
    {
      label: "model identity",
      modelJobIdentity: differentSha(work.modelJobIdentity),
      attemptOrdinal: work.attemptOrdinal,
      fencingToken: work.fencingToken,
    },
    {
      label: "attempt ordinal",
      modelJobIdentity: work.modelJobIdentity,
      attemptOrdinal: work.attemptOrdinal === 1 ? 2 : 1,
      fencingToken: work.fencingToken,
    },
    {
      label: "fence",
      modelJobIdentity: work.modelJobIdentity,
      attemptOrdinal: work.attemptOrdinal,
      fencingToken: work.fencingToken + 1n,
    },
  ] as const;
  for (const [index, candidate] of forged.entries()) {
    const savepoint = `invalid_runtime_live_rejection_${index + 1}`;
    await client.query(`SAVEPOINT ${savepoint}`);
    let rejected = false;
    try {
      await client.query(
        `SELECT * FROM public."fail_reader_summary_daily_canonical_recovery_v4_runtime_result"(
          $1::UUID,$2::UUID,$3::DATE,$4::CHAR(64),$5::SMALLINT,$6::TEXT,$7::BIGINT
        )`,
        [
          tenantId,
          workspaceId,
          work.requestedUtcDate,
          candidate.modelJobIdentity,
          candidate.attemptOrdinal,
          work.workerId,
          candidate.fencingToken.toString(),
        ],
      );
    } catch {
      rejected = true;
    } finally {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    }
    await client.query("RESET SESSION AUTHORIZATION");
    const after = await v4LeaseSnapshot(client);
    await client.query(`SET LOCAL SESSION AUTHORIZATION ${terminalRole}`);
    assert(rejected, `runtime terminal accepted a wrong live ${candidate.label}`);
    assert(
      after === before,
      `wrong live ${candidate.label} terminalization changed the lease snapshot`,
    );
  }
};

const differentSha = (value: string): string =>
  `${value.slice(0, -1)}${value.endsWith("0") ? "1" : "0"}`;

const leaseAfterClaim = (
  authority: CanonicalRecoveryAuthority,
  requestedUtcDate: CanonicalRecoveryDate,
  capture?: (work: CanonicalRecoveryWork) => void,
): CanonicalRecoveryAuthority => ({
  claim: async (input) => {
    const claim = await authority.claim(input);
    if (claim.kind === "claimed" && claim.work.requestedUtcDate === requestedUtcDate) {
      capture?.(claim.work);
      return { kind: "leased", requestedUtcDate };
    }
    return claim;
  },
  markRunning: (work, at) => authority.markRunning(work, at),
  renew: (work, at) => authority.renew(work, at),
  complete: (work, input) => authority.complete(work, input),
  terminalizeUnavailable: (work) => authority.terminalizeUnavailable(work),
  readUnavailable: (input) => authority.readUnavailable(input),
  ...(authority.reconcileExpiredUnavailable === undefined
    ? {}
    : { reconcileExpiredUnavailable: (input) => authority.reconcileExpiredUnavailable!(input) }),
  readFinalized: (input) => authority.readFinalized(input),
  readTerminals: (input) => authority.readTerminals(input),
});

const savepointSqlClient = (client: RecoveryPostgresClient): ReaderSummaryDailySqlClient => {
  let ordinal = 0;
  const query = async <TRow extends Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<ReaderSummaryDailySqlResult<TRow>> => {
    const result = await client.query<TRow>(sql, values);
    return { rows: result.rows, rowCount: null };
  };
  const transaction: ReaderSummaryDailySqlTransaction = { query };
  return {
    query,
    serializable: async <T>(operation: (current: ReaderSummaryDailySqlTransaction) => Promise<T>) => {
      ordinal += 1;
      const savepoint = `invalid_runtime_${ordinal}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        const result = await operation(transaction);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    },
  };
};

const functionSql = (sql: string, name: string, nextMarker: string): string => {
  const start = sql.indexOf(`CREATE FUNCTION public."${name}"(`);
  const end = sql.indexOf(nextMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`invalid runtime terminal function ${name} is missing`);
  }
  return sql.slice(start, end);
};

const blockSql = (sql: string, marker: string, nextMarker: string): string => {
  const start = sql.indexOf(marker);
  const end = sql.indexOf(nextMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`invalid runtime terminal block ${marker} is missing`);
  }
  return sql.slice(start, end);
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
