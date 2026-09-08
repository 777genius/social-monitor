import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const freshFiles = [
  "scripts/check-yesterday-reader-summary-evidence-replay.ts",
  "scripts/check-yesterday-reader-summary-final-replay.ts",
  "scripts/check-reader-summary-production-regeneration-smoke.ts",
  "scripts/check-reader-summary-topic-map-real-data.ts",
];
const paths = [...freshFiles, "scripts/check-autonomous-monitoring-loop-smoke.ts",
  "scripts/lib/live-multi-provider-summary-reader.ts"];
function source(path: string) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}
function constructors(file: ts.SourceFile) {
  const found: ts.NewExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isNewExpression(node) && node.expression.getText(file) === "RankFeedItemsUseCase") found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
}

describe("six check constructor compositions without executing check flows", () => {
  it.each(paths)("forwards the independent reader as the ninth argument: %s", (path) => {
    const file = source(path);
    const found = constructors(file);
    expect(found).toHaveLength(1);
    const node = found[0]!;
    expect(node.arguments).toHaveLength(9);
    const configured = { readCurrent: jest.fn() };
    const reviewer = { review: jest.fn() };
    const interests = {};
    const factory = jest.fn(() => configured);
    const monitoring = jest.fn(() => configured);
    const construct = jest.fn();
    const code = ts.transpileModule(node.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(code, {
      RankFeedItemsUseCase: construct,
      InMemoryUserRelevanceProfileRepository: class {},
      FixedClock: class {}, collectionDate: "2026-09-08",
      feedItems: {}, relevanceProfiles: {}, clock: {},
      localDatabaseUrl: "fixture-local", databaseUrl: "fixture-database",
      interests, MonitoringConfiguredInterestReader: monitoring,
      checkConfiguredInterestReader: factory,
      buildSourceContentQualityReviewer: () => reviewer,
      params: { feedItems: {}, clock: {}, configuredInterests: configured },
    });
    expect(construct).toHaveBeenCalledTimes(1);
    expect(construct.mock.calls[0]![8]).toBe(configured);
    if (freshFiles.includes(path)) {
      expect(factory).toHaveBeenCalledWith(path.includes("regeneration") ? "fixture-database" : "fixture-local");
    } else if (path.includes("autonomous")) {
      expect(monitoring).toHaveBeenCalledWith(interests);
    } else {
      expect(construct.mock.calls[0]![6]).toBe(reviewer);
      expect(construct.mock.calls[0]![7]).toBeUndefined();
    }
  });

  it.each(freshFiles.slice(0, 2))("gates legacy replay before report I/O and labels fresh authority: %s", (path) => {
    const file = source(path);
    const main = file.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === "main")!;
    expect(main.body!.statements[0]!.getText(file)).toBe("requireFreshCheckSelection(process.argv.slice(2));");
    expect(file.text).toContain('selectionAuthority: "current_monitoring_configuration"');
    expect(file.text).toContain('throw new Error("Fresh selection unavailable; stored replay report is not current configuration evidence")');
  });

  it("passes the live reader into the reader workflow while keeping ordinary ranking callers outside scope", () => {
    const live = readFileSync("scripts/check-live-multi-provider-summary-smoke.ts", "utf8");
    expect(live).toContain("const configuredInterests = await liveCheckConfiguredInterests({");
    expect(live).toContain("const readerSummary = await runLiveReaderSummarySmoke({\n    configuredInterests,");
    for (const path of ["scripts/check-reader-summary-source-quality-trace.ts", "scripts/check-personalized-relevance-engine-smoke.ts"]) {
      expect(readFileSync(path, "utf8")).not.toContain("checkConfiguredInterestReader");
    }
  });
});
