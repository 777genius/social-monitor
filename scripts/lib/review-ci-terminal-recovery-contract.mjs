export const terminalAuthorityPostgres18Command =
  "node scripts/run-with-timeout.mjs --timeout-ms 180000 --node-options --max-old-space-size=1024 -- ts-node -r tsconfig-paths/register scripts/check-reader-summary-daily-terminal-authority-postgres.ts";

export const terminalAuthorityCommandViolations = (packageJson) =>
  packageJson.scripts?.["check:reader-summary-daily-terminal-authority-postgres"] ===
    terminalAuthorityPostgres18Command
    ? []
    : [
      "package.json: daily terminal PostgreSQL 18 checker must remain the exact timeout-bounded reviewed command",
    ];

export const terminalRecoveryWiringViolations = (source) => {
  const violations = [];
  const imports = [...source.matchAll(
    /^import \{ runReaderSummaryTelemetryMigrationRecoveryPostgres18 \} from "\.\/lib\/reader-summary-telemetry-migration-recovery-postgres";$/gmu,
  )];
  const invocations = [...source.matchAll(
    /await runReaderSummaryTelemetryMigrationRecoveryPostgres18\(\{/gu,
  )];
  if (imports.length !== 1) {
    violations.push(
      "terminal PostgreSQL 18 checker must import the exact telemetry recovery harness once",
    );
  }
  if (invocations.length !== 1) {
    violations.push(
      "terminal PostgreSQL 18 checker must invoke the exact telemetry recovery harness once",
    );
  }
  return violations;
};
