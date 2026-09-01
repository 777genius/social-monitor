import { resolve } from "node:path";

import { parseHistoricalPromotionCliOptions } from
  "./run-reader-summary-promotion-v2-historical-rebuild";

describe("historical Reader Promotion V2 CLI", () => {
  it("defaults to dry-run with explicit dates and a batch cap of two", () => {
    expect(parseHistoricalPromotionCliOptions([
      "--dates",
      "2026-08-01,2026-08-02",
      "--artifact-output",
      "artifacts/rebuild",
    ])).toEqual({
      dates: ["2026-08-01", "2026-08-02"],
      batchSize: 2,
      dryRun: true,
      prepare: false,
      resume: false,
      artifactOutput: resolve("artifacts/rebuild"),
      timestampPolicy: "published_at",
    });
  });

  it("parses read-only active-publication preparation explicitly", () => {
    expect(parseHistoricalPromotionCliOptions([
      "--prepare",
      "--dates", "2026-08-01",
      "--timestamp-policy", "observed_at",
      "--artifact-output", "/tmp/prepared",
    ])).toMatchObject({
      prepare: true,
      dryRun: true,
      timestampPolicy: "observed_at",
    });
  });

  it("parses explicit execution, resume, manifest, and batch size", () => {
    expect(parseHistoricalPromotionCliOptions([
      "--dates", "2026-08-01",
      "--batch-size", "1",
      "--resume",
      "--execute",
      "--artifact-output", "/tmp/rebuild",
      "--artifact-manifest", "/tmp/evidence.json",
    ])).toMatchObject({
      dates: ["2026-08-01"],
      batchSize: 1,
      dryRun: false,
      resume: true,
      artifactManifest: "/tmp/evidence.json",
    });
  });

  it.each(["0", "3", "1.5"])("rejects batch size %s", (batchSize) => {
    expect(() => parseHistoricalPromotionCliOptions([
      "--dates", "2026-08-01",
      "--batch-size", batchSize,
      "--artifact-output", "/tmp/rebuild",
    ])).toThrow("--batch-size must be 1 or 2");
  });

  it("rejects ambiguous mutation mode and implicit dates", () => {
    expect(() => parseHistoricalPromotionCliOptions([
      "--dates", "2026-08-01",
      "--dry-run",
      "--execute",
      "--artifact-output", "/tmp/rebuild",
    ])).toThrow("mutually exclusive");
    expect(() => parseHistoricalPromotionCliOptions([
      "--artifact-output", "/tmp/rebuild",
    ])).toThrow("--dates is required");
  });
});
