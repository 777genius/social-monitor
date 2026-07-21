import { parseReaderSummaryMultiDayQualityCli } from "./reader-summary-multi-day-quality-cli";

const defaults = {
  defaultOutputPath: "ops/evals/report.v3.json",
  defaultGoldPath: "ops/evals/gold.v2.json",
} as const;

describe("reader summary multi-day quality CLI", () => {
  it("requires an explicit v4 trust-root manifest in every blocking mode", () => {
    expect(() => parse([])).toThrow(
      "blocking gate requires a reviewed --target-manifest v4 file",
    );
    expect(() => parse(["--artifact-only"])).toThrow(
      "requires an explicit reviewed --target-manifest v4 file",
    );
    expect(
      parse([
        "--artifact-only",
        "--target-manifest",
        "/tmp/reviewed-target.json",
      ]),
    ).toMatchObject({
      mode: "artifact_only",
      targetManifestPath: "/tmp/reviewed-target.json",
    });
  });
  it("rejects unknown, duplicate and incompatible arguments", () => {
    expect(() => parse(["--unknown"])).toThrow("Unsupported argument");
    expect(() =>
      parse(["--target-manifest", "one", "--target-manifest", "two"]),
    ).toThrow("at most once");
    expect(() => parse(["--artifact-only", "--update"])).toThrow(
      "cannot be combined",
    );
    expect(() =>
      parse(["--legacy-observational", "--gold", "gold.json"]),
    ).toThrow("cannot be combined");
  });

  it("requires an explicit isolated destination for v1 migration diagnostics", () => {
    expect(() =>
      parse(["--migration-diagnostic", "--target-manifest", "target.json"]),
    ).toThrow("requires --update, --gold and --output");
    expect(() =>
      parse([
        "--migration-diagnostic",
        "--update",
        "--target-manifest",
        "target.json",
        "--gold",
        "gold.v1.json",
        "--output",
        defaults.defaultOutputPath,
      ]),
    ).toThrow("cannot write the default v3 report path");

    expect(
      parse([
        "--migration-diagnostic",
        "--update",
        "--target-manifest",
        "target.json",
        "--gold",
        "gold.v1.json",
        "--output",
        "/tmp/migration-report.json",
      ]),
    ).toMatchObject({
      mode: "migration_diagnostic",
      outputPath: "/tmp/migration-report.json",
    });
  });

  it("parses blocking and artifact-only modes explicitly", () => {
    expect(parse(["--target-manifest", "target.json"])).toEqual({
      mode: "blocking",
      update: false,
      outputPath: defaults.defaultOutputPath,
      goldPath: defaults.defaultGoldPath,
      targetManifestPath: "target.json",
    });
    expect(
      parse(["--artifact-only", "--target-manifest", "target.json"]),
    ).toEqual({
      mode: "artifact_only",
      outputPath: defaults.defaultOutputPath,
      goldPath: defaults.defaultGoldPath,
      targetManifestPath: "target.json",
    });
  });
});

function parse(args: readonly string[]) {
  return parseReaderSummaryMultiDayQualityCli({ args, ...defaults });
}
