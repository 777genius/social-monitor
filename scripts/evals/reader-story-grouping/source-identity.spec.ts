import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CAPTURE_SOURCE_REVISION, FIXTURES, fileSha, loadDataset, readJson } from "./dataset";
import { assertSource, verifySourceUnchanged } from "./source-identity";
import type { RequestManifest, CaptureReceipt } from "./requests";
import type { ReportResult } from "./report";

// All commits and intentional production edits below occur only in this disposable local clone.
// The source repository and its Git directory are read-only inputs. No transports are constructed.
const sourceRoot = process.cwd();
const evaluator = "scripts/evals/reader-story-grouping";
const output = ".cache/real-story-grouping-eval";
let sandbox: string;
let root: string;
let baseline: RequestManifest;
let additive: RequestManifest;
let baselineReport: ReportResult;
let fixtureHashes: Record<string, string>;
const evidence: Record<string, unknown> = {};
const git = (...args: string[]): string => execFileSync("git", args, {
  cwd: root, encoding: "utf8", timeout: 60_000,
  env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_OPTIONAL_LOCKS: "0" },
}).trim();
const commit = (message: string): void => {
  git("add", "--all");
  git("-c", "user.name=Disposable eval test", "-c", "user.email=eval@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", message);
};
const script = (name: string, args: string[] = []) => spawnSync(process.execPath,
  ["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register", `${evaluator}/${name}.ts`, ...args], {
    cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=512", TS_NODE_PROJECT: `${evaluator}/tsconfig.json` },
  });
