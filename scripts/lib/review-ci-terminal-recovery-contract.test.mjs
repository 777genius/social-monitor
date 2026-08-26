import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  terminalAuthorityCommandViolations,
  terminalAuthorityPostgres18Command,
  terminalRecoveryWiringViolations,
} from "./review-ci-terminal-recovery-contract.mjs";

const source = readFileSync(
  "scripts/check-reader-summary-daily-terminal-authority-postgres.ts", "utf8",
);

test("accepts the exact terminal telemetry recovery wiring", () => {
  assert.deepEqual(terminalRecoveryWiringViolations(source), []);
});

test("pins the complete timeout-bounded terminal package command", () => {
  const exact = { scripts: {
    "check:reader-summary-daily-terminal-authority-postgres":
      terminalAuthorityPostgres18Command,
  } };
  assert.deepEqual(terminalAuthorityCommandViolations(exact), []);
  for (const mutation of [
    terminalAuthorityPostgres18Command.replace("180000", "180001"),
    terminalAuthorityPostgres18Command.replace("run-with-timeout.mjs ", ""),
    `${terminalAuthorityPostgres18Command} --changed`,
  ]) {
    assert.notDeepEqual(terminalAuthorityCommandViolations({ scripts: {
      "check:reader-summary-daily-terminal-authority-postgres": mutation,
    } }), []);
  }
});

for (const [label, mutated] of [
  ["missing import", source.replace(
    'import { runReaderSummaryTelemetryMigrationRecoveryPostgres18 } from "./lib/reader-summary-telemetry-migration-recovery-postgres";\n',
    "",
  )],
  ["renamed invocation", source.replace(
    "await runReaderSummaryTelemetryMigrationRecoveryPostgres18({",
    "await bypassTelemetryRecovery({",
  )],
  ["duplicate invocation", `${source}\nawait runReaderSummaryTelemetryMigrationRecoveryPostgres18({});\n`],
]) {
  test(`rejects ${label}`, () => {
    assert.notDeepEqual(terminalRecoveryWiringViolations(mutated), []);
  });
}
