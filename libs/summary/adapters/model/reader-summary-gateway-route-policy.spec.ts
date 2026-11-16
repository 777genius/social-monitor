import { admitGatewayReaderSummaryRoute } from "./reader-summary-gateway-route-admission";
import {
  gatewayDefaultReasoningEffort,
  isGatewayReaderSummaryBackend,
  isGatewayReaderSummaryModel,
  resolveGatewayReaderSummaryRoute,
  isGatewayReaderSummaryExecution,
} from "./active-reader-summary-generation-profile";

import {
  isGatewayReaderSummaryExecution as directGatewayExecution,
} from "./reader-summary-gateway-execution-policy";
import {
  isGatewayReaderSummaryModel as directGatewayModel,
  isGatewayReaderSummaryReasoningEffort as directGatewayEffort,
} from "./reader-summary-gateway-model-policy";
import { isGatewayReaderSummaryReasoningEffort } from "./active-reader-summary-generation-profile";

describe("reader summary gateway route boundary", () => {
  it("matches the env gateway route with pure route admission for supported selections", () => {
    for (const [backend, model, effort] of [
      ["kimi-code", undefined, undefined],
      ["kimi-code", "k3-256k", undefined],
      ["openrouter", undefined, undefined],
      ["openrouter", "openai/gpt-oss-120b", "high"],
    ] as const) {
      const env = Object.freeze({
        AGENT_RUNTIME_READER_SUMMARY_BACKEND: backend,
        AGENT_RUNTIME_GATEWAY_LLM_MODEL: model,
        AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT: effort,
      });
      expect(resolveGatewayReaderSummaryRoute(env)).toEqual(
        admitGatewayReaderSummaryRoute(backend, model, effort),
      );
    }
  });

  it("keeps rejection precedence and ignores invalid route fields for non-gateway backends", () => {
    expect(() => admitGatewayReaderSummaryRoute("kimi-code", "invalid", "high"))
      .toThrow("AGENT_RUNTIME_GATEWAY_LLM_MODEL must be k3-256k");
    expect(() => admitGatewayReaderSummaryRoute("kimi-code", "k3-256k", "high"))
      .toThrow("kimi-code rejects reasoning control");
    expect(() => admitGatewayReaderSummaryRoute("openrouter", "gpt-5.6-sol", "invalid"))
      .toThrow("AGENT_RUNTIME_GATEWAY_LLM_MODEL is not a gateway model id");
    expect(() => admitGatewayReaderSummaryRoute("openrouter", "openai/gpt-oss-120b", "invalid"))
      .toThrow("AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT is not a supported effort");
    expect(resolveGatewayReaderSummaryRoute({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "other",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "invalid",
      AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT: "invalid",
    })).toBeUndefined();
  });


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

  it("keeps gateway engine attestation distinct from CLI execution and rejects a forged model route", () => {
    expect(isGatewayReaderSummaryExecution({
      runtimeEngine: "gateway-llm", model: "k3-256k", reasoningEffort: gatewayDefaultReasoningEffort,
    })).toBe(true);
    expect(isGatewayReaderSummaryExecution({
      runtimeEngine: "subscription-runtime-cli", model: "k3-256k", reasoningEffort: gatewayDefaultReasoningEffort,
    })).toBe(false);
    expect(() => resolveGatewayReaderSummaryRoute({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "kimi-code",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "openai/gpt-oss-120b",
    })).toThrow("AGENT_RUNTIME_GATEWAY_LLM_MODEL must be k3-256k");
    expect(() => resolveGatewayReaderSummaryRoute({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openrouter",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "gpt-5.6-sol",
    })).toThrow("AGENT_RUNTIME_GATEWAY_LLM_MODEL is not a gateway model id");
  });
  it("uses identical gateway trust functions through both legacy and direct owners", () => {
    expect(isGatewayReaderSummaryExecution).toBe(directGatewayExecution);
    expect(isGatewayReaderSummaryModel).toBe(directGatewayModel);
    expect(isGatewayReaderSummaryReasoningEffort).toBe(directGatewayEffort);

    const admitted = Object.freeze({
      runtimeEngine: "gateway-llm",
      model: "k3-256k",
      reasoningEffort: gatewayDefaultReasoningEffort,
    });
    expect(directGatewayExecution(admitted)).toBe(true);
    expect(admitted).toEqual({
      runtimeEngine: "gateway-llm",
      model: "k3-256k",
      reasoningEffort: "default",
    });
    for (const forgery of [
      { ...admitted, runtimeEngine: "subscription-runtime-cli" },
      { ...admitted, model: "mimo-v2.6-pro" },
      { ...admitted, reasoningEffort: "unsupported" },
      { runtimeEngine: "gateway-llm", model: "gpt-6.1-sol", reasoningEffort: "high" },
      { runtimeEngine: "gateway-llm", model: "k3-256k" },
    ]) {
      expect(directGatewayExecution(forgery)).toBe(false);
    }
  });


});
