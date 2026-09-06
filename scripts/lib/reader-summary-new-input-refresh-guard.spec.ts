import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { ReaderSummaryJob } from "@social-monitor/summary/domain";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { refreshPeriod } from "./reader-summary-new-input-refresh-capture";
import { NewInputRefreshGuard } from "./reader-summary-new-input-refresh-guard";
import { guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "@social-monitor/summary/ports";

const makeJob = () => {
  const m = refreshManifest();
  return ReaderSummaryJob.request({ id: "new-job", tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId),
    scope: { type: "workspace" }, period: refreshPeriod(m.date), idempotencyKey: m.operation, requestedAt: refreshNow });
};
describe("new-input refresh consumed authority", () => {
  it("claims once and threads the real cutoff, independently of the later operational clock", async () => {
    const m = refreshManifest();
    const check = jest.fn(async () => undefined);
    const fence = jest.fn();
    const guard = new NewInputRefreshGuard(m, "new-job", { now: () => refreshNow, assertFences: fence, assertCurrent: check });
    expect(await guard.claim(makeJob().toSnapshot())).toEqual(new Date(m.observedThrough));
    await expect(guard.claim(makeJob().toSnapshot())).rejects.toThrow(/consumed/);
    const select = jest.fn(async () => ({ sourceWindow: { ingestionCutoff: new Date(m.observedThrough) } }));
    const selector = guard.selector({ select } as never);
    await selector.select({ observedThrough: new Date(m.observedThrough) } as never);
    expect(select).toHaveBeenCalledWith({ observedThrough: new Date(m.observedThrough) });
    expect(check).toHaveBeenCalledTimes(3);
    expect(fence).toHaveBeenCalledTimes(6);
    await expect(selector.select({ observedThrough: refreshNow } as never)).rejects.toThrow(/cutoff/);
  });
  it.each(["old slot", "engagement", "config", "fence"])("fails closed on %s drift", async (kind) => {
    const guard = new NewInputRefreshGuard(refreshManifest(), "new-job", {
      now: () => refreshNow,
      assertFences: () => { if (kind === "fence") throw new Error(kind); },
      assertCurrent: async () => { throw new Error(kind); },
    });
    await expect(guard.claim(makeJob().toSnapshot())).rejects.toThrow(kind);
  });
  it("cannot reuse started authority after review or execution lease expiry", async () => {
    const job = makeJob().start({ startedAt: refreshNow });
    const guard = new NewInputRefreshGuard(refreshManifest(), "new-job", {
      now: () => new Date("2026-09-06T00:00:00.000Z"), assertFences: () => undefined, assertCurrent: async () => undefined,
    });
    await expect(guard.claim(job.toSnapshot())).rejects.toThrow(/consumed/);
    await expect(guard.claim(makeJob().toSnapshot())).rejects.toThrow(/stale/);
  });
  it("rechecks after selection so a mid-read change cannot reach a model", async () => {
    let drift = false;
    const m = refreshManifest();
    const guard = new NewInputRefreshGuard(m, "new-job", { now: () => refreshNow, assertFences: () => undefined,
      assertCurrent: async () => { if (drift) throw new Error("engagement drift"); } });
    await guard.claim(makeJob().toSnapshot());
    const selector = guard.selector({ select: async () => {
      drift = true;
      return { sourceWindow: { ingestionCutoff: new Date(m.observedThrough) } };
    } } as never);
    await expect(selector.select({ observedThrough: new Date(m.observedThrough) } as never)).rejects.toThrow(/drift/);
  });
});

