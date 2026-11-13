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
  it("rejects malformed SDK retry delays and clock ranges before replay", () => {
    const retry = (afterMs: number) => ({ kind: "same_attempt" as const, afterMs });
    for (const afterMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(decision(retry(afterMs))).toEqual({ afterMs: 0, replay: null });
    }
    for (const timing of [
      { nowMs: Number.NaN },
      { nowMs: Number.NEGATIVE_INFINITY },
      { deadlineMs: Number.POSITIVE_INFINITY },
      { nowMs: -Number.MAX_VALUE, deadlineMs: Number.MAX_VALUE },
    ]) {
      expect(decision(retry(5), timing)).toEqual({ afterMs: 0, replay: null });
    }
    // A valid immediate dispatch-free retry and exact deadline cutoff are unchanged.
    expect(decision(retry(0))).toEqual({ afterMs: 0, replay: "same_attempt" });
    expect(decision(retry(5), { deadlineMs: 105 })).toEqual({ afterMs: 5, replay: null });
  });
  it("fails closed when the retry budget or attempt counter is malformed", () => {
    const retry = { kind: "same_attempt", afterMs: 5 } as const;
    for (const maxRetries of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1]) {
      expect(decision(retry, { maxRetries })).toEqual({ afterMs: 0, replay: null });
    }
    for (const retries of [-1, 0.5, Number.NaN, Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1]) {
      expect(decision(retry, { retries })).toEqual({ afterMs: 0, replay: null });
    }
    // Zero explicitly disables replay; valid integer ceilings remain inclusive.
    expect(decision(retry, { maxRetries: 0 })).toEqual({ afterMs: 5, replay: null });
    expect(decision(retry, { maxRetries: 1, retries: 0 }))
      .toEqual({ afterMs: 5, replay: "same_attempt" });
    expect(decision(retry, { maxRetries: 1, retries: 1 }))
      .toEqual({ afterMs: 5, replay: null });
  });

  it("stops when retry count is exhausted, signal aborted or deadline consumed", () => {
    const retry = { kind: "same_attempt", afterMs: 5 } as const;
    expect(decision(retry, { retries: 2 }).replay).toBeNull();
    expect(decision(retry, { signal: AbortSignal.abort() }).replay).toBeNull();
    expect(decision(retry, { deadlineMs: 105 }).replay).toBeNull();
    expect(decision(retry, { deadlineMs: 106 }).replay).toBe("same_attempt");
  });
});
