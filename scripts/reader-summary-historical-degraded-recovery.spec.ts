import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  assertHistoricalDegradedRecoveryCliArguments,
  recoveryHelpText,
} from "./reader-summary-historical-degraded-recovery";

describe("historical degraded recovery CLI evidence contract", () => {
  it("initializes every CLI helper before the executable entrypoint runs", () => {
    const result = spawnSync(
      process.execPath,
      [
        "-r",
        "ts-node/register",
        "-r",
        "tsconfig-paths/register",
        resolve(__dirname, "reader-summary-historical-degraded-recovery.ts"),
        "invalid-command",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
        timeout: 30_000,
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Command must be install-input, prepare, run, or verify",
    );
    expect(result.stderr).not.toContain("before initialization");
  });

  it.each([
    ["prepare", ["prepare", "--date", "2026-08-18"]],
    ["run", ["run", "--date", "2026-08-18", "--authority-sha256", "a".repeat(64)]],
    ["verify", ["verify", "--date", "2026-08-19", "--authority-sha256", "b".repeat(64)]],
    ["install-input", ["install-input", "--date", "2026-08-19", "--artifact", "x-backfill-receipt"]],
  ] as const)("accepts the exact %s option set", (command, args) => {
    expect(() => assertHistoricalDegradedRecoveryCliArguments(args, command))
      .not.toThrow();
  });

  it.each([
    ["prepare", ["prepare", "--date", "2026-08-18", "--authority", "/tmp/a"]],
    ["run", ["run", "--date", "2026-08-18", "--authority-sha256", "a".repeat(64), "--dataset-manifest", "/tmp/m"]],
    ["install-input", ["install-input", "--date", "2026-08-18", "--artifact", "x-backfill-receipt", "--source", "/tmp/r"]],
  ] as const)("rejects unrestricted path options for %s", (command, args) => {
    expect(() => assertHistoricalDegradedRecoveryCliArguments(args, command))
      .toThrow("unsupported");
  });

  it("documents fixed-root, uid-1000, create-only receipt binding", () => {
    const help = recoveryHelpText();
    expect(help).toContain("/var/lib/social-monitor/artifacts");
    expect(help).toContain("effective uid 1000");
    expect(help).toContain("create-only");
    expect(help).toContain("72 rows");
    expect(help).toContain("77 new rows");
    expect(help).toContain("transitively");
  });
});
