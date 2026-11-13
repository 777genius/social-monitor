import {
  resolveReaderSummaryDailyTaskIdentityFromEnv,
  resolveReaderSummaryGenerationIdentityFromEnv,
  parseActiveReaderSummaryModel,
  assertActiveReaderSummaryProvider,
  resolveReaderSummaryGenerationIdentity,
  resolveReaderSummaryReasoningEffortFromEnv,
} from "./active-reader-summary-generation-profile";

describe("reader-summary generation identity policy", () => {
  it("keeps the canonical local Codex profile and model", () => {
    expect(resolveReaderSummaryGenerationIdentityFromEnv({})).toMatchObject({
      provider: "codex",
      model: "gpt-5.6-sol",
      backend: "openai-chatgpt",
    });
    expect(parseActiveReaderSummaryModel(undefined)).toBeUndefined();
    expect(assertActiveReaderSummaryProvider(undefined)).toBeUndefined();
  });

  it("rejects unrecognized daily backends without falling through to Codex", () => {
    expect(() => resolveReaderSummaryDailyTaskIdentityFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "synthetic-unknown",
    }, undefined)).toThrow("AGENT_RUNTIME_READER_SUMMARY_BACKEND must be");
    expect(() => assertActiveReaderSummaryProvider("other")).toThrow(
      "AGENT_RUNTIME_PROVIDER must be",
    );
  });

  it("rejects legacy recovery on MiMo or gateway backends before model identity is admitted", () => {
    expect(() => resolveReaderSummaryGenerationIdentity({
      backend: "xiaomi-mimo-token-plan", legacyRecovery: true,
    })).toThrow("MiMo reader summary model conflicts with purpose policy");
    expect(() => resolveReaderSummaryGenerationIdentity({
      backend: "kimi-code", model: "k3-256k", legacyRecovery: true,
    })).toThrow("Gateway reader summary model conflicts with purpose policy");
    expect(() => resolveReaderSummaryGenerationIdentity({
      backend: "openrouter", model: "gpt-5.6-sol",
    })).toThrow("Gateway reader summary model conflicts with purpose policy");
  });
  it("preserves pure Kimi identity admission and fail-closed environment validation", () => {
    expect(resolveReaderSummaryGenerationIdentity({ backend: "kimi-code", model: "k3-256k" })).toEqual({
      provider: "codex", model: "k3-256k", backend: "kimi-code",
    });
    expect(resolveReaderSummaryGenerationIdentityFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "kimi-code",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "k3-256k",
    })).toEqual({ provider: "codex", model: "k3-256k", backend: "kimi-code" });
    expect(() => resolveReaderSummaryGenerationIdentityFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "kimi-code",
      AGENT_RUNTIME_READER_SUMMARY_MODEL: "forged-cli-model",
    })).toThrow("AGENT_RUNTIME_READER_SUMMARY_MODEL must be");
  });

  it("preserves purpose-model pins for MiMo, Kimi and OpenRouter", () => {
    expect(resolveReaderSummaryDailyTaskIdentityFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
    }, undefined)).toEqual({ model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan" });
    expect(resolveReaderSummaryDailyTaskIdentityFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "kimi-code",
    }, "k3-256k")).toEqual({ model: "k3-256k", modelBackend: "kimi-code" });
    expect(resolveReaderSummaryDailyTaskIdentityFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openrouter",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "test/model-v2",
    }, "test/model-v2")).toEqual({ model: "test/model-v2", modelBackend: "openrouter" });
    expect(() => resolveReaderSummaryDailyTaskIdentityFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openrouter",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "test/model-v2",
    }, "other/model")).toThrow("Gateway reader summary model conflicts with purpose policy");
    expect(() => resolveReaderSummaryDailyTaskIdentityFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
    }, "different-model")).toThrow("MiMo reader summary model conflicts with purpose policy");
  });

  it("preserves Codex gateway model and reasoning precedence", () => {
    expect(resolveReaderSummaryGenerationIdentityFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
      AGENT_RUNTIME_TRANSPORT: "gateway-llm",
    })).toEqual({ provider: "codex", model: "gpt-6.1-sol", backend: "openai-chatgpt" });
    expect(resolveReaderSummaryDailyTaskIdentityFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
      AGENT_RUNTIME_TRANSPORT: "gateway-llm",
    }, undefined)).toEqual({ model: "gpt-6.1-sol", modelBackend: "openai-chatgpt" });
    expect(resolveReaderSummaryReasoningEffortFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
      AGENT_RUNTIME_TRANSPORT: "gateway-llm",
    })).toBe("low");
    expect(resolveReaderSummaryReasoningEffortFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "kimi-code",
    })).toBe("default");
    expect(() => resolveReaderSummaryGenerationIdentityFromEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
      AGENT_RUNTIME_TRANSPORT: "gateway-llm",
      AGENT_RUNTIME_READER_SUMMARY_GENERATION_MODEL: "gpt-5.6-sol",
    })).toThrow("Gateway reader summary model conflicts with purpose policy");
  });

});
