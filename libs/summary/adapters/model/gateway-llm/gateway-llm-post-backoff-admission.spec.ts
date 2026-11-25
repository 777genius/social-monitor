import type { LlmUsage } from "@agent-teams/account-gateway/llm";
import { gatewayLlmPostBackoffStop } from "./gateway-llm-post-backoff-admission";

describe("gateway dispatch-free post-backoff admission", () => {
  const startedAt = Date.parse("2026-11-08T09:00:00.000Z");
  const deadline = new Date(startedAt + 100);
  const usage = Object.freeze({
    inputTokens: 40, outputTokens: 9,
    cachedInputTokens: 10, reasoningTokens: null,
  }) as LlmUsage;

  it("admits only a still-live attempt without allocating or changing evidence", () => {
    const resumedAt = new Date(startedAt + 99);
    const input = Object.freeze({ startedAt, deadline, resumedAt, usage });
    expect(gatewayLlmPostBackoffStop(input)).toBeNull();
    expect(gatewayLlmPostBackoffStop(input)).toBeNull();
    expect(deadline.getTime()).toBe(startedAt + 100);
    expect(resumedAt.getTime()).toBe(startedAt + 99);
    expect(usage.inputTokens).toBe(40);
  });

  it("fails closed at the exact deadline but retains verified settlement usage", () => {
    const stopped = gatewayLlmPostBackoffStop({
      startedAt, deadline, resumedAt: new Date(startedAt + 100), usage,
    });
    expect(stopped).toMatchObject({
      status: "failed", durationMs: 100, warnings: [],
      failure: {
        code: "task_timeout", causeCategory: "deadline", retryable: false,
        reconnectRequired: false, details: { gatewayEffect: "not_dispatched" },
      },
      usage: { inputTokens: 40, outputTokens: 9,
        totalTokens: 49, cachedInputTokens: 10 },
    });
    expect(stopped?.usage).not.toHaveProperty("reasoningTokens");
  });

  it("does not replay after cancellation during backoff; cancellation wins deadline races", () => {
    for (const elapsed of [90, 100, 120]) {
      const stopped = gatewayLlmPostBackoffStop({
        startedAt, deadline, resumedAt: new Date(startedAt + elapsed),
        signal: AbortSignal.abort(), usage: null,
      });
      expect(stopped).toMatchObject({
        status: "failed", durationMs: elapsed,
        failure: { code: "task_cancelled", causeCategory: "cancelled",
          retryable: false, details: { gatewayEffect: "not_dispatched" } },
      });
      expect(stopped).not.toHaveProperty("usage");
    }
  });

  it("does not synthesize usage when only an incomplete provider receipt exists", () => {
    const stopped = gatewayLlmPostBackoffStop({
      startedAt, deadline, resumedAt: new Date(startedAt + 101),
      usage: { inputTokens: null, outputTokens: 3,
        cachedInputTokens: null, reasoningTokens: null } as LlmUsage,
    });
    expect(stopped).toMatchObject({ status: "failed", durationMs: 101,
      failure: { code: "task_timeout", details: { gatewayEffect: "not_dispatched" } } });
    expect(stopped).not.toHaveProperty("usage");
  });
});