describe("new-input refresh model admission", () => {
  const command = (): AgentRuntimeTaskCommand => ({
    requestId: "test-summary", correlationId: "test-correlation", tenantId: tenantId(refreshManifest().tenantId),
    workspaceId: workspaceId(refreshManifest().workspaceId), provider: "codex", purpose: "social_monitor.reader_summary.generate.v2",
    prompt: "Synthetic test prompt", systemPrompt: "Synthetic test instruction", outputSchema: {}, timeoutMs: 1000,
    controls: { model: "gpt-5.6-sol", reasoningEffort: "high" }, metadata: { attempt: "primary" },
  });
  it("records consumption before provider start and poisons retries after an ambiguous result", async () => {
    const events: unknown[] = [];
    const runTask = jest.fn(async () => { expect(events).toHaveLength(1); throw new Error("ambiguous transport"); });
    const runtime = guardedRefreshRuntime({ delegate: { runTask, checkHealth: jest.fn() }, manifest: refreshManifest(),
      assertLocal: () => undefined, assertCurrent: async () => undefined, record: (e) => events.push(e) });
    await expect(runtime.runTask(command())).rejects.toThrow(/ambiguous/);
    await expect(runtime.runTask({ ...command(), requestId: "new-path-new-attempt" })).rejects.toThrow(/budget/);
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(events).toEqual([expect.objectContaining({ status: "invocation_consumed" }),
      expect.objectContaining({ status: "requires_reconciliation" })]);
  });
  it.each(["engagement", "config", "slot"])("checks %s at the actual provider boundary", async (kind) => {
    const runTask = jest.fn();
    const runtime = guardedRefreshRuntime({ delegate: { runTask, checkHealth: jest.fn() }, manifest: refreshManifest(),
      assertLocal: () => undefined, assertCurrent: async () => { throw new Error(kind); }, record: jest.fn() });
    await expect(runtime.runTask(command())).rejects.toThrow(/ambiguous/);
    expect(runTask).not.toHaveBeenCalled();
  });
  it("consumes the generation before an awaited authority check, blocking concurrent starts", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const runTask = jest.fn(async () => { throw new Error("ambiguous transport"); });
    const runtime = guardedRefreshRuntime({ delegate: { runTask, checkHealth: jest.fn() },
      manifest: refreshManifest(), assertLocal: () => undefined, assertCurrent: () => pending, record: jest.fn() });
    const first = runtime.runTask(command());
    await expect(runtime.runTask({ ...command(), requestId: "concurrent-other-id" })).rejects.toThrow(/budget/);
    release();
    await expect(first).rejects.toThrow(/ambiguous/);
    expect(runTask).toHaveBeenCalledTimes(1);
  });
  it("persists token/identity evidence and blocks duplicate and repair generation", async () => {
    const m = refreshManifest();
    const events: unknown[] = [];
    const result: AgentRuntimeTaskResult = { status: "completed", warnings: [], structuredOutput: { synthetic: true },
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, estimatedCostUsd: 0 },
      executionAttestation: { schemaVersion: 1, requestId: "test-summary", purpose: "social_monitor.reader_summary.generate.v2",
        canonicalRequestSha256: "a".repeat(64), provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high",
        runtimeEngine: "subscription-runtime-cli", runtimePackageVersion: m.runtime.packageVersion,
        launcherSha256: m.runtime.launcherSha256, selectedOutputKind: "structured_output", selectedOutputSha256: canonicalJsonSha256({ synthetic: true }) } };
    const runTask = jest.fn(async () => result);
    const runtime = guardedRefreshRuntime({ delegate: { runTask, checkHealth: jest.fn() }, manifest: m,
      assertLocal: () => undefined, assertCurrent: async () => undefined, record: (e) => events.push(e) });
    await runtime.runTask(command());
    await expect(runtime.runTask(command())).rejects.toThrow(/budget/);
    await expect(runtime.runTask({ ...command(), requestId: "alternate-summary-id" })).rejects.toThrow(/budget/);
    await expect(runtime.runTask({ ...command(), requestId: "repair", metadata: { attempt: "repair" } })).rejects.toThrow(/budget/);
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(events[2]).toMatchObject({ tokens: result.usage, outputSha256: canonicalJsonSha256({ synthetic: true }) });
  });
});
