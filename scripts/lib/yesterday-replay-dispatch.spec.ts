import * as fs from "node:fs";
import type * as pg from "pg";
import type * as configuredInterestModule from "./check-configured-interest-reader";
import type * as replaySupport from "./yesterday-social-replay-support";

import { PrismaFeedConnection } from "../../libs/feed/adapters/persistence/prisma/prisma-feed-connection";
import { RankFeedItemsUseCase } from "../../libs/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { DeterministicReaderSummaryModelAdapter } from "../../libs/summary/adapters/model/deterministic-reader-summary-model.adapter";
import { checkConfiguredInterestReader } from "./check-configured-interest-reader";
import { readDominantFeedScope, yesterdaySocialQualityDatabaseUrl } from "./yesterday-social-replay-support";
import { Pool } from "pg";

jest.mock("node:fs", () => {
  const actual = jest.requireActual<typeof fs>("node:fs");
  return { ...actual, existsSync: jest.fn(actual.existsSync),
    readFileSync: jest.fn(actual.readFileSync), mkdirSync: jest.fn(), writeFileSync: jest.fn() };
});
jest.mock("pg", () => ({ ...jest.requireActual<typeof pg>("pg"), Pool: jest.fn(() => { throw new Error("Unexpected database acquisition"); }) }));
jest.mock("../../libs/feed/adapters/persistence/prisma/prisma-feed-connection", () => ({
  PrismaFeedConnection: { create: jest.fn(() => { throw new Error("Unexpected feed acquisition"); }) },
}));
jest.mock("../../libs/relevance/features/rank-feed-items/rank-feed-items.use-case", () => ({
  RankFeedItemsUseCase: jest.fn(() => { throw new Error("Unexpected ranking"); }),
}));
jest.mock("../../libs/summary/adapters/model/deterministic-reader-summary-model.adapter", () => ({
  DeterministicReaderSummaryModelAdapter: jest.fn(() => { throw new Error("Unexpected model"); }),
}));
jest.mock("./check-configured-interest-reader", () => ({
  ...jest.requireActual<typeof configuredInterestModule>("./check-configured-interest-reader"),
  checkConfiguredInterestReader: jest.fn(() => { throw new Error("Unexpected Monitoring acquisition"); }),
}));
jest.mock("./yesterday-social-replay-support", () => ({
  ...jest.requireActual<typeof replaySupport>("./yesterday-social-replay-support"),
  readDominantFeedScope: jest.fn(async () => undefined),
  yesterdaySocialQualityDatabaseUrl: jest.fn(() => "fixture-database"),
}));

const actualFs = jest.requireActual<typeof fs>("node:fs");
const originalArgv = process.argv;
type StoredReport = {
  schemaVersion: number;
  artifactFormat: string;
  blockingPassed: boolean;
  qualityGates: Record<string, boolean>;
  replay: {
    topReadCount: number;
    primaryProviderCounts: Record<string, number>;
    primarySourceMixCounts: Record<string, number>;
    primaryTopReadCounts: Record<string, number>;
  };
  testFragment?: string;
};

