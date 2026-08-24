import {
  readerSummaryServingAuthorityRequiresAgentRuntime,
  resolveReaderSummaryServingAuthority,
} from "./reader-summary-serving-authority";

const checkedAt = "2026-08-14T10:00:00.000Z";

describe("reader summary current serving authority", () => {
  it("records every effective agent-runtime component and the shared live runtime", async () => {
    const checkHealth = servingHealth();

    await expect(resolveReaderSummaryServingAuthority({
      summaryModelMode: "agent-runtime",
      topicLabelerMode: "agent-runtime",
      env: {
        AGENT_RUNTIME_PROVIDER: "codex",
        AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.6-sol",
        AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MODEL: "gpt-5.6-sol",
        AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_MODEL:
          "gpt-5.6-sol",
        AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT: "high",
      },
      agentRuntimeClient: { checkHealth },
      checkedAt,
    })).resolves.toEqual({
      summaryGenerator: {
        mode: "agent-runtime",
        provider: "codex",
        physicalModel: "gpt-5.6-sol",
        reasoningPolicy: "high",
      },
      topicLabeler: {
        mode: "agent-runtime",
        provider: "codex",
        physicalModel: "gpt-5.6-sol",
        reasoningPolicy: "high",
      },
      topicRelationVerifier: {
        mode: "agent-runtime",
        provider: "codex",
        physicalModel: "gpt-5.6-sol",
        reasoningPolicy: "high",
      },
      runtime: {
        engine: "subscription-runtime-cli",
        packageVersion: "1.4.2",
        launcherSha256: "a".repeat(64),
      },
    });
    expect(checkHealth).toHaveBeenCalledTimes(1);
  });

  it("uses the exact production adapter defaults", async () => {
    await expect(resolveReaderSummaryServingAuthority({
      summaryModelMode: "agent-runtime",
      topicLabelerMode: "agent-runtime",
      env: {},
      agentRuntimeClient: { checkHealth: servingHealth() },
      checkedAt,
    })).resolves.toMatchObject({
      summaryGenerator: { physicalModel: "gpt-5.6-sol" },
      topicLabeler: {
        physicalModel: "gpt-5.6-sol",
      },
      topicRelationVerifier: {
        physicalModel: "gpt-5.6-sol",
      },
    });
  });

  it("retains OpenAI summary authority when topic components use agent runtime", async () => {
    const authority = await resolveReaderSummaryServingAuthority({
      summaryModelMode: "openai-responses",
      topicLabelerMode: "agent-runtime",
      env: { OPENAI_SUMMARY_MODEL: "openai-summary-model" },
      agentRuntimeClient: { checkHealth: servingHealth() },
      checkedAt,
    });

    expect(authority).toMatchObject({
      summaryGenerator: {
        mode: "openai-responses",
        provider: "openai-responses",
        physicalModel: "openai-summary-model",
      },
      topicLabeler: { mode: "agent-runtime", provider: "codex" },
      topicRelationVerifier: { mode: "agent-runtime", provider: "codex" },
      runtime: { packageVersion: "1.4.2" },
    });
  });

  it("fails closed when current live runtime authority cannot be proven", async () => {
    await expect(resolveReaderSummaryServingAuthority({
      summaryModelMode: "agent-runtime",
      topicLabelerMode: "agent-runtime",
      env: {},
      agentRuntimeClient: null,
      checkedAt,
    })).rejects.toThrow("Current agent-runtime serving authority is required");
  });

  it("fails before probing when the active provider is not codex", async () => {
    const checkHealth = servingHealth();
    await expect(resolveReaderSummaryServingAuthority({
      summaryModelMode: "agent-runtime",
      topicLabelerMode: "agent-runtime",
      env: { AGENT_RUNTIME_PROVIDER: "claude" },
      agentRuntimeClient: { checkHealth },
      checkedAt,
    })).rejects.toThrow("provider must be codex");
    expect(checkHealth).not.toHaveBeenCalled();
  });

  it.each([
    ["deterministic", "deterministic-reader-summary-v1"],
    ["openai-responses", "configured-openai-model"],
  ] as const)("keeps %s direct without a live runtime", async (
    summaryModelMode,
    physicalModel,
  ) => {
    const authority = await resolveReaderSummaryServingAuthority({
      summaryModelMode,
      topicLabelerMode: "deterministic",
      env: { OPENAI_READER_SUMMARY_MODEL: "configured-openai-model" },
      agentRuntimeClient: null,
      checkedAt,
    });

    expect(authority).toMatchObject({
      summaryGenerator: { mode: summaryModelMode, physicalModel },
      topicLabeler: { mode: "deterministic" },
      topicRelationVerifier: { mode: "deterministic" },
      runtime: null,
    });
    expect(readerSummaryServingAuthorityRequiresAgentRuntime({
      summaryModelMode,
      topicLabelerMode: "deterministic",
    })).toBe(false);
  });
});

const servingHealth = () => jest.fn(async () => ({
  status: "serving" as const,
  runtimeEngine: "subscription-runtime-cli" as const,
  runtimeVersion: "1.4.2",
  launcherSha256: "a".repeat(64),
  warnings: [],
}));
