import {
  historicalCleanDayCollectionPath,
  historicalPromotionQualityOutput,
} from
  "./reader-summary-promotion-v2-quality-output";

describe("historical Promotion V2 date quality output", () => {
  it("isolates every update artifact by production date", () => {
    const first = historicalPromotionQualityOutput({
      enabled: true,
      reportDirectory: "/artifacts/2026-08-01/production-day",
    });
    const second = historicalPromotionQualityOutput({
      enabled: true,
      reportDirectory: "/artifacts/2026-08-02/production-day",
    });
    expect(first.args("quality.json")).toEqual([
      "--output-path",
      "/artifacts/2026-08-01/production-day/quality-artifacts/quality.json",
    ]);
    expect(second.path("quality.json")).not.toBe(first.path("quality.json"));
    expect(first.cleanDayArgs).toContain(
      "/artifacts/2026-08-01/production-day/quality-artifacts/yesterday-social-collection-quality-report.v1.json",
    );
  });

  it("keeps ordinary production quality artifacts on canonical defaults", () => {
    const output = historicalPromotionQualityOutput({
      enabled: false,
      reportDirectory: "/ignored",
    });
    expect(output.args("quality.json")).toEqual([]);
    expect(output.cleanDayArgs).toEqual([]);
  });

  it("binds historical maintenance to its immutable dated collection", () => {
    const output = historicalPromotionQualityOutput({
      enabled: false,
      reportDirectory: "/ignored",
      cleanDayCollectionPath:
        "/production-history/reader-summary-clean-real-day-collection.2026-09-09.v1.json",
    });
    expect(output.cleanDayArgs).toEqual([
      "--collection-path",
      "/production-history/reader-summary-clean-real-day-collection.2026-09-09.v1.json",
    ]);
  });

  it("prefers preserved regeneration evidence over the history default", () => {
    expect(historicalCleanDayCollectionPath({
      mode: "historical-regeneration",
      sourceEvidence: {
        kind: "preserved-production-day-report",
        sourceReportPath: "/history/report.json",
        sourceReportSha256: "a".repeat(64),
        collectionArtifactPath: "/preserved/collection.json",
        collectionArtifactSha256: "b".repeat(64),
        collectionQualityReportPath: "/history/quality.json",
        collectionQualityReportSha256: "c".repeat(64),
      },
      datasetManifestPath: "/history/manifest.json",
      datasetManifestSha256: "d".repeat(64),
      timestampPolicy: "published_at",
      allowHistoricalGitHubOmission: false,
    }, "/history/default-collection.json")).toBe(
      "/preserved/collection.json",
    );
  });

  it("keeps the history default for active publication authority", () => {
    expect(historicalCleanDayCollectionPath({
      mode: "historical-regeneration",
      sourceEvidence: { kind: "active-database-publication" },
      datasetManifestPath: "/history/manifest.json",
      datasetManifestSha256: "d".repeat(64),
      timestampPolicy: "published_at",
      allowHistoricalGitHubOmission: false,
    }, "/history/default-collection.json")).toBe(
      "/history/default-collection.json",
    );
  });

  it("finds an exact rolling collection for active publication recovery", () => {
    const directory = mkdtempSync(join(tmpdir(), "ranking-collection-"));
    const rollingRoot = join(directory, "rolling");
    const collectionDirectory = join(rollingRoot, "collections");
    const collectionPath = join(
      collectionDirectory,
      "reader-summary-clean-real-day-collection.2026-09-09.v1.json",
    );
    mkdirSync(collectionDirectory, { recursive: true });
    writeFileSync(collectionPath, "{}\n");
    try {
      expect(historicalCleanDayCollectionPath({
        mode: "historical-regeneration",
        sourceEvidence: { kind: "active-database-publication" },
        datasetManifestPath: "/history/manifest.json",
        datasetManifestSha256: "d".repeat(64),
        timestampPolicy: "published_at",
        allowHistoricalGitHubOmission: false,
      }, undefined, {
        collectionDate: "2026-09-09",
        rollingArtifactRoot: rollingRoot,
      })).toBe(collectionPath);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
