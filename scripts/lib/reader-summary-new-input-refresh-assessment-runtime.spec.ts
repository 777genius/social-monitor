import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "@social-monitor/summary/ports";
import { guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { sourceContentAssessmentPurpose as purpose } from "./reader-summary-new-input-refresh-assessment-runtime";
import { refreshModelCommand, completedRefreshModelRequest } from "./reader-summary-new-input-refresh-model.spec-support";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";

const command = (index = 0, count = 1, padding = 0): AgentRuntimeTaskCommand => ({
  ...refreshModelCommand(purpose), requestId: `assessment-${index}`, metadata: {},
  prompt: JSON.stringify({ candidates: Array.from({ length: count }, (_, i) => ({
    candidateId: `candidate-${index + i}`, text: "x".repeat(padding),
  })) }),
  controls: { model: "gpt-5.6-sol", reasoningEffort: "low", interactive: false,
    outputSchemaName: "social_monitor_source_content_quality_review", schemaVersion: "source_content_assessment.v1" },
});
function wiring(mutate?: (result: AgentRuntimeTaskResult) => AgentRuntimeTaskResult) {
  let now = 0;
  const events: unknown[] = [];
  const runTask = jest.fn(async (request: AgentRuntimeTaskCommand) => {
    const result = await completedRefreshModelRequest(request, { reviews: [] });
    return mutate?.(result) ?? result;
  });
  const runtime = guardedRefreshRuntime({ delegate: { runTask, checkHealth: jest.fn() }, manifest: refreshManifest(),
    now: () => now, assertLocal: () => undefined, assertCurrent: async () => undefined,
    record: (event) => events.push(event) });
  return { runtime, runTask, events, advance: (ms: number) => { now += ms; } };
}

describe("refresh operation assessment runtime budgets and receipts", () => {
  it("consumes exactly 200 candidates then blocks another batch without refunding", async () => {
    const test = wiring();
    for (let i = 0; i < 200; i += 8) await test.runtime.runTask(command(i, 8));
    await expect(test.runtime.runTask(command(200))).rejects.toThrow(/consumed/u);
    await expect(test.runtime.runTask(command(201, 4))).rejects.toThrow(/budget/u);
    expect(test.runTask).toHaveBeenCalledTimes(25);
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
    expect(test.events).toContainEqual(expect.objectContaining({ status: "invocation_consumed",
      assessmentAttempts: 25, assessmentCandidates: 200 }));
  });
  it("exhausts actual wire bytes independently of candidate count", async () => {
    const test = wiring();
    for (let i = 0; i < 8; i++) await test.runtime.runTask(command(i, 1, 63_900));
    await expect(test.runtime.runTask(command(8, 1, 63_900))).rejects.toThrow(/consumed/u);
    expect(test.runTask).toHaveBeenCalledTimes(8);
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
  });
  it("does not admit a new request id for an already consumed candidate", async () => {
    const test = wiring();
    await test.runtime.runTask(command());
    await expect(test.runtime.runTask({ ...command(), requestId: "second-id" })).rejects.toThrow(/consumed/u);
    expect(test.runTask).toHaveBeenCalledTimes(1);
  });
  it("never resets the elapsed operation budget for a new batch", async () => {
    const test = wiring();
    await test.runtime.runTask(command());
    test.advance(600_000);
    await expect(test.runtime.runTask(command(1))).rejects.toThrow(/consumed/u);
    expect(test.runTask).toHaveBeenCalledTimes(1);
  });
  it.each(["failed", "missing receipt", "wrong request", "wrong canonical digest", "wrong installation", "wrong output", "forged usage"])(
    "quarantines %s and prevents further invocation", async (kind) => {
      const test = wiring((result): AgentRuntimeTaskResult => {
        switch (kind) {
          case "failed": return { ...result, status: "failed" };
          case "missing receipt": return { ...result, executionAttestation: undefined };
          case "wrong request": return { ...result, executionAttestation: { ...result.executionAttestation!, requestId: "other" } };
          case "wrong canonical digest": return { ...result, executionAttestation: { ...result.executionAttestation!, canonicalRequestSha256: "a".repeat(64) } };
          case "wrong installation": return { ...result, executionAttestation: { ...result.executionAttestation!, launcherSha256: "b".repeat(64) } };
          case "wrong output": return { ...result, structuredOutput: { reviews: ["tampered"] } };
          default: return { ...result, usage: { inputTokens: 3, outputTokens: 2, totalTokens: 0, estimatedCostUsd: 0 } };
        }
      });
      await expect(test.runtime.runTask(command())).rejects.toThrow(/consumed/u);
      await expect(test.runtime.runTask(command(1))).rejects.toThrow(/budget/u);
      expect(test.runTask).toHaveBeenCalledTimes(1);
      expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
    },
  );
  it("rejects a late completion without returning its evidence", async () => {
    const test = wiring((result) => { test.advance(1000); return result; });
    await expect(test.runtime.runTask(command())).rejects.toThrow(/consumed/u);
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
  });
  it("rejects cancelled input before delegate spend", async () => {
    const test = wiring();
    await expect(test.runtime.runTask(command(), { signal: AbortSignal.abort() })).rejects.toThrow(/consumed/u);
    expect(test.runTask).not.toHaveBeenCalled();
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
  });
});
