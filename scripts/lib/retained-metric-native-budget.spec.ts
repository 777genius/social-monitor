import { RetainedMetricNativeBudget, runWithNativeMetricBudget } from "./retained-metric-native-budget";
import type * as Fs from "node:fs";

function fakeRuntime(startupMs = 0) {
  let elapsed = startupMs;
  const timers: { at: number; work: () => void; cancelled: boolean }[] = [];
  const fail = jest.fn((message: string): never => { throw new Error(message); });
  return {
    timers, fail,
    elapsedMs: () => elapsed,
    schedule: (work: () => void, delayMs: number) => {
      const timer = { at: elapsed + delayMs, work, cancelled: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    },
    jump: (at: number) => { elapsed = at; },
    advance: (at: number) => {
      elapsed = at;
      for (const timer of timers.filter((t) => !t.cancelled && t.at <= at).sort((a, b) => a.at - b.at)) {
        timer.cancelled = true;
        timer.work();
      }
    },
  };
}

describe("mandatory native fixture process budgets", () => {
  it.each([false, true])("uses process exit 124 even if timeout reporting fails: %s", (writeFails) => {
    jest.useFakeTimers();
    jest.spyOn(process, "uptime").mockReturnValue(35);
    const exit = jest.spyOn(process, "exit").mockImplementation((): never => { throw new Error("test process terminated"); });
    jest.spyOn(jest.requireActual<typeof Fs>("node:fs"), "writeSync").mockImplementation(() => {
      if (writeFails) throw new Error("stderr unavailable");
      return 0;
    });
    const budget = new RetainedMetricNativeBudget();
    try {
      jest.advanceTimersByTime(84999);
      expect(exit).not.toHaveBeenCalled();
      expect(() => jest.advanceTimersByTime(1)).toThrow("test process terminated");
      expect(exit).toHaveBeenCalledWith(124);
    } finally {
      budget.dispose();
      expect(jest.getTimerCount()).toBe(0);
      jest.restoreAllMocks();
      jest.useRealTimers();
    }
  });

  it("terminates the original phase at 120000ms without awaiting fixture completion", () => {
    const runtime = fakeRuntime();
    const budget = new RetainedMetricNativeBudget(runtime);
    runtime.advance(119999);
    expect(runtime.fail).not.toHaveBeenCalled();
    expect(() => runtime.advance(120000)).toThrow("Original metric fixture");
    budget.dispose();
  });

  it("charges compilation/import time against both process deadlines", () => {
    const runtime = fakeRuntime(35000);
    const budget = new RetainedMetricNativeBudget(runtime);
    expect(runtime.timers.map((t) => t.at).sort((a, b) => a - b)).toEqual([120000, 900000]);
    expect(() => runtime.advance(120000)).toThrow("120000ms");
    budget.dispose();
  });

  it.each([120000, 120001, 900000])("rejects startup elapsed %i before any fixture work", async (elapsed) => {
    const runtime = fakeRuntime(elapsed);
    const fixture = jest.fn();
    await expect(runWithNativeMetricBudget(fixture, runtime)).rejects.toThrow("process budget");
    expect(fixture).not.toHaveBeenCalled();
    expect(runtime.timers).toHaveLength(0);
  });

  it("rejects a late transition even when the original timer has not been delivered", async () => {
    const runtime = fakeRuntime();
    const budget = new RetainedMetricNativeBudget(runtime);
    const renewal = jest.fn();
    runtime.jump(120000);
    await expect(budget.runRenewal(renewal)).rejects.toThrow("120000ms");
    expect(renewal).not.toHaveBeenCalled();
    budget.dispose();
  });

  it("transitions once, cancels the original timer, and never extends the global deadline", async () => {
    const runtime = fakeRuntime(20000);
    const budget = new RetainedMetricNativeBudget(runtime);
    const originalTimer = runtime.timers.find((t) => t.at === 120000)!;
    runtime.advance(119999);
    await budget.runRenewal(async () => {
      expect(originalTimer.cancelled).toBe(true);
      originalTimer.work(); // A cancelled callback already queued for delivery is harmless.
      runtime.advance(899999);
      expect(runtime.fail).not.toHaveBeenCalled();
    });
    expect(runtime.timers).toHaveLength(2);
    expect(() => runtime.advance(900000)).toThrow("900000ms");
    budget.dispose();
  });

  it("keeps the total timer armed while renewal is pending", async () => {
    const runtime = fakeRuntime();
    const budget = new RetainedMetricNativeBudget(runtime);
    let finish!: () => void;
    const pending = budget.runRenewal(() => new Promise<void>((resolve) => { finish = resolve; }));
    expect(() => runtime.advance(900000)).toThrow("900000ms");
    finish();
    await expect(pending).rejects.toThrow("900000ms");
    budget.dispose();
  });

  it("checks total elapsed after renewal and cleanup even when timer delivery is delayed", async () => {
    const runtime = fakeRuntime();
    await expect(runWithNativeMetricBudget(async (budget) => {
      await budget.runRenewal(async () => { runtime.jump(899999); });
      runtime.jump(900000); // Fixture cleanup belongs to the same absolute budget.
    }, runtime)).rejects.toThrow("900000ms");
    expect(runtime.timers.every((t) => t.cancelled)).toBe(true);
  });

  it("cannot pass with skipped, unfinished, failed, or repeated renewal", async () => {
    await expect(runWithNativeMetricBudget(async () => {}, fakeRuntime())).rejects.toThrow("completed renewal coverage");
    const runtime = fakeRuntime();
    const budget = new RetainedMetricNativeBudget(runtime);
    let finish!: () => void;
    const pending = budget.runRenewal(() => new Promise<void>((resolve) => { finish = resolve; }));
    expect(() => budget.complete()).toThrow("completed renewal coverage");
    finish();
    await pending;
    await expect(budget.runRenewal(async () => {})).rejects.toThrow("exactly once");
    budget.dispose();
    await expect(runWithNativeMetricBudget(async (gate) => {
      await expect(gate.runRenewal(async () => { throw new Error("fixture failure"); })).rejects.toThrow("fixture failure");
    }, fakeRuntime())).rejects.toThrow("completed renewal coverage");
  });

  it("runs original work, mandatory renewal, and cleanup in order and disposes all timers", async () => {
    const runtime = fakeRuntime();
    const order: string[] = [];
    await runWithNativeMetricBudget(async (budget) => {
      order.push("original seed and scenarios");
      await budget.runRenewal(async () => { order.push("renewal-total"); });
      order.push("cleanup");
    }, runtime);
    expect(order).toEqual(["original seed and scenarios", "renewal-total", "cleanup"]);
    expect(runtime.timers.every((t) => t.cancelled)).toBe(true);
    for (const timer of runtime.timers) timer.work();
    expect(runtime.fail).not.toHaveBeenCalled();
  });

  it.each(["original", "renewal"])("disposes on %s errors and propagates failure", async (phase) => {
    const runtime = fakeRuntime();
    const error = new Error("scenario assertion failed");
    await expect(runWithNativeMetricBudget(async (budget) => {
      if (phase === "original") throw error;
      await budget.runRenewal(async () => { throw error; });
    }, runtime)).rejects.toBe(error);
    expect(runtime.timers.every((t) => t.cancelled)).toBe(true);
    for (const timer of runtime.timers) timer.work();
    expect(runtime.fail).not.toHaveBeenCalled();
  });

  it("does not revive disposed timers when pending renewal completes", async () => {
    const runtime = fakeRuntime();
    const budget = new RetainedMetricNativeBudget(runtime);
    let finish!: () => void;
    const pending = budget.runRenewal(() => new Promise<void>((resolve) => { finish = resolve; }));
    budget.dispose();
    finish();
    await expect(pending).rejects.toThrow("disposed before completion");
    for (const timer of runtime.timers) timer.work();
    expect(runtime.fail).not.toHaveBeenCalled();
  });
});

 it.each(["original", "renewal"])("checks overdue %s cleanup rejection before disposal", async (phase) => {
  const runtime = fakeRuntime();
  await expect(runWithNativeMetricBudget(async (budget) => {
    const rejectCleanup = () => { runtime.jump(phase === "original" ? 120001 : 900001); throw new Error("cleanup rejected"); };
    const cleanup = async () => {
      try { await Promise.resolve(); }
      finally { rejectCleanup(); }
    };
    if (phase === "original") await cleanup();
    else await budget.runRenewal(cleanup);
  }, runtime)).rejects.toThrow("process budget");
  expect(runtime.timers.every((timer) => timer.cancelled)).toBe(true);
 });

it("rejects concurrent transitions and disposal while parent acknowledgement is pending", async () => {
  const runtime = fakeRuntime();
  let acknowledge!: () => void;
  const budget = new RetainedMetricNativeBudget({ ...runtime, transition: () => new Promise<void>((resolve) => { acknowledge = resolve; }) });
  const work = jest.fn(async () => {});
  const pending = budget.runRenewal(work);
  await expect(budget.runRenewal(work)).rejects.toThrow("exactly once");
  budget.dispose();
  acknowledge();
  await expect(pending).rejects.toThrow("disposed before transition");
  expect(work).not.toHaveBeenCalled();
});
