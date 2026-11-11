import {
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  codexGatewayReaderSummaryRoutes,
  defaultCodexGatewayReaderSummaryRoute,
  isCodexGatewayOnlyReaderSummaryModel,
  isCodexGatewayReaderSummaryRoute,
  readerSummaryCliRuntimeEnv,
  resolveCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";
import {
  codexGatewayReaderSummaryReasoningEffort,
  defaultCodexGatewayReaderSummaryRoute as catalogDefault,
} from "./codex-reader-summary-gateway-route-policy";

describe("Codex reader summary gateway route policy", () => {
  it("keeps the immutable catalog and historical facade identical", () => {
    expect(defaultCodexGatewayReaderSummaryRoute).toBe(catalogDefault);
    expect(catalogDefault).toEqual({ model: "gpt-6.1-sol", reasoningEffort: "low" });
    expect(Object.isFrozen(codexGatewayReaderSummaryRoutes)).toBe(true);
    expect(Object.isFrozen(codexGatewayReaderSummaryRoutes[0])).toBe(true);
    expect(Object.isFrozen(codexGatewayReaderSummaryRoutes[1])).toBe(true);
    expect(codexGatewayReaderSummaryRoutes[1]).toEqual({
      model: activeReaderSummaryModel,
      reasoningEffort: activeReaderSummaryReasoningEffort,
    });
    expect(isCodexGatewayReaderSummaryRoute("gpt-6.1-sol", "low")).toBe(true);
    expect(isCodexGatewayReaderSummaryRoute("gpt-6.1-sol", "high")).toBe(false);
    expect(isCodexGatewayOnlyReaderSummaryModel("gpt-6.1-sol")).toBe(true);
    expect(isCodexGatewayOnlyReaderSummaryModel(activeReaderSummaryModel)).toBe(false);
    expect(codexGatewayReaderSummaryReasoningEffort("unknown")).toBeUndefined();
  });

  it("selects the exact configured or default route only for Codex gateway transport", () => {
    const base: NodeJS.ProcessEnv = {
      AGENT_RUNTIME_TRANSPORT: "gateway-llm",
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
    };
    expect(resolveCodexGatewayReaderSummaryRoute(base)).toBe(catalogDefault);
    expect(resolveCodexGatewayReaderSummaryRoute({
      ...base,
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: " gpt-5.6-sol ",
    })).toEqual({ model: "gpt-5.6-sol", reasoningEffort: "high" });
    expect(resolveCodexGatewayReaderSummaryRoute({
      ...base,
      AGENT_RUNTIME_TRANSPORT: "agent-runtime",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "invalid",
    })).toBeUndefined();
    expect(resolveCodexGatewayReaderSummaryRoute({
      ...base,
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "mimo",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "invalid",
    })).toBeUndefined();
  });

  it("rejects unsupported pairs without silently selecting another model or effort", () => {
    const base: NodeJS.ProcessEnv = {
      AGENT_RUNTIME_TRANSPORT: "gateway-llm",
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
    };
    for (const pair of [
      { AGENT_RUNTIME_GATEWAY_LLM_MODEL: "unknown" },
      { AGENT_RUNTIME_GATEWAY_LLM_MODEL: "gpt-6.1-sol", AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT: "high" },
      { AGENT_RUNTIME_GATEWAY_LLM_MODEL: "gpt-5.6-sol", AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT: "low" },
    ]) {
      expect(() => resolveCodexGatewayReaderSummaryRoute({ ...base, ...pair }))
        .toThrow("AGENT_RUNTIME_GATEWAY_LLM_MODEL and _REASONING_EFFORT must be one of");
    }
  });

  it("forces CLI transport on a new environment object without mutating the gateway configuration", () => {
    const original: NodeJS.ProcessEnv = {
      AGENT_RUNTIME_TRANSPORT: "gateway-llm",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "gpt-6.1-sol",
    };
    expect(readerSummaryCliRuntimeEnv(original)).toEqual({
      ...original,
      AGENT_RUNTIME_TRANSPORT: "agent-runtime",
    });
    expect(original.AGENT_RUNTIME_TRANSPORT).toBe("gateway-llm");
  });
});
