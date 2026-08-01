import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveProductionDayExecutionRequest } from "./lib/reader-summary-production-day-reuse-provenance";

describe("production-day execution request", () => {
  it("preserves reports and exits on P3009 before runtime admission", () => {
    const fixture = mkdtempSync(join(tmpdir(), "production-day-migrate-"));
    const npmPath = join(fixture, "npm");
    const callsPath = join(fixture, "calls");
    const artifactPath = join(fixture, "artifacts");
    writeFileSync(
      npmPath,
      `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "$PRODUCTION_DAY_NPM_CALLS"\nprintf 'P3009 fixture\\n' >&2\nexit 1\n`,
    );
    chmodSync(npmPath, 0o755);
    const latestReport = join(
      process.cwd(),
      "ops/evals/reader-summary-production-day-run.v1.json",
    );
    const reportBefore = readFileSync(latestReport);
    try {
      const result = spawnSync(
        process.execPath,
        [
          "-r",
          "ts-node/register/transpile-only",
          "-r",
          "tsconfig-paths/register",
          "scripts/run-reader-summary-production-day.ts",
          "--date",
          "2099-12-31",
          "--update",
          "--summary-model",
          "deterministic",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${fixture}:${process.env.PATH ?? ""}`,
            PRODUCTION_DAY_NPM_CALLS: callsPath,
            READER_SUMMARY_PRODUCTION_DAY_ARTIFACT_DIR: artifactPath,
            TS_NODE_COMPILER_OPTIONS: JSON.stringify({
              rootDir: process.cwd(),
            }),
          },
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("P3009 fixture");
      expect(result.stderr).toContain("failed before production-day admission");
      expect(result.stderr).not.toContain("must use subscription runtime");
      expect(readFileSync(callsPath, "utf8")).toBe("run migrate:deploy\n");
      expect(readFileSync(latestReport)).toEqual(reportBefore);
      expect(existsSync(artifactPath)).toBe(false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

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

  it("accepts only a fully hash-bound historical regeneration", () => {
    expect(
      resolveProductionDayExecutionRequest([
        "--regenerate-after-passed-collection",
        "--reuse-source-report",
        "/tmp/source-report.json",
        "--reuse-source-artifact-sha256",
        "a".repeat(64),
        "--reuse-collection-artifact",
        "/tmp/collection.json",
        "--reuse-collection-artifact-sha256",
        "b".repeat(64),
        "--reuse-collection-quality-report",
        "/tmp/collection-quality.json",
        "--reuse-collection-quality-report-sha256",
        "c".repeat(64),
        "--reuse-dataset-manifest",
        "/tmp/dataset-manifest.json",
        "--reuse-dataset-manifest-sha256",
        "d".repeat(64),
      ]),
    ).toEqual({
      mode: "historical-regeneration",
      sourceReportPath: "/tmp/source-report.json",
      sourceReportSha256: "a".repeat(64),
      collectionArtifactPath: "/tmp/collection.json",
      collectionArtifactSha256: "b".repeat(64),
      collectionQualityReportPath: "/tmp/collection-quality.json",
      collectionQualityReportSha256: "c".repeat(64),
      datasetManifestPath: "/tmp/dataset-manifest.json",
      datasetManifestSha256: "d".repeat(64),
      timestampPolicy: "published_at",
      allowHistoricalGitHubOmission: false,
    });
  });

  it("accepts observed_at only inside bounded historical regeneration", () => {
    const request = resolveProductionDayExecutionRequest([
      "--regenerate-after-passed-collection",
      "--recovery-timestamp-policy",
      "observed_at",
      "--reuse-source-report",
      "/tmp/source-report.json",
      "--reuse-source-artifact-sha256",
      "a".repeat(64),
      "--reuse-collection-artifact",
      "/tmp/collection.json",
      "--reuse-collection-artifact-sha256",
      "b".repeat(64),
      "--reuse-collection-quality-report",
      "/tmp/collection-quality.json",
      "--reuse-collection-quality-report-sha256",
      "c".repeat(64),
      "--reuse-dataset-manifest",
      "/tmp/dataset-manifest.json",
      "--reuse-dataset-manifest-sha256",
      "d".repeat(64),
    ]);

    expect(request).toMatchObject({
      mode: "historical-regeneration",
      timestampPolicy: "observed_at",
      allowHistoricalGitHubOmission: false,
    });
    expect(() =>
      resolveProductionDayExecutionRequest([
        "--recovery-timestamp-policy",
        "observed_at",
      ]),
    ).toThrow("Historical regeneration requires its bounded mode");
  });

  it.each([
    [],
    ["--allow-historical-github-omission"],
    ["--skip-live-collection", "--allow-historical-github-omission"],
    ["--allow-historical", "--allow-historical-github-omission"],
  ])("rejects an unbounded regeneration request: %p", (...extraFlags) => {
    expect(() =>
      resolveProductionDayExecutionRequest([
        "--regenerate-after-passed-collection",
        ...extraFlags,
      ]),
    ).toThrow();
  });

  it("rejects GitHub omission on the normal production flow", () => {
    expect(() =>
      resolveProductionDayExecutionRequest([
        "--date",
        "2026-07-19",
        "--allow-historical-github-omission",
      ]),
    ).toThrow(
      "Historical recovery options are restricted to historical regeneration",
    );
  });
});
