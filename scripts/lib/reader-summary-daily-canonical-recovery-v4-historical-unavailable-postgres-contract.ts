import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  canonicalRecoveryAmbiguityRetryDate,
  canonicalRecoveryAmbiguityRetryModelJobIdentity,
  canonicalRecoveryAmbiguityRetrySourceAuthoritySha256,
} from "./reader-summary-daily-canonical-recovery-v4";
import {
  assertPgCatalogOnlySecurityDefinerSearchPaths,
} from "./reader-summary-daily-canonical-recovery-v4-postgres-contract";

const migration =
  "prisma/migrations/20260805163000_reader_summary_daily_v4_historical_unavailable/migration.sql";
const retiredMigration =
  "prisma/migrations/20260805100000_reader_summary_daily_v4_failed_ambiguity_terminal_unavailable";

/** Static ownership and fail-closed gate for the one historical unavailable day. */
export const assertReaderSummaryDailyCanonicalRecoveryV4HistoricalUnavailableMigrationContract = (): void => {
  assert(
    existsSync(resolve(migration)) && !existsSync(resolve(retiredMigration)),
    "historical unavailable migration must exist only at its owned canonical path",
  );
  const sql = readFileSync(resolve(migration), "utf8");
  const terminals = functionSql(
    sql,
    "read_reader_summary_daily_canonical_recovery_v4_terminals",
    'REVOKE ALL ON FUNCTION public."claim_reader_summary_daily_canonical_recovery_v4"',
  );
  const claimRewrite = sql.slice(0, sql.indexOf(
    'CREATE FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_terminals"(',
  ));

  assertPgCatalogOnlySecurityDefinerSearchPaths(sql);
  assert(
    claimRewrite.includes("lease.\"state\" <> 'FINALIZED'") &&
      claimRewrite.includes("lease.\"state\" = 'FAILED_AMBIGUOUS'") &&
      claimRewrite.includes(
        `lease."requested_utc_date" = DATE '${canonicalRecoveryAmbiguityRetryDate}'`,
      ) &&
      claimRewrite.includes(
        `'${canonicalRecoveryAmbiguityRetryModelJobIdentity}'`,
      ) &&
      claimRewrite.includes(
        `'${canonicalRecoveryAmbiguityRetrySourceAuthoritySha256}'`,
      ) &&
      claimRewrite.includes("retry.\"state\" = 'FAILED_AMBIGUOUS'") &&
      claimRewrite.includes('btrim(lease."source_authority_sha256")') &&
      claimRewrite.includes('btrim(retry."model_job_identity")') &&
      claimRewrite.includes('btrim(retry."source_authority_sha256")') &&
      claimRewrite.includes("terminal failed claim rewrite target diverged") &&
      !sql.includes("NOT IN (''FINALIZED'', ''FAILED_AMBIGUOUS'')") &&
      !sql.includes("NOT IN ('FINALIZED', 'FAILED_AMBIGUOUS')"),
    "historical unavailable migration must skip only the exact failed ambiguity triple",
  );
  assert(
    terminals.includes(
      `c_unavailable_date CONSTANT DATE := DATE '${canonicalRecoveryAmbiguityRetryDate}'`,
    ) &&
      terminals.includes(
        `c_unavailable_model_job_identity CONSTANT TEXT :=\n    '${canonicalRecoveryAmbiguityRetryModelJobIdentity}'`,
      ) &&
      terminals.includes(
        `c_unavailable_source_authority_sha256 CONSTANT TEXT :=\n    '${canonicalRecoveryAmbiguityRetrySourceAuthoritySha256}'`,
      ) &&
      terminals.includes(
        'lease."requested_utc_date" = c_unavailable_date',
      ) &&
      terminals.includes(
        'btrim(lease."model_job_identity") =\n            c_unavailable_model_job_identity',
      ) &&
      terminals.includes(
        'btrim(lease."source_authority_sha256") =\n            c_unavailable_source_authority_sha256',
      ) &&
      !/DATE '2026-07-(?:2[4-9]|3[01])'/u.test(terminals) &&
      terminals.includes("v_failed_count <> 1") &&
      terminals.includes('v_retry."attempt_ordinal" <> 2') &&
      terminals.includes(
        'btrim(v_retry."model_job_identity") IS DISTINCT FROM\n' +
          "        c_unavailable_model_job_identity",
      ) &&
      terminals.includes(
        'btrim(v_retry."source_authority_sha256") IS DISTINCT FROM\n' +
          "        c_unavailable_source_authority_sha256",
      ) &&
      terminals.includes(
        'btrim(v_authority."source_authority_sha256") IS DISTINCT FROM\n' +
          "        c_unavailable_source_authority_sha256",
      ) &&
      terminals.includes('v_retry."response_bytes" IS NOT NULL') &&
      terminals.includes('v_retry."publication_id" IS NOT NULL'),
    "historical unavailable terminal must remain the exact failed attempt-2 Jul23 binding",
  );
  assert(
    terminals.includes("'UNAVAILABLE'") &&
      terminals.includes("'model_result_not_durably_persisted_after_consumed_attempt'") &&
      terminals.includes("v_signal_count <> 342") &&
      terminals.includes("unavailable cannot have a summary or publication"),
    "historical unavailable terminal must not publish or fabricate a model result",
  );
  assert(
    sql.includes('GRANT EXECUTE ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_terminals"') &&
      sql.includes('TO "social_monitor_reader_summary_daily_terminal"'),
    "historical unavailable terminal reader must remain terminal-role-only",
  );
};

const functionSql = (sql: string, name: string, endMarker: string): string => {
  const start = sql.indexOf(`CREATE FUNCTION public."${name}"(`);
  const end = sql.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`historical unavailable function ${name} is missing`);
  }
  return sql.slice(start, end);
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
