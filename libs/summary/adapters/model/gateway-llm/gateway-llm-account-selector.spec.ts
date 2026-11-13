import { CooldownRotatingAccountSelector, gatewayLlmMaxAccountRefs } from "./gateway-llm-account-selector";

const refs = ["account-a", "account-b", "account-c"];
const start = new Date("2026-11-08T00:00:00.000Z");
const later = (milliseconds: number): Date => new Date(start.getTime() + milliseconds);
const configured = () => new CooldownRotatingAccountSelector({
  busyCooldownMs: 30_000,
  unauthorizedCooldownMs: 3_600_000,
});
const order = (selector: CooldownRotatingAccountSelector, at = start) =>
  selector.order({ taskId: "task-1", accountRefs: refs, now: at });

describe("gateway account rotation and cooldown admissions", () => {
  it("keeps task-hash rotation deterministic, unique, and process-local", () => {
    const first = configured();
    expect(order(first)).toEqual(order(configured()));
    expect(first.order({ taskId: "task-1",
      accountRefs: [...refs, refs[0]!], now: start })).toEqual(order(first));
    expect(new Set(order(first)).size).toBe(refs.length);
    expect(first.order({ taskId: "one", accountRefs: [refs[0]!], now: start }))
      .toEqual([refs[0]]);
    first.observe({ accountRef: order(first)[0]!, outcome: "busy",
      retryAfterMs: 60_000, now: start });
    expect(order(configured())).not.toEqual(order(first));
  });

  it("preserves count and cooldown validation before dispatch", () => {
    const selector = configured();
    expect(() => selector.order({ taskId: "task", accountRefs: [], now: start }))
      .toThrow("Gateway llm route requires 1..16 distinct accounts");
    expect(() => selector.order({ taskId: "task",
      accountRefs: Array.from({ length: gatewayLlmMaxAccountRefs + 1 },
        (_, index) => `account-${index}`), now: start }))
      .toThrow("Gateway llm route requires 1..16 distinct accounts");
    expect(() => new CooldownRotatingAccountSelector({
      busyCooldownMs: -1, unauthorizedCooldownMs: 0,
    })).toThrow("Gateway account cooldowns must be non-negative");
    expect(() => new CooldownRotatingAccountSelector({
      busyCooldownMs: Number.NaN, unauthorizedCooldownMs: 0,
    })).toThrow("Gateway account cooldowns must be non-negative");
  });

  it("uses the longer provider retry delay and re-admits on the exact boundary", () => {
    const selector = configured();
    const first = order(selector)[0]!;
    selector.observe({ accountRef: first, outcome: "busy", retryAfterMs: 61_000, now: start });
    expect(order(selector, later(60_999)).at(-1)).toBe(first);
    expect(order(selector, later(61_000))).toEqual(order(configured()));
  });

  it("applies busy policy floor and keeps cooled accounts as fallback", () => {
    const selector = configured();
    const initial = order(selector);
    selector.observe({ accountRef: initial[0]!, outcome: "busy", retryAfterMs: 500, now: start });
    selector.observe({ accountRef: initial[1]!, outcome: "busy", retryAfterMs: 5_000, now: later(1) });
    expect(order(selector, later(2))).toEqual([initial[2], initial[0], initial[1]]);
    expect(order(selector, later(30_000))).toEqual([initial[0], initial[2], initial[1]]);
    expect(order(selector, later(30_001))).toEqual(initial);
  });

  it("quarantines unauthorized accounts until expiry and clears on completion", () => {
    const selector = configured();
    const first = order(selector)[0]!;
    selector.observe({ accountRef: first, outcome: "unauthorized", retryAfterMs: 0, now: start });
    expect(order(selector, later(3_599_999)).at(-1)).toBe(first);
    expect(order(selector, later(3_600_000))).toEqual(order(configured()));
    selector.observe({ accountRef: first, outcome: "unauthorized", retryAfterMs: 0, now: start });
    selector.observe({ accountRef: first, outcome: "completed", retryAfterMs: 0, now: later(2) });
    expect(order(selector, later(3))).toEqual(order(configured()));
  });

  it("ignores unknown outcomes and null references without erasing cooldown state", () => {
    const selector = configured();
    const first = order(selector)[0]!;
    selector.observe({ accountRef: first, outcome: "busy", retryAfterMs: 45_000, now: start });
    selector.observe({ accountRef: null, outcome: "completed", retryAfterMs: 0, now: later(1) });
    selector.observe({ accountRef: first, outcome: "other", retryAfterMs: 0, now: later(2) });
    expect(order(selector, later(44_999)).at(-1)).toBe(first);
    expect(order(selector, later(45_000))).toEqual(order(configured()));
  });
  it("rejects non-finite cooldown configuration rather than permanently cooling an account", () => {
    for (const field of ["busyCooldownMs", "unauthorizedCooldownMs"] as const) {
      expect(() => new CooldownRotatingAccountSelector({
        busyCooldownMs: 30_000,
        unauthorizedCooldownMs: 3_600_000,
        [field]: Number.POSITIVE_INFINITY,
      })).toThrow("Gateway account cooldowns must be non-negative");
    }
  });

  it("uses the configured busy floor when the gateway sends non-finite retry metadata", () => {
    for (const retryAfterMs of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const selector = configured();
      const first = order(selector)[0]!;
      selector.observe({ accountRef: first, outcome: "busy", retryAfterMs, now: start });
      expect(order(selector, later(29_999)).at(-1)).toBe(first);
      expect(order(selector, later(30_000))).toEqual(order(configured()));
    }
  });

  it("rejects invalid clocks without mutating cooldowns or dropping account preferences", () => {
    const selector = configured();
    const first = order(selector)[0]!;
    const invalid = new Date(Number.NaN);
    expect(() => selector.observe({ accountRef: first, outcome: "busy",
      retryAfterMs: 45_000, now: invalid }))
      .toThrow("Gateway account observation time must be valid");
    expect(order(selector)).toEqual(order(configured()));
    selector.observe({ accountRef: first, outcome: "busy", retryAfterMs: 30_000, now: start });
    expect(() => order(selector, invalid)).toThrow("Gateway account observation time must be valid");
    expect(order(selector, later(30_000))).toEqual(order(configured()));
  });

});
