import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveProductionDayExecutionRequest } from "./lib/reader-summary-production-day-reuse-provenance";

describe("production-day execution request", () => {
  it("binds production history readiness to its exact-day artifact", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/run-reader-summary-production-day.ts"),
      "utf8",
    );
    expect(source).toContain(
      "READER_SUMMARY_PRODUCTION_HISTORY_COLLECTION_DIR",
    );
    expect(source).toContain("productionHistoryCollection(");
    expect(source).toContain("historicalCollection?.arguments ?? []");
    expect(source).toContain("historicalCollection?.path ??");
    expect(source).toContain(
      "Production history collection scope is not 6101/6102",
    );
  });
  it("leaves migrations exclusively in the release pipeline", () => {
    const runner = readFileSync(
      join(process.cwd(), "scripts/run-reader-summary-production-day.ts"),
      "utf8",
    );
    const deploy = readFileSync(
      join(process.cwd(), "ops/deploy/reader-summary-publication-deploy-lib.sh"),
      "utf8",
    );

    expect(runner).not.toContain("migrate:deploy");
    expect(deploy).toContain("npm run migrate:deploy");
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

  it("passes the complete regeneration authority to durable capture", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/run-reader-summary-production-day.ts"),
      "utf8",
    );

    expect(source).toContain(
      "DURABLE_READER_SUMMARY_SOURCE_REPORT_SHA256:\n                  executionRequest.sourceReportSha256",
    );
    expect(source).toContain(
      "DURABLE_READER_SUMMARY_COLLECTION_ARTIFACT_SHA256:\n                  executionRequest.collectionArtifactSha256",
    );
    expect(source).toContain(
      "DURABLE_READER_SUMMARY_COLLECTION_QUALITY_REPORT_SHA256:\n                  executionRequest.collectionQualityReportSha256",
    );
    expect(source).toContain(
      "DURABLE_READER_SUMMARY_DATASET_MANIFEST_SHA256:\n                  executionRequest.datasetManifestSha256",
    );
  });

  it("requires the complete regeneration authority when capture builds identity", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "scripts/capture-durable-reader-summary-from-postgres.ts",
      ),
      "utf8",
    );

    expect(source).toContain(
      "sourceReportSha256: requiredEnv(sourceReportSha256Env)",
    );
    expect(source).toContain(
      "collectionArtifactSha256: requiredEnv(collectionArtifactSha256Env)",
    );
    expect(source).toMatch(
      /collectionQualityReportSha256:\s*requiredEnv\(\s*collectionQualityReportSha256Env,?\s*\)/u,
    );
    expect(source).toContain(
      "datasetManifestSha256: requiredEnv(datasetManifestSha256Env)",
    );
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
