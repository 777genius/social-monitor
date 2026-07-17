import { resolveProductionDayExecutionRequest } from "./lib/reader-summary-production-day-reuse-provenance";

describe("production-day execution request", () => {
  it("defaults to live production without reuse flags", () => {
    expect(
      resolveProductionDayExecutionRequest(["--date", "2026-07-15"]),
    ).toEqual({ mode: "live-production" });
  });

  it.each([
    ["--skip-live-collection"],
    ["--reuse-existing-artifacts"],
    ["--skip-live-collection", "--reuse-existing-artifacts"],
  ])("fails closed for incomplete historical flags: %p", (...flags) => {
    expect(() =>
      resolveProductionDayExecutionRequest(["--date", "2026-07-15", ...flags]),
    ).toThrow(
      "Historical artifact reuse requires --skip-live-collection, --reuse-existing-artifacts and --allow-historical",
    );
  });

  it("requires independent source-report and evidence identities and hashes", () => {
    expect(() =>
      resolveProductionDayExecutionRequest([
        "--date",
        "2026-07-15",
        "--skip-live-collection",
        "--reuse-existing-artifacts",
        "--allow-historical",
        "--reuse-source-report",
        "/tmp/source-report.json",
        "--reuse-source-artifact-id",
        "source-id",
        "--reuse-source-artifact-sha256",
        "a".repeat(64),
      ]),
    ).toThrow("--reuse-evidence-artifact-id");
  });

  it("accepts only a completely hash-bound historical request", () => {
    expect(
      resolveProductionDayExecutionRequest([
        "--date",
        "2026-07-15",
        "--skip-live-collection",
        "--reuse-existing-artifacts",
        "--allow-historical",
        "--reuse-source-report",
        "/tmp/source-report.json",
        "--reuse-source-artifact-id",
        "source-id",
        "--reuse-source-artifact-sha256",
        "a".repeat(64),
        "--reuse-evidence-artifact-id",
        "durable-reader-summary-postgres-evidence-v1",
        "--reuse-evidence-artifact-sha256",
        "b".repeat(64),
      ]),
    ).toEqual({
      mode: "historical-reuse",
      sourceReportPath: "/tmp/source-report.json",
      sourceReportArtifactId: "source-id",
      sourceReportSha256: "a".repeat(64),
      evidenceArtifactId: "durable-reader-summary-postgres-evidence-v1",
      evidenceArtifactSha256: "b".repeat(64),
    });
  });

  it("rejects duplicate provenance options", () => {
    expect(() =>
      resolveProductionDayExecutionRequest([
        "--skip-live-collection",
        "--reuse-existing-artifacts",
        "--allow-historical",
        "--reuse-source-report",
        "/tmp/one.json",
        "--reuse-source-report",
        "/tmp/two.json",
        "--reuse-source-artifact-id",
        "source-id",
        "--reuse-source-artifact-sha256",
        "a".repeat(64),
        "--reuse-evidence-artifact-id",
        "durable-reader-summary-postgres-evidence-v1",
        "--reuse-evidence-artifact-sha256",
        "b".repeat(64),
      ]),
    ).toThrow("--reuse-source-report must be provided exactly once");
  });
});
