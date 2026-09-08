import { SystemClock } from "@social-monitor/shared-kernel";
import { AgentRuntimeSourceContentQualityReviewerAdapter } from "@social-monitor/relevance/adapters/model/agent-runtime-source-content-quality-reviewer.adapter";
import { fixture, cutoff, run } from "../../test/support/promotion-content-assessment";
import { attestRefreshExecution, refreshTestRuntimeClient } from "./reader-summary-new-input-refresh-model.spec-support";
import { outputFor } from "./source-content-assessment-runtime.spec-support";
import type { AgentRuntimeExecutionResult } from "../../apps/agent-runtime/src/agent-runtime-executor.port";

const failed = { code: "synthetic", safeMessage: "Synthetic failure", retryable: false,
  reconnectRequired: false, causeCategory: "synthetic", details: {} };

describe("assessment terminal receipts and execution lease accounting", () => {
  it.each(["failed", "waiting_for_input", "missing-receipt", "failed-receipt", "wrong-output", "wrong-model"])(
    "rejects %s even with valid bound review JSON", async (mutation) => {
      const client = refreshTestRuntimeClient(async (request): Promise<AgentRuntimeExecutionResult> => {
        const result = await attestRefreshExecution(request, outputFor(request));
        if (mutation === "failed" || mutation === "waiting_for_input") return { ...result, status: mutation,
          executionAttestation: undefined };
        if (mutation === "missing-receipt") return { ...result, executionAttestation: undefined };
        if (mutation === "failed-receipt") return { ...result, failure: failed };
        return { ...result, executionAttestation: { ...result.executionAttestation!,
          ...(mutation === "wrong-output" ? { selectedOutputSha256: "f".repeat(64) } : { model: "wrong" }) } };
      });
      const reviewer = new AgentRuntimeSourceContentQualityReviewerAdapter({ client, clock: new SystemClock(),
        ids: { generate: () => "synthetic-terminal" }, batchTimeoutMs: 300_000, totalTimeoutMs: 600_000 });
      const result = await run([fixture("receipt")], reviewer, { clock: new SystemClock() });
      expect(result.ranking.orderedCandidateIds).toEqual([]);
      expect(result.candidates[0]!.evidenceQualityScore).toBe(0);
    });

  it.each(["queued", "running"])("quarantines cancelled %s work across operations until terminal execution", async (phase) => {
    jest.useFakeTimers();
    jest.setSystemTime(cutoff);
    try {
      let settle!: () => void;
      let calls = 0;
      const client = refreshTestRuntimeClient(async (request) => {
        calls++;
        if (calls === 1) {
          if (phase === "running") await new Promise((resolve) => setTimeout(resolve, 5_000));
          await new Promise<void>((resolve) => { settle = resolve; });
        }
        return attestRefreshExecution(request, outputFor(request));
      });
      let id = 0;
      const reviewer = () => new AgentRuntimeSourceContentQualityReviewerAdapter({ client, clock: new SystemClock(),
        ids: { generate: () => `lease-${++id}` }, batchTimeoutMs: 300_000, totalTimeoutMs: 600_000 });
      const controller = new AbortController();
      const first = run([fixture("first")], reviewer(), { clock: new SystemClock(),
        execution: { deadlineAtMs: cutoff.getTime() + 600_000, signal: controller.signal } });
      await jest.advanceTimersByTimeAsync(10_000);
      controller.abort();
      const result = await first;
      expect(result.ranking.orderedCandidateIds).toEqual([]);
      const second = await run([fixture("second")], reviewer(), { clock: new SystemClock() });
      expect(second.ranking.orderedCandidateIds).toEqual([]);
      expect(calls).toBe(1);
      settle();
      await jest.advanceTimersByTimeAsync(1);
      expect(result.candidates[0]!.evidenceQualityScore).toBe(0);
      expect((await run([fixture("third")], reviewer(), { clock: new SystemClock() })).ranking.orderedCandidateIds).toEqual(["third"]);
      expect(calls).toBe(2);
    } finally { jest.useRealTimers(); }
  });

  it("charges acquisition, execution and partial exhaustion to the caller absolute deadline", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(cutoff);
    try {
      const timeouts: number[] = [];
      const client = refreshTestRuntimeClient(async (request) => {
        timeouts.push(request.timeoutMs);
        await new Promise((resolve) => setTimeout(resolve, 30_000)); // queued acquisition
        await new Promise((resolve) => setTimeout(resolve, 40_000)); // model execution
        return attestRefreshExecution(request, outputFor(request));
      });
      const reviewer = new AgentRuntimeSourceContentQualityReviewerAdapter({ client, clock: new SystemClock(),
        ids: { generate: () => `budget-${timeouts.length}` }, batchTimeoutMs: 300_000, totalTimeoutMs: 600_000 });
      const pending = run(Array.from({ length: 24 }, (_, i) => fixture(`budget-${i}`)), reviewer,
        { clock: new SystemClock(), execution: { deadlineAtMs: cutoff.getTime() + 100_000 } });
      await jest.advanceTimersByTimeAsync(100_001);
      const result = await pending;
      expect(timeouts).toEqual([100_000, 30_000]);
      expect(result.ranking.orderedCandidateIds).toHaveLength(8);
      expect(result.candidates.filter((item) => item.evidenceQualityScore === 0)).toHaveLength(16);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(result.ranking.orderedCandidateIds).toHaveLength(8);
    } finally { jest.useRealTimers(); }
  });
  it.each([[20_000, 200], [70_000, 64]])("accounts for all 200 candidates at %i ms per batch", async (latency, admitted) => {
    jest.useFakeTimers();
    jest.setSystemTime(cutoff);
    try {
      let id = 0;
      const client = refreshTestRuntimeClient(async (request) => {
        await new Promise((resolve) => setTimeout(resolve, latency));
        return attestRefreshExecution(request, outputFor(request));
      });
      const reviewer = new AgentRuntimeSourceContentQualityReviewerAdapter({ client, clock: new SystemClock(),
        ids: { generate: () => `population-${++id}` }, batchTimeoutMs: 300_000, totalTimeoutMs: 600_000 });
      const pending = run(Array.from({ length: 200 }, (_, i) => fixture(`population-${i}`)), reviewer,
        { clock: new SystemClock() });
      await jest.advanceTimersByTimeAsync(600_001);
      const result = await pending;
      expect(result.ranking.orderedCandidateIds).toHaveLength(admitted!);
      expect(result.candidates.filter((item) => item.evidenceQualityScore === 0)).toHaveLength(200 - admitted!);
      await jest.advanceTimersByTimeAsync(100_000);
      expect(result.ranking.orderedCandidateIds).toHaveLength(admitted!);
    } finally { jest.useRealTimers(); }
  });

});
