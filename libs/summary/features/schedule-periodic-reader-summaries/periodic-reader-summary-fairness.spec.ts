import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryPolicy } from "../../domain";
import type { PeriodicReaderSummaryContinuation } from "./schedule-periodic-reader-summaries.command";
import { fairnessNow, fairnessPolicy, fairnessTick, setupFairness } from "../../../../test/support/periodic-reader-summary-fairness-fixture";

describe("periodic reader summary fairness and recovery", () => {
  it("visits every workspace when there are more enabled policies than the batch", async () => {
    const d = await setupFairness(["a", "b", "c", "d", "e"].map((id) => fairnessPolicy(id)));
    let continuation: PeriodicReaderSummaryContinuation | undefined;
    for (let tick = 0; tick < 3; tick += 1) {
      continuation = (await fairnessTick(d.useCase, { limit: 2, continuation })).continuation;
    }
    expect(new Set(d.requests.map((request) => request.workspaceId)).size).toBe(5);
    expect(d.admitted.size).toBe(5);
  });

  it("finishes all cadences with limit one before progressing to the next policy", async () => {
    const d = await setupFairness([
      fairnessPolicy("a", ["daily", "weekly", "monthly"]), fairnessPolicy("b"),
    ]);
    let continuation: PeriodicReaderSummaryContinuation | undefined;
    for (let tick = 0; tick < 4; tick += 1) {
      continuation = (await fairnessTick(d.useCase, { continuation })).continuation;
    }
    expect(d.requests.map((request) => [request.workspaceId, request.cadence])).toEqual([
      ["workspace-a", "daily"], ["workspace-a", "weekly"], ["workspace-a", "monthly"], ["workspace-b", "daily"],
    ]);
  });

  it("wraps after an exactly full last page without another admission", async () => {
    const d = await setupFairness([fairnessPolicy("a"), fairnessPolicy("b")]);
    const first = await fairnessTick(d.useCase, { limit: 2 });
    const second = await fairnessTick(d.useCase, { limit: 2, continuation: first.continuation });
    expect(first.scheduled).toBe(2);
    expect(second.existing).toBe(2);
    expect(second.scheduled).toBe(0);
    expect(d.admitted.size).toBe(2);
  });

  it("resets a foreign scope but rebases a midnight cursor without starving the tail", async () => {
    const d = await setupFairness([fairnessPolicy("a"), fairnessPolicy("b")]);
    const first = await fairnessTick(d.useCase);
    const scoped = await fairnessTick(d.useCase, {
      tenantId: tenantId("tenant-a"), workspaceId: workspaceId("workspace-a"), continuation: first.continuation,
    });
    expect(scoped.summaries[0]?.workspaceId).toBe("workspace-a");
    const tomorrow = await fairnessTick(d.useCase, {
      now: new Date("2026-11-28T12:00:00.000Z"), continuation: first.continuation,
    });
    expect(tomorrow.summaries[0]).toMatchObject({
      workspaceId: "workspace-b", period: { startedAt: "2026-11-27T00:00:00.000Z" },
    });
  });

  it("keeps progress when policies are edited between ticks", async () => {
    const a = fairnessPolicy("a");
    const d = await setupFairness([a, fairnessPolicy("b")]);
    const first = await fairnessTick(d.useCase);
    await d.policies.save(ReaderSummaryPolicy.create({
      ...a.toSnapshot(), updatedAt: new Date(fairnessNow.getTime() + 1_000),
    }));
    const second = await fairnessTick(d.useCase, { continuation: first.continuation });
    expect(second.summaries[0]?.workspaceId).toBe("workspace-b");
  });

  it("resumes cadence identity after a cadence is removed or reordered", async () => {
    const a = fairnessPolicy("a", ["daily", "weekly", "monthly"]);
    const d = await setupFairness([a, fairnessPolicy("b")]);
    const first = await fairnessTick(d.useCase);
    await d.policies.save(ReaderSummaryPolicy.create({
      ...a.toSnapshot(), schedule: { enabled: true, timezone: "UTC", cadences: ["monthly", "daily"] },
    }));
    const second = await fairnessTick(d.useCase, { continuation: first.continuation });
    expect(second.summaries[0]).toMatchObject({ workspaceId: "workspace-a", cadence: "monthly" });
  });

  it("skips a disabled partial policy without expanding the page limit", async () => {
    const a = fairnessPolicy("a", ["daily", "weekly"]);
    const d = await setupFairness([a, fairnessPolicy("b")]);
    const first = await fairnessTick(d.useCase);
    await d.policies.save(ReaderSummaryPolicy.create({
      ...a.toSnapshot(), schedule: { ...a.toSnapshot().schedule, enabled: false },
    }));
    const list = jest.spyOn(d.policies, "listScheduled");
    const second = await fairnessTick(d.useCase, { continuation: first.continuation });
    expect(second.summaries[0]?.workspaceId).toBe("workspace-b");
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
  });

  it("moves past a failing policy recovery lookup so another tenant is serviced", async () => {
    const findByIdempotencyKey = jest.fn().mockRejectedValueOnce(new Error("temporary lookup failure")).mockResolvedValue(null);
    const d = await setupFairness([fairnessPolicy("a"), fairnessPolicy("b")], { findByIdempotencyKey });
    const first = await fairnessTick(d.useCase);
    expect(first.failed).toBe(1);
    const second = await fairnessTick(d.useCase, { continuation: first.continuation });
    expect(second.summaries[0]?.workspaceId).toBe("workspace-b");
    expect(findByIdempotencyKey).toHaveBeenCalledTimes(3);
  });

  it("preserves the prior continuation after the page fetch fails", async () => {
    const d = await setupFairness([fairnessPolicy("a"), fairnessPolicy("b")]);
    const first = await fairnessTick(d.useCase);
    jest.spyOn(d.policies, "listScheduled").mockRejectedValueOnce(new Error("database unavailable"));
    await expect(fairnessTick(d.useCase, { continuation: first.continuation })).rejects.toThrow("database unavailable");
    const retry = await fairnessTick(d.useCase, { continuation: first.continuation });
    expect(retry.summaries[0]?.workspaceId).toBe("workspace-b");
  });

  it("bounds each tick when hundreds of policies are not yet due", async () => {
    const d = await setupFairness(Array.from({ length: 300 }, (_, index) => fairnessPolicy(String(index).padStart(3, "0"))));
    const list = jest.spyOn(d.policies, "listScheduled");
    const result = await fairnessTick(d.useCase, { now: new Date("2026-11-27T05:00:00.000Z"), limit: 20 });
    expect(result).toMatchObject({ evaluated: 20, notReady: 20, scheduled: 0 });
    expect(list).toHaveBeenCalledTimes(1);
    expect(d.requests).toHaveLength(0);
  });
});
