import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { loadDataset } from "./dataset";
import { evaluationRun, runArguments, claimLiveRun, runRoot } from "./run-identity";
import { prepareBlock } from "./replay";
import { captureRequest, makeManifest, verifyManifest, type RequestEnvelope } from "./requests";
import { runLiveWithTrustedClient } from "./live";
import { assertSource, verifySourceUnchanged } from "./source-identity";

jest.mock("./source-identity", () => ({ assertSource: jest.fn(), verifySourceUnchanged: jest.fn() }));
const source = { revision: "b".repeat(40), treeSha: "c".repeat(40), worktree: "clean" as const };

it("partitions native request and correlation identity, preserving semantic inputs and original clocks", async () => {
  const data = loadDataset();
  const a = evaluationRun("review-a", source)!; const b = evaluationRun("review-b", source)!;
  expect(evaluationRun(a.id, source)).toEqual(a);
  expect(evaluationRun(a.id, { ...source, revision: "d".repeat(40) })).not.toEqual(a);
  const aa: RequestEnvelope[] = []; const bb: RequestEnvelope[] = [];
  for (const block of data.blocks) {
    const original = await prepareBlock(data, block);
    const first = await prepareBlock(data, block, a); const second = await prepareBlock(data, block, b);
    expect(first.evidence).toEqual(original.evidence); expect(second.evidence).toEqual(original.evidence);
    expect(first.cutoff).toEqual(original.cutoff); expect(second.cutoff).toEqual(original.cutoff);
    expect(first.verifierInput.requestedAt.toISOString()).toBe("2026-09-05T19:52:42.828Z");
    const x = await captureRequest(first); const y = await captureRequest(second);
    expect(await captureRequest(await prepareBlock(data, block, a))).toEqual(x);
    if (!x || !y) { expect(x).toEqual(y); continue; }
    const { requestId: xid, correlationId: xc, ...xs } = x.command;
    const { requestId: yid, correlationId: yc, ...ys } = y.command;
    expect(xid.endsWith(first.cutoff.toISOString())).toBe(true);
    expect(xc.endsWith(first.cutoff.toISOString())).toBe(true);
    expect(xid.length).toBeLessThanOrEqual(240); expect(xc.length).toBeLessThanOrEqual(240);
    expect(xid).not.toBe(yid); expect(xc).not.toBe(yc); expect(xs).toEqual(ys);
    expect(x.evidenceSha256).toBe(y.evidenceSha256);
    expect(x.canonicalRequestSha256).not.toBe(y.canonicalRequestSha256);
    expect(x.command.tenantId).toBe("00000000-0000-4000-8000-00000000e001");
    expect(x.command.workspaceId).toBe("00000000-0000-4000-8000-00000000e002");
    aa.push(x); bb.push(y);
  }
  expect(() => verifyManifest(data, makeManifest(data, aa, source, a), makeManifest(data, bb, source, b)))
    .toThrow("Request/source/fixture manifest mismatch");
});

it("rejects ambiguous run labels/options", () => {
  for (const id of ["", "../a", "A", "x".repeat(65), "a:b"]) expect(() => evaluationRun(id, source)).toThrow();
  expect(() => runArguments(["--run-id", "a", "--run-id", "b"])).toThrow();
  expect(() => runArguments(["--run-id"])).toThrow();
  expect(runArguments(["offline", "--run-id", "a"])).toEqual({ positional: ["offline"], id: "a" });
});

it("claims a run once across output paths and preserves its failed receipt/marker", () => {
  const previous = process.cwd(); const dir = mkdtempSync(join(tmpdir(), "rsg-test-claim-"));
  try {
    process.chdir(dir); const run = evaluationRun("failed", source)!;
    claimLiveRun(run, "a".repeat(64), "first");
    const marker = readFileSync(join(runRoot(run), "live-started.json"), "utf8");
    expect(() => claimLiveRun(run, "a".repeat(64), "second")).toThrow();
    expect(readFileSync(join(runRoot(run), "live-started.json"), "utf8")).toBe(marker);
    expect(() => claimLiveRun(evaluationRun("new", source)!, "b".repeat(64), "second")).not.toThrow();
  } finally { process.chdir(previous); rmSync(dir, { recursive: true, force: true }); }
});

it("rejects implicit live identity before any client call", async () => {
  jest.mocked(assertSource).mockReturnValue(source);
  const client = { runTask: jest.fn(), checkHealth: jest.fn() };
  await expect(runLiveWithTrustedClient("missing", "unused", { client, operatorRecord: "TEST", close: jest.fn() }))
    .rejects.toThrow("explicit --run-id");
  expect(client.runTask).not.toHaveBeenCalled(); expect(client.checkHealth).not.toHaveBeenCalled();
});

it("does not retry or resume a failed task even with another output directory", async () => {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const data = loadDataset(); const run = evaluationRun("failure-test", source)!;
  const requests = [];
  for (const block of data.blocks) {
    const envelope = await captureRequest(await prepareBlock(data, block, run));
    if (envelope) requests.push(envelope);
  }
  const manifest = makeManifest(data, requests, source, run);
  const previous = process.cwd(); const dir = mkdtempSync(join(tmpdir(), "rsg-test-live-no-transport-"));
  // All clients below are local mocks, never a runtime or provider composition.
  const client = { checkHealth: jest.fn().mockResolvedValue({ status: "serving", runtimeEngine: "subscription-runtime-cli",
    launcherSha256: "a".repeat(64), runtimeVersion: "0.0.0-fixture" }),
    runTask: jest.fn().mockRejectedValue(new Error("fixture exhausted attempts")) };
  jest.mocked(assertSource).mockReturnValue(source); jest.mocked(verifySourceUnchanged).mockReturnValue(undefined);
  // Keep cwd at the source for fixture/owned-file reads; only isolate the claim namespace temporarily.
  const claimPath = runRoot(run);
  try {
    mkdirSync(dir, { recursive: true }); const path = join(dir, "manifest.json");
    writeFileSync(path, JSON.stringify(manifest));
    const trusted = { client, operatorRecord: "TEST mock", close: jest.fn() };
    await expect(runLiveWithTrustedClient(path, join(dir, "wrong"), trusted, "wrong-run"))
      .rejects.toThrow("Request/source/fixture manifest mismatch");
    expect(client.checkHealth).not.toHaveBeenCalled(); expect(client.runTask).not.toHaveBeenCalled();
    await expect(runLiveWithTrustedClient(path, join(dir, "one"), trusted, run.id)).rejects.toThrow("fixture exhausted attempts");
    await expect(runLiveWithTrustedClient(path, join(dir, "two"), trusted, run.id)).rejects.toThrow();
    expect(client.runTask).toHaveBeenCalledTimes(1); expect(client.checkHealth).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(join(claimPath, "live-started.json"), "utf8")).manifestSha256)
      .toBe(canonicalJsonSha256(manifest));
  } finally { process.chdir(previous); rmSync(dir, { recursive: true, force: true }); rmSync(claimPath, { recursive: true, force: true }); }
});
