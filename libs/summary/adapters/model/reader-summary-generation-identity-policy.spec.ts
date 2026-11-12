import {
  resolveReaderSummaryDailyTaskIdentityFromEnv,
  resolveReaderSummaryGenerationIdentityFromEnv,
  parseActiveReaderSummaryModel,
  assertActiveReaderSummaryProvider,
  resolveReaderSummaryGenerationIdentity,
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
});
