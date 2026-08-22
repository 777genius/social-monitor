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