const succeed = (name: string, args: string[] = []): void => {
  const result = script(name, args);
  if (result.status !== 0 || result.error) throw new Error(`${name}: ${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
};
const manifest = (): RequestManifest => readJson(join(root, output, "offline/requests.json"));
const result = (): ReportResult => readJson(join(root, output, "offline/results.json"));
const verifyFixtures = (): void => {
  for (const [path, hash] of Object.entries(fixtureHashes)) expect(fileSha(join(root, path))).toBe(hash);
  expect(loadDataset(join(root, FIXTURES)).labelSealSha256).toBe("40f260a47d8a7cacda53dbb26667d17fbe7424199cf097f690b960eee3fd2bcb");
};

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "rsg-current-source-test-"));
  root = join(sandbox, "repo");
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "clone", "--local", "--shared", "--no-checkout", "--quiet", sourceRoot, root],
    { timeout: 60_000, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  git("-c", "core.hooksPath=/dev/null", "checkout", "--quiet", "HEAD");
  cpSync(join(sourceRoot, evaluator), join(root, evaluator), { recursive: true });
  symlinkSync(resolve(sourceRoot, "node_modules"), join(root, "node_modules"), "dir");
  fixtureHashes = Object.fromEntries(git("ls-files", FIXTURES).split("\n").map((path) => [path, fileSha(join(root, path))]));
  if (git("status", "--porcelain")) commit("test: current evaluator snapshot in disposable clone");
  evidence.snapshot = assertSource(root);
  evidence.snapshotCommitObject = git("cat-file", "commit", "HEAD") + "\n";
}, 60_000);

afterAll(() => {
  if (process.env.RSG_IDENTITY_EVIDENCE_DIR) {
    const dir = resolve(sourceRoot, process.env.RSG_IDENTITY_EVIDENCE_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "identity-test.json"), JSON.stringify(evidence, null, 2) + "\n");
    if (existsSync(join(sandbox, "preview"))) cpSync(join(sandbox, "preview"), join(dir, "preview"), { recursive: true });
  }
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

describe("clean committed source identity through real offline/replay commands", () => {
  it("evaluates the committed evaluator descendant and imports matching non-live responses", () => {
    succeed("regression");
    baseline = manifest(); baselineReport = result();
    expect(baseline.schemaVersion).toBe(2);
    expect(baseline.captureSourceRevision).toBe(CAPTURE_SOURCE_REVISION);
    expect(baseline.evaluatedSource).toEqual(assertSource(root));
    expect(baseline.evaluatedSource.revision).not.toBe(CAPTURE_SOURCE_REVISION);
    expect(baselineReport.totals).toMatchObject({ cases: 50, posts: 49, scored: 46, ambiguous: 4,
      crossProviderPositives: 15, retrievedPositives: 10, deterministicRetrievedPositives: 5,
      fableAnnouncementMisses: 5, missingAuthorityPosts: 42, liveResponses: 0 });
    const imported = readJson<ReportResult>(join(root, output, "captured-regression/results.json"));
    const receipt = readJson<CaptureReceipt>(join(root, output, "captured-regression/receipt.json"));
    expect(imported.mode).toBe("OFFLINE_CAPTURED_REGRESSION");
    expect(imported.liveStatus).toBe("NOT_RUN");
    expect(imported.totals.modelDecisions).toBe(0);
    expect(imported.evaluatedSource).toEqual(baseline.evaluatedSource);
    expect(receipt.evaluatedSource).toEqual(baseline.evaluatedSource);
    expect(receipt.manifestSha256).toBe(imported.manifestSha256);
    expect(imported.ownedFiles).toEqual(baseline.ownedFiles);
    verifyFixtures();
    cpSync(join(root, output, "offline"), join(sandbox, "preview"), { recursive: true });
    cpSync(join(root, output, "captured-regression"), join(sandbox, "preview/captured-regression"), { recursive: true });
    cpSync(join(root, output, "captured-regression/receipt.json"), join(root, output, "old-receipt.json"));
    evidence.baseline = { source: baseline.evaluatedSource, totals: baselineReport.totals, matchingImport: true, liveStatus: imported.liveStatus };
  }, 60_000);

  it("runs after an additive commit and rejects the preceding source's receipt even when commands match", () => {
    writeFileSync(join(root, evaluator, "additive-test-note.md"), "Disposable additive source identity test.\n");
    commit("test: additive descendant");
    const stale = script("run", ["import", `${output}/rejected-additive`, `${output}/old-receipt.json`]);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain("Request/source/fixture manifest mismatch");
    expect(existsSync(join(root, output, "rejected-additive/results.json"))).toBe(false);
    succeed("run", ["offline"]);
    additive = manifest();
    expect(additive.requests).toEqual(baseline.requests);
    expect(additive.evaluatedSource.revision).not.toBe(baseline.evaluatedSource.revision);
    expect(additive.ownedFiles[`${evaluator}/additive-test-note.md`]).toBeDefined();
    const replay = script("run", ["import", `${output}/rejected-fresh-manifest`, `${output}/old-receipt.json`]);
    expect(replay.status).toBe(1); expect(replay.stderr).toContain("Receipt manifest mismatch");
    expect(existsSync(join(root, output, "rejected-fresh-manifest/results.json"))).toBe(false);
    succeed("regression");
    verifyFixtures();
    cpSync(join(root, output, "captured-regression/receipt.json"), join(root, output, "additive-receipt.json"));
    evidence.additive = { source: additive.evaluatedSource, identicalCommands: true, staleManifestRejected: true,
      oldReceiptRejected: true, freshMatchingImport: true };
  }, 60_000);

  it("evaluates an intentional later production-source revision without relabelling", () => {
    const path = join(root, "libs/summary/domain/policies/story-ranking-policy.ts");
    const previous = readFileSync(path, "utf8");
    expect(previous).toContain("maxClusters: 200");
    // Deliberate behavior probe in the disposable Git fixture only, never the working repository.
    writeFileSync(path, previous.replace("maxClusters: 200", "maxClusters: 1"));
    commit("test: intentionally changed production clustering cap in disposable fixture");
    succeed("run", ["offline"]);
    const current = manifest(); const currentReport = result();
    expect(current.evaluatedSource).toEqual(assertSource(root));
    expect(current.evaluatedSource.revision).not.toBe(additive.evaluatedSource.revision);
    expect(current.captureSourceRevision).toBe(baseline.captureSourceRevision);
    expect(current.labelSealSha256).toBe(baseline.labelSealSha256);
    expect(current.replaySha256).toBe(baseline.replaySha256);
    expect(currentReport.clusterCases).not.toEqual(baselineReport.clusterCases);
    const clusters = currentReport.clusterCases as { initial: unknown[] }[];
    expect(clusters.every((c) => c.initial.length <= 1)).toBe(true);
    const stale = script("run", ["import", `${output}/rejected-production`, `${output}/additive-receipt.json`]);
    expect(stale.status).toBe(1); expect(stale.stderr).toContain("Receipt manifest mismatch");
    succeed("regression"); verifyFixtures();
    evidence.productionRevision = { source: current.evaluatedSource, actualClusterOutputChanged: true,
      oldReceiptRejected: true, freshMatchingImport: true, unchangedFixtures: fixtureHashes };
  }, 60_000);

  it.each(["tracked", "staged", "untracked", "ignored_shadow"])("rejects %s source without writing a report", (kind) => {
    const path = kind === "untracked" ? `${evaluator}/uncommitted.ts`
      : kind === "ignored_shadow" ? `${evaluator}/.cache/shadow.js` : `${evaluator}/README.md`;
    const absolute = join(root, path);
    const previous = existsSync(absolute) ? readFileSync(absolute) : undefined;
    mkdirSync(join(absolute, ".."), { recursive: true });
    try {
      writeFileSync(absolute, "Uncommitted source test\n");
      if (kind === "staged") git("add", path);
      const failed = script("run", ["offline", `${output}/rejected-${kind}`]);
      expect(failed.status).toBe(1);
      expect(failed.stderr).toMatch(/clean committed checkout|Ignored source files/);
      expect(existsSync(join(root, output, `rejected-${kind}/results.json`))).toBe(false);
    } finally {
      if (previous) writeFileSync(absolute, previous); else rmSync(absolute);
      if (kind === "staged") git("add", path);
    }
  }, 60_000);

  it("rejects a clean source revision changed during execution", () => {
    const expected = assertSource(root);
    writeFileSync(join(root, evaluator, "during-run-note.md"), "Disposable source change during execution.\n");
    commit("test: source revision changed during execution");
    try {
      process.chdir(root);
      expect(() => verifySourceUnchanged(expected)).toThrow("Evaluated source changed during execution");
      expect(() => verifySourceUnchanged(assertSource())).not.toThrow();
      evidence.duringRunChangeRejected = true;
    } finally { process.chdir(sourceRoot); }
  });

  it("replays in a depth-one checkout without the capture object and rejects stale responses after a revision", () => {
    const previousRoot = root;
    const shallowRoot = join(sandbox, "shallow");
    git("branch", "shallow-baseline", baseline.evaluatedSource.revision);
    // File transport is local only. Unlike --local/--shared, depth=1 copies no older objects.
    git("-c", "protocol.file.allow=always", "clone", "--quiet", "--no-local", "--depth=1",
      "--single-branch", "--branch=shallow-baseline", pathToFileURL(root).href, shallowRoot);
    root = shallowRoot;
    try {
      if (!existsSync(join(root, "node_modules"))) symlinkSync(resolve(sourceRoot, "node_modules"), join(root, "node_modules"), "dir");
      expect(git("rev-parse", "--is-shallow-repository")).toBe("true");
      expect(git("rev-list", "--count", "HEAD")).toBe("1");
      expect(existsSync(join(root, ".git/objects/info/alternates"))).toBe(false);
      const captureObject = spawnSync("git", ["cat-file", "-e", `${CAPTURE_SOURCE_REVISION}^{commit}`],
        { cwd: root, encoding: "utf8", timeout: 60_000 });
      expect(captureObject.error).toBeUndefined();
      expect(captureObject.status).toBe(128);
      expect(captureObject.stderr).toContain("Not a valid object name");
      const source = assertSource(root);
      expect(source).toEqual({ revision: git("rev-parse", "HEAD"), treeSha: git("rev-parse", "HEAD^{tree}"), worktree: "clean" });
      expect(source).toEqual(baseline.evaluatedSource);
      succeed("regression");
      const before = manifest();
      expect(before).toEqual(baseline);
      expect(result().totals).toEqual(baselineReport.totals);
      const imported = readJson<ReportResult>(join(root, output, "captured-regression/results.json"));
      const receipt = readJson<CaptureReceipt>(join(root, output, "captured-regression/receipt.json"));
      expect(imported.mode).toBe("OFFLINE_CAPTURED_REGRESSION");
      expect(imported.liveStatus).toBe("NOT_RUN");
      expect(imported.evaluatedSource).toEqual(source);
      expect(imported.ownedFiles).toEqual(before.ownedFiles);
      expect(receipt.schemaVersion).toBe(2);
      expect(receipt.evaluatedSource).toEqual(source);
      expect(receipt.manifestSha256).toBe(imported.manifestSha256);
      cpSync(join(root, output, "captured-regression/receipt.json"), join(root, output, "shallow-old-receipt.json"));
      writeFileSync(join(root, evaluator, "shallow-revision-note.md"), "Disposable shallow implementation revision.\n");
      commit("test: later shallow implementation revision");
      const staleManifest = script("run", ["import", `${output}/shallow-stale-manifest`, `${output}/shallow-old-receipt.json`]);
      expect(staleManifest.status).toBe(1);
      expect(staleManifest.stderr).toContain("Request/source/fixture manifest mismatch");
      expect(existsSync(join(root, output, "shallow-stale-manifest/results.json"))).toBe(false);
      succeed("run", ["offline"]);
      const after = manifest();
      expect(after.schemaVersion).toBe(2);
      expect(after.evaluatedSource).toEqual(assertSource(root));
      expect(after.evaluatedSource.revision).not.toBe(source.revision);
      expect(after.evaluatedSource.treeSha).not.toBe(source.treeSha);
      expect(after.ownedFiles[`${evaluator}/shallow-revision-note.md`]).toBeDefined();
      expect(after.requests).toEqual(before.requests);
      expect(after.captureSourceRevision).toBe(CAPTURE_SOURCE_REVISION);
      expect(after.labelSealSha256).toBe(before.labelSealSha256);
      expect(after.replaySha256).toBe(before.replaySha256);
      const staleReceipt = script("run", ["import", `${output}/shallow-stale-receipt`, `${output}/shallow-old-receipt.json`]);
      expect(staleReceipt.status).toBe(1);
      expect(staleReceipt.stderr).toContain("Receipt manifest mismatch");
      expect(existsSync(join(root, output, "shallow-stale-receipt/results.json"))).toBe(false);
      succeed("regression");
      expect(readJson<ReportResult>(join(root, output, "captured-regression/results.json")).evaluatedSource).toEqual(after.evaluatedSource);
      expect(result().totals).toEqual(baselineReport.totals);
      verifyFixtures();
      evidence.shallow = { before: source, after: after.evaluatedSource, captureObjectAbsent: true,
        shallow: true, initialCommitCount: 1, identicalCommands: true, staleManifestRejected: true,
        staleReceiptRejected: true, freshMatchingImport: true, totals: result().totals, liveStatus: imported.liveStatus };
    } finally { root = previousRoot; }
  }, 60_000);
});
