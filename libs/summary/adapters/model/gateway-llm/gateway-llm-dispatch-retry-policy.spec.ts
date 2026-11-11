import { gatewayLlmDispatchFreeRetry } from "./gateway-llm-dispatch-retry-policy";

const decision = (retry: Parameters<typeof gatewayLlmDispatchFreeRetry>[0]["retry"],
  overrides: Partial<Omit<Parameters<typeof gatewayLlmDispatchFreeRetry>[0], "retry">> = {}) =>
  gatewayLlmDispatchFreeRetry({
    retry, retries: 0, maxRetries: 2, nowMs: 100, deadlineMs: 200, ...overrides,
  });

describe("gateway LLM dispatch-free replay policy", () => {
  it("never retries a provider result marked never", () => {
    expect(decision({ kind: "never" })).toEqual({ afterMs: 0, replay: null });
  });
  it("reuses the same attempt without issuing another paid execution", () => {
    expect(decision({ kind: "same_attempt", afterMs: 5 })).toEqual({ afterMs: 5, replay: "same_attempt" });
  });
  it("permits a new attempt only when duplicate cost is impossible", () => {
    expect(decision({ kind: "new_attempt", afterMs: 5, mayDuplicateCost: false })).toEqual({ afterMs: 5, replay: "new_attempt" });
    expect(decision({ kind: "new_attempt", afterMs: 5, mayDuplicateCost: true })).toEqual({ afterMs: 5, replay: null });
  });
  it("stops when retry count is exhausted, signal aborted or deadline consumed", () => {
    const retry = { kind: "same_attempt", afterMs: 5 } as const;
    expect(decision(retry, { retries: 2 }).replay).toBeNull();
    expect(decision(retry, { signal: AbortSignal.abort() }).replay).toBeNull();
    expect(decision(retry, { deadlineMs: 105 }).replay).toBeNull();
    expect(decision(retry, { deadlineMs: 106 }).replay).toBe("same_attempt");
  });
});
