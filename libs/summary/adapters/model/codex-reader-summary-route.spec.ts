import {
  isCodexGatewayReaderSummaryRoute,
  resolveCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";

describe("Codex reader summary gateway route", () => {
  it("selects Terra with medium effort when explicitly configured", () => {
    expect(resolveCodexGatewayReaderSummaryRoute({
      AGENT_RUNTIME_TRANSPORT: "gateway-llm",
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "gpt-6.1-terra",
      AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT: "medium",
    })).toEqual({ model: "gpt-6.1-terra", reasoningEffort: "medium" });
    expect(isCodexGatewayReaderSummaryRoute("gpt-6.1-terra", "high")).toBe(false);
  });

});
