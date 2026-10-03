import { assertCaptureReaderSummaryDatasetManifestArguments } from "./capture-reader-summary-day-dataset-manifest";

describe("reader summary dataset manifest capture CLI", () => {
  it("accepts only the bounded date and timestamp policy inputs", () => {
    expect(() => assertCaptureReaderSummaryDatasetManifestArguments([
      "--date",
      "2026-08-18",
      "--recovery-timestamp-policy",
      "published_at",
    ])).not.toThrow();
  });

  it.each([
    ["--date", "2026-08-18", "--out", "/tmp/manifest.json"],
    ["--date", "2026-08-18", "--recovery-root", "/tmp"],
    ["--date", "2026-08-18", "--date", "2026-08-19"],
  ])("rejects unrestricted or duplicate output arguments", (...args) => {
    expect(() => assertCaptureReaderSummaryDatasetManifestArguments(args))
      .toThrow("Only --date");
  });
});

it("admits only the explicit Sep29 published_at first-publication inventory mode", () => {
  expect(() => assertCaptureReaderSummaryDatasetManifestArguments([
    "--date", "2026-09-29", "--first-publication-inventory", "true",
  ])).not.toThrow();
  for (const args of [["--date", "2026-08-18", "--first-publication-inventory", "true"],
    ["--date", "2026-09-29", "--first-publication-inventory", "false"],
    ["--date", "2026-09-29", "--first-publication-inventory", "true", "--recovery-timestamp-policy", "observed_at"]]) {
    expect(() => assertCaptureReaderSummaryDatasetManifestArguments(args)).toThrow("bounded to Sep29");
  }
});
