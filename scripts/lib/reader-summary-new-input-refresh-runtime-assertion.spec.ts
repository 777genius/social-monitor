import { singleFlightRefreshRuntimeAssertion } from "./reader-summary-new-input-refresh-runtime-assertion";
import { resolveReaderSummaryServingAuthority } from "./reader-summary-serving-authority";
import { assertRefreshEqual } from "./reader-summary-new-input-refresh-guard";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("refresh live runtime identity single flight", () => {
  it("shares one health probe among six overlapping assertions and re-probes later", async () => {
    const first = deferred(), later = deferred();
    const checkHealth = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(later.promise);
    const assertIdentity = singleFlightRefreshRuntimeAssertion(checkHealth);
    const calls = Array.from({ length: 6 }, () => assertIdentity());
    expect(new Set(calls).size).toBe(1);
    await Promise.resolve();
    expect(checkHealth).toHaveBeenCalledTimes(1);
    first.resolve();
    await Promise.all(calls);
    const next = assertIdentity();
    expect(next).not.toBe(calls[0]);
    await Promise.resolve();
    expect(checkHealth).toHaveBeenCalledTimes(2);
    later.resolve();
    await next;
  });

  it("shares the exact rejection with all six callers and clears after failure", async () => {
    const probe = deferred();
    const error = new Error("synthetic health failure");
    const checkHealth = jest.fn().mockReturnValueOnce(probe.promise).mockResolvedValue(undefined);
    const assertIdentity = singleFlightRefreshRuntimeAssertion(checkHealth);
    const calls = Array.from({ length: 6 }, () => assertIdentity());
    const settled = Promise.allSettled(calls);
    await Promise.resolve();
    expect(checkHealth).toHaveBeenCalledTimes(1);
    probe.reject(error);
    expect(await settled).toEqual(Array.from({ length: 6 }, () => ({ status: "rejected", reason: error })));
    await expect(assertIdentity()).resolves.toBeUndefined();
    expect(checkHealth).toHaveBeenCalledTimes(2);
  });

  it("also clears a synchronous assertion throw", async () => {
    const checkHealth = jest.fn().mockImplementationOnce(() => { throw new Error("synthetic"); })
      .mockResolvedValue(undefined);
    const assertion = singleFlightRefreshRuntimeAssertion(checkHealth);
    await expect(assertion()).rejects.toThrow("synthetic");
    await expect(assertion()).resolves.toBeUndefined();
  });
});

it.each(["runtimeEngine", "runtimeVersion", "launcherSha256"] as const)(
  "re-probes the real serving resolver and rejects later %s drift", async (field) => {
    const probe = deferred();
    const health = { status: "serving" as const, runtimeEngine: "subscription-runtime-cli",
      runtimeVersion: "1.2.3", launcherSha256: "a".repeat(64), warnings: [] };
    const checkHealth = jest.fn(async () => { await probe.promise; return health; });
    const assertion = singleFlightRefreshRuntimeAssertion(async () => {
      const serving = await resolveReaderSummaryServingAuthority({ summaryModelMode: "agent-runtime",
        topicLabelerMode: "agent-runtime", env: {}, agentRuntimeClient: { checkHealth },
        checkedAt: "2026-09-13T00:00:00.000Z" });
      assertRefreshEqual(serving.runtime, { engine: "subscription-runtime-cli",
        packageVersion: "1.2.3", launcherSha256: "a".repeat(64) }, "deployed runtime");
    });
    const overlapping = Array.from({ length: 6 }, () => assertion());
    await Promise.resolve();
    expect(checkHealth).toHaveBeenCalledTimes(1);
    probe.resolve();
    await Promise.all(overlapping);
    health[field] = field === "runtimeVersion" ? "1.2.4" : field === "launcherSha256" ? "b".repeat(64) : "wrong-engine";
    await expect(assertion()).rejects.toThrow(/drifted|not production-safe/);
    expect(checkHealth).toHaveBeenCalledTimes(2);
    expect(checkHealth).toHaveBeenLastCalledWith("reader-summary-production-day-proof-out");
  });
