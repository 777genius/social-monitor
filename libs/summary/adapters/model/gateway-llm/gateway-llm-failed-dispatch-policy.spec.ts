import type { LlmFailure } from "@agent-teams/account-gateway/llm";
import { projectGatewayLlmFailedDispatch } from "./gateway-llm-failed-dispatch-policy";

const now = new Date("2026-11-08T12:00:00.000Z");
const deadline = new Date("2026-11-08T12:00:00.100Z");

const failure = (code: string, retry: LlmFailure["retry"]): LlmFailure =>
  ({ code, retry } as unknown as LlmFailure);

const project = (
  failed: LlmFailure,
  overrides: Partial<{
    retries: number;
    maxRetries: number;
    deadline: Date;
    now: Date;
    signal: AbortSignal;
  }> = {},
) => projectGatewayLlmFailedDispatch({
  failure: failed,
  retries: 0,
  maxRetries: 2,
  deadline,
  now,
  ...overrides,
});

describe("gateway dispatch rejected-result projection", () => {
  it.each([
    ["busy", "busy"],
    ["unauthorized", "unauthorized"],
    ["provider_output_invalid", "other"],
  ])("maps %s to %s account feedback without changing replay safety",
    (code, expected) => {
      const failed = failure(code, { kind: "never" });
      expect(project(failed)).toEqual({
        accountOutcome: expected,
        retryDecision: { afterMs: 0, replay: null },
      });
    });

  it("admits only cost-free bounded retries and never changes account classification", () => {
    const same = failure("busy", { kind: "same_attempt", afterMs: 5 });
    const next = failure("unauthorized", {
      kind: "new_attempt", afterMs: 5, mayDuplicateCost: false,
    });
    const potentiallyPaid = failure("busy", {
      kind: "new_attempt", afterMs: 5, mayDuplicateCost: true,
    });
    expect(project(same)).toEqual({
      accountOutcome: "busy",
      retryDecision: { afterMs: 5, replay: "same_attempt" },
    });
    expect(project(next)).toEqual({
      accountOutcome: "unauthorized",
      retryDecision: { afterMs: 5, replay: "new_attempt" },
    });
    expect(project(potentiallyPaid).retryDecision.replay).toBeNull();
    expect(project(next, { retries: 2 }).retryDecision.replay).toBeNull();
    expect(project(same, { deadline: new Date(now.getTime() + 5) })
      .retryDecision.replay).toBeNull();
    expect(project(same, { signal: AbortSignal.abort() })
      .retryDecision.replay).toBeNull();
  });

  it("reads immutable failure evidence without modifying retry, dates or options", () => {
    const retry = Object.freeze({ kind: "same_attempt" as const, afterMs: 4 });
    const failed = Object.freeze(failure("busy", retry));
    const result = project(failed);
    expect(result.retryDecision).toEqual({ afterMs: 4, replay: "same_attempt" });
    expect(result.accountOutcome).toBe("busy");
    expect(failed.retry).toBe(retry);
    expect(now.toISOString()).toBe("2026-11-08T12:00:00.000Z");
    expect(deadline.toISOString()).toBe("2026-11-08T12:00:00.100Z");
  });
});