describe.each(["evidence", "final"])("%s replay command dispatch", (kind) => {
  const script = `../check-yesterday-reader-summary-${kind}-replay`;
  const artifactPath = `ops/evals/yesterday-reader-summary-${kind}-replay.v1.json`;
  const freshPath = artifactPath.replace(".v1.json", ".fresh.v1.json");
  let report: StoredReport;
  let log: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    report = JSON.parse(actualFs.readFileSync(artifactPath, "utf8")) as StoredReport;
    jest.mocked(fs.existsSync).mockImplementation((path) =>
      path === artifactPath || path === freshPath ? true : actualFs.existsSync(path));
    jest.mocked(fs.readFileSync).mockImplementation((...args) => {
      if (args[0] === artifactPath || args[0] === freshPath) return JSON.stringify(report);
      return actualFs.readFileSync(...args);
    });
    log = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.argv = originalArgv;
    log.mockRestore();
    expect(Pool).not.toHaveBeenCalled();
    expect(PrismaFeedConnection.create).not.toHaveBeenCalled();
    expect(checkConfiguredInterestReader).not.toHaveBeenCalled();
    expect(RankFeedItemsUseCase).not.toHaveBeenCalled();
    expect(DeterministicReaderSummaryModelAdapter).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  async function run(argv: string[]): Promise<void> {
    process.argv = ["node", script, ...argv];
    let completion: Promise<void> | undefined;
    await jest.isolateModulesAsync(async () => {
      // Execute the actual entrypoint, including top-level initialization and
      // real stored-report/secret predicates; only external boundaries are fake.
      completion = (await import(script) as { replayCheck: Promise<void> }).replayCheck;
    });
    return completion!;
  }
  function expectOffline(): void {
    expect(readDominantFeedScope).not.toHaveBeenCalled();
    expect(yesterdaySocialQualityDatabaseUrl).not.toHaveBeenCalled();
  }

  it("validates the original immutable artifact through its npm registration", async () => {
    const pkg = JSON.parse(actualFs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    const command = pkg.scripts[`check:yesterday-reader-summary-${kind}-replay`]!;
    expect(command).toContain(`scripts/check-yesterday-reader-summary-${kind}-replay.ts --artifact-only`);
    await expect(run(command.split(".ts ")[1]!.split(" "))).resolves.toBeUndefined();
    expectOffline();
    expect(fs.readFileSync).toHaveBeenCalledWith(artifactPath, "utf8");
    expect(fs.readFileSync).not.toHaveBeenCalledWith(freshPath, "utf8");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("stored artifact validation OK (artifact-only; no current configuration evidence)"));
  });

  it.each([
    ["schema", (r: StoredReport) => { r.schemaVersion = 2; }],
    ["format", (r: StoredReport) => { r.artifactFormat = "invalid"; }],
    ["blocking gates", (r: StoredReport) => { r.blockingPassed = false; }],
    ["quality gate", (r: StoredReport) => { r.qualityGates.noRawSecretFragments = false; }],
    ["secret fragment", (r: StoredReport) => { r.testFragment = "access_token"; }],
    ["provider coverage", (r: StoredReport) => {
      if (kind === "evidence") r.replay.primaryProviderCounts.reddit = 0;
      else r.replay.primarySourceMixCounts.reddit = 0;
    }],
  ] as const)("rejects invalid %s without acquisition", async (_name, mutate) => {
    mutate(report);
    await expect(run(["--artifact-only"])).rejects.toThrow("failed existing artifact validation");
    expectOffline();
    expect(log).not.toHaveBeenCalled();
  });

  if (kind === "final") {
    it.each(["topReadCount", "primaryTopReadCounts"] as const)("preserves final %s quality checks", async (field) => {
      if (field === "topReadCount") report.replay.topReadCount = 7;
      else report.replay.primaryTopReadCounts["x-twitter"] = 0;
      await expect(run(["--artifact-only"])).rejects.toThrow("failed existing artifact validation");
      expectOffline();
    });
  }

  it("fails for a missing original artifact even when a fresh artifact exists", async () => {
    jest.mocked(fs.existsSync).mockImplementation((path) => path === freshPath);
    await expect(run(["--artifact-only"])).rejects.toThrow(`${artifactPath} is missing`);
    expectOffline();
  });
  it("fails for malformed JSON", async () => {
    jest.mocked(fs.readFileSync).mockImplementation((...args) =>
      args[0] === artifactPath ? "{" : actualFs.readFileSync(...args));
    await expect(run(["--artifact-only"])).rejects.toThrow();
    expectOffline();
  });
  it.each([
    [], ["--update"], ["--immutable-replay"],
    ["--artifact-only", "--update"], ["--artifact-only", "--fresh-selection"],
    ["--artifact-only", "--fresh-selection", "--update"],
    ["--artifact-only", "--allow-dirty-collection"],
  ])("rejects unsupported/incompatible arguments %j before I/O", async (...argv) => {
    await expect(run(argv)).rejects.toThrow();
    expectOffline();
    expect(fs.readFileSync).not.toHaveBeenCalledWith(artifactPath, "utf8");
    expect(fs.readFileSync).not.toHaveBeenCalledWith(freshPath, "utf8");
  });
  it.each([["--fresh-selection"], ["--fresh-selection", "--update"]])(
    "keeps fresh acquisition explicit and unavailable selection fail-closed: %j", async (...argv) => {
      await expect(run(argv)).rejects.toThrow(argv.includes("--update")
        ? "cannot update" : "stored replay report is not current configuration evidence");
      expect(readDominantFeedScope).toHaveBeenCalledTimes(1);
      expect(yesterdaySocialQualityDatabaseUrl).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync).not.toHaveBeenCalledWith(artifactPath, "utf8");
      expect(log).not.toHaveBeenCalled();
    });
});
