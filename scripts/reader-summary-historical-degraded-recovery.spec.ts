import {
  assertHistoricalDegradedRecoveryCliArguments,
  recoveryHelpText,
} from "./reader-summary-historical-degraded-recovery";

describe("historical degraded recovery CLI evidence contract", () => {
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
