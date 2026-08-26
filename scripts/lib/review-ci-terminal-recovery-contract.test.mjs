import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  terminalAuthorityCommandViolations,
  terminalAuthorityPostgres18Command,
  terminalPostgres18JobViolations,
  terminalRecoveryWiringViolations,
} from "./review-ci-terminal-recovery-contract.mjs";

const source = readFileSync(
  "scripts/check-reader-summary-daily-terminal-authority-postgres.ts", "utf8",
);
const release = readFileSync(
  "scripts/lib/reader-summary-daily-telemetry-release.ts", "utf8",
);
const workflow = readFileSync(".github/workflows/pull-request.yml", "utf8");

test("accepts the exact terminal telemetry recovery wiring", () => {
  assert.deepEqual(terminalRecoveryWiringViolations(source, release), []);
  assert.deepEqual(terminalPostgres18JobViolations(workflow), []);
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

const exactCall = `await runReaderSummaryTelemetryMigrationRecoveryPostgres18({
          adminDatabaseUrl,
          defaultAclMigration,
          workspace,
        });`;

for (const [label, mutated] of [
  ["missing import", source.replace(
    'import { runReaderSummaryTelemetryMigrationRecoveryPostgres18 } from "./lib/reader-summary-telemetry-migration-recovery-postgres";\n',
    "",
  )],
  ["aliased import", source.replace(
    "import { runReaderSummaryTelemetryMigrationRecoveryPostgres18 }",
    "import { runReaderSummaryTelemetryMigrationRecoveryPostgres18 as recovery }",
  )],
  ["if false dead branch", source.replace(exactCall, `if (false) {
          ${exactCall}
        }`)],
  ["commented command", source.replace(exactCall,
    exactCall.split("\n").map((line) => `// ${line}`).join("\n"),
  )],
  ["changed arguments", source.replace(
    "          defaultAclMigration,", "          defaultAclMigration: changed,",
  )],
  ["duplicate invocation", source.replace(exactCall, `${exactCall}\n${exactCall}`)],
  ["normal-path substitution", source.replace(exactCall,
    "await applyOrderedReaderSummaryMigrations(adminDatabaseUrl, workspace);",
  )],
  ["whole release path bypass", source.replace(
    "await runReaderSummaryDailyTelemetryRelease({",
    "if (false) await runReaderSummaryDailyTelemetryRelease({",
  )],
  ["braced whole release path bypass", source.replace(
    "await runReaderSummaryDailyTelemetryRelease({",
    "if (false) { await runReaderSummaryDailyTelemetryRelease({",
  ).replace("    });\n  } finally {", "    }); }\n  } finally {")],
  ["duplicate release path", source.replace(
    "    await runReaderSummaryDailyTelemetryRelease({",
    "    await runReaderSummaryDailyTelemetryRelease({\n" +
      "      preparePreTelemetryRelease: async () => undefined,\n" +
      "      verifyPreTelemetryAuthority: async () => undefined,\n" +
      "      applyTelemetryMigration: async () => undefined,\n" +
      "      hardenPostTelemetryRelease: async () => undefined,\n" +
      "      verifyFinalReleaseState: async () => undefined,\n" +
      "    });\n    await runReaderSummaryDailyTelemetryRelease({",
  )],
  ["dead main entrypoint", source.replace(
    "void main().catch", "if (false) void main().catch",
  )],
  ["commented main entrypoint", source.replace(
    "void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });",
    "// main entrypoint removed",
  )],
]) {
  test(`rejects ${label}`, () => {
    assert.notDeepEqual(terminalRecoveryWiringViolations(mutated, release), []);
  });
}

test("rejects release-runner stage bypass and reordering", () => {
  for (const mutation of [
    release.replace("  await operations.applyTelemetryMigration();\n", ""),
    release.replace(
      "  await operations.applyTelemetryMigration();",
      "  if (false) await operations.applyTelemetryMigration();",
    ),
    release.replace(
      "  await operations.applyTelemetryMigration();\n  await operations.hardenPostTelemetryRelease();",
      "  await operations.hardenPostTelemetryRelease();\n  await operations.applyTelemetryMigration();",
    ),
  ]) {
    assert.notDeepEqual(terminalRecoveryWiringViolations(source, mutation), []);
  }
});

test("rejects every demonstrated review-workflow bypass", () => {
  const terminal = "npm run check:reader-summary-daily-terminal-authority-postgres";
  for (const mutation of [
    workflow.replace(`          ${terminal}`, `          if false; then ${terminal}; fi`),
    workflow.replace(`          ${terminal}`, `          # ${terminal}`),
    workflow.replace(terminal, `${terminal} --changed`),
    workflow.replace(`          ${terminal}\n`, ""),
    workflow.replace(
      "      - name: Prove weekly review manifest PostgreSQL 18 contract",
      "      - name: Prove weekly review manifest PostgreSQL 18 contract\n        if: false",
    ),
    workflow.replace(
      "        run: |\n          npm run check:reader-summary-daily-execution-cursor-postgres18",
      "        shell: /bin/true {0}\n        run: |\n" +
        "          npm run check:reader-summary-daily-execution-cursor-postgres18",
    ),
    `defaults:\n  run:\n    shell: /bin/true {0}\n${workflow}`,
  ]) {
    assert.notDeepEqual(terminalPostgres18JobViolations(mutation), []);
  }
});
