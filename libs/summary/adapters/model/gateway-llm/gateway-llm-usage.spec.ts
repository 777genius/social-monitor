import type { LlmUsage } from "@agent-teams/account-gateway/llm";
import { gatewayLlmUsage } from "./gateway-llm-usage";

describe("gateway LLM settlement usage", () => {
  it("retains nonzero cached and reasoning tokens without changing billed totals", () => {
    const usage = { inputTokens: 40, outputTokens: 9,
      cachedInputTokens: 12, reasoningTokens: 3 } as LlmUsage;

    expect(gatewayLlmUsage(usage)).toEqual({ usage: {
      inputTokens: 40, outputTokens: 9, totalTokens: 49,
      estimatedCostUsd: 0, cachedInputTokens: 12, reasoningTokens: 3,
    } });
  });

  it("retains explicitly measured zero subcounters", () => {
    const usage = { inputTokens: 0, outputTokens: 0,
      cachedInputTokens: 0, reasoningTokens: 0 } as LlmUsage;
    expect(gatewayLlmUsage(usage)).toEqual({ usage: {
      inputTokens: 0, outputTokens: 0, totalTokens: 0,
      estimatedCostUsd: 0, cachedInputTokens: 0, reasoningTokens: 0,
    } });
  });

  it("omits unknown subcounters rather than fabricating measured values", () => {
    const usage = { inputTokens: 2, outputTokens: 1,
      cachedInputTokens: null, reasoningTokens: null } as LlmUsage;
    expect(gatewayLlmUsage(usage)).toEqual({ usage: {
      inputTokens: 2, outputTokens: 1, totalTokens: 3, estimatedCostUsd: 0,
    } });
  });

  it.each([
    null,
    { inputTokens: null, outputTokens: 9, cachedInputTokens: 8, reasoningTokens: 3 },
    { inputTokens: 40, outputTokens: null, cachedInputTokens: 8, reasoningTokens: 3 },
  ])("does not invent complete accounting from incomplete usage", (usage) => {
    expect(gatewayLlmUsage(usage as LlmUsage | null)).toEqual({});
  });
});
