import {
  readerSummaryServingAuthorityRequiresAgentRuntime,
  resolveReaderSummaryServingAuthority,
} from "./reader-summary-serving-authority";

const checkedAt = "2026-08-14T10:00:00.000Z";

describe("reader summary current serving authority", () => {
  it("probes and records the effective live agent runtime before identity use", async () => {
    const checkHealth = jest.fn(async () => ({
      status: "serving" as const,
      runtimeEngine: "subscription-runtime-cli" as const,
      runtimeVersion: "1.4.2",
      launcherSha256: "a".repeat(64),
      warnings: [],
    }));

    await expect(resolveReaderSummaryServingAuthority({
      summaryModelMode: "agent-runtime",
      topicLabelerMode: "agent-runtime",
      env: {
        AGENT_RUNTIME_PROVIDER: "claude",
        AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.7",
        AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT: "xhigh",
      },
      agentRuntimeClient: { checkHealth },
      checkedAt,
    })).resolves.toEqual({
      summaryModelMode: "agent-runtime",
      topicLabelerMode: "agent-runtime",
      provider: "claude",
      physicalModel: "gpt-5.7",
      reasoningEffort: "xhigh",
      runtimeEngine: "subscription-runtime-cli",
      runtimePackageVersion: "1.4.2",
      launcherSha256: "a".repeat(64),
    });
    expect(checkHealth).toHaveBeenCalledTimes(1);
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

  it.each([
    ["deterministic", "deterministic-reader-summary-v1"],
    ["openai-responses", "configured-openai-model"],
  ] as const)("keeps %s direct and does not create or probe an agent client", async (
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
      summaryModelMode,
      physicalModel,
      runtimeEngine: "in-process",
      launcherSha256: "not-applicable",
    });
    expect(readerSummaryServingAuthorityRequiresAgentRuntime({
      summaryModelMode,
      topicLabelerMode: "deterministic",
    })).toBe(false);
  });
});
