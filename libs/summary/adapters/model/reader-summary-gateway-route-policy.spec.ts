import {
  gatewayDefaultReasoningEffort,
  isGatewayReaderSummaryBackend,
  isGatewayReaderSummaryModel,
  resolveGatewayReaderSummaryRoute,
} from "./active-reader-summary-generation-profile";

describe("reader summary gateway route boundary", () => {
  it("preserves fixed Kimi model with no reasoning control", () => {
    expect(isGatewayReaderSummaryBackend("kimi-code")).toBe(true);
    expect(resolveGatewayReaderSummaryRoute({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "kimi-code",
    })).toEqual({
      backend: "kimi-code",
      model: "k3-256k",
      reasoningEffort: gatewayDefaultReasoningEffort,
    });
    expect(() => resolveGatewayReaderSummaryRoute({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "kimi-code",
      AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT: "high",
    })).toThrow("kimi-code rejects reasoning control");
  });

  it("fails closed on unknown model ids and preserves default OpenRouter route", () => {
    expect(isGatewayReaderSummaryModel("../invalid route")).toBe(false);
    expect(resolveGatewayReaderSummaryRoute({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openrouter",
    })).toMatchObject({ backend: "openrouter", reasoningEffort: gatewayDefaultReasoningEffort });
    expect(() => resolveGatewayReaderSummaryRoute({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openrouter",
      AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT: "invalid",
    })).toThrow("not a supported effort");
  });
});
