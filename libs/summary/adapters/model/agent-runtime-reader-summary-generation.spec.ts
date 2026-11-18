import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import { runAgentRuntimeReaderSummaryPaidAttempt } from "./agent-runtime-reader-summary-paid-attempt";
import { buildAgentRuntimeReaderSummaryTaskCommand } from "./agent-runtime-reader-summary-task-command";
import {
  CapturingAgentRuntimeClient,
  readerSummaryInput,
  validReaderProviderDraft,
} from "./agent-runtime-reader-summary-model.spec-support";

describe("agent-runtime reader summary attempt lifecycle", () => {
  it("refuses a repair before dispatch when the shared writer budget is exhausted", async () => {
    const invalid = validReaderProviderDraft();
    invalid.narrativeSections = [{
      kind: "watch",
      title: "Watch",
      text: "Provider reliability requires monitoring.",
      citationIds: ["c1"],
      storyClusterId: null,
    }];
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: invalid,
      warnings: [],
      usage: {
        inputTokens: 100,
        outputTokens: 10,
        totalTokens: 110,
        estimatedCostUsd: 0.01,
      },
    });
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
    const input = readerSummaryInput();
    const route = adapter.route(input, {
      preferredProvider: "agent-runtime",
      maxInputTokens: 24_000,
      maxOutputTokens: 16_000,
      maxEstimatedCostUsd: 1,
    }, { remainingTokens: 40_000, remainingCostUsd: 1 });

    await expect(adapter.generate(input, route, {
      remainingTokens: 1,
      remainingCostUsd: 0,
    })).rejects.toThrow("Daily editorial writer cannot repair within the shared model budget");
    expect(client.commands).toHaveLength(1);
    expect(client.commands[0]?.metadata).toMatchObject({ attempt: "primary" });
  });

  it("never publishes or retries a completed draft without scoped runtime attestation", async () => {
    const record = jest.fn();
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: validReaderProviderDraft(),
      warnings: [],
    }, (_command, result) => result);
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client,
      agentProvider: "codex",
      verifiedAttestationSink: { record },
    });
    const input = readerSummaryInput();
    const route = adapter.route(input, {
      preferredProvider: "agent-runtime",
      maxInputTokens: 24_000,
      maxOutputTokens: 16_000,
      maxEstimatedCostUsd: 1,
    }, { remainingTokens: 40_000, remainingCostUsd: 1 });

    await expect(adapter.generate(input, route)).rejects.toThrow(
      "Reader summary execution attestation is invalid",
    );
    expect(client.commands).toHaveLength(1);
    expect(record).not.toHaveBeenCalled();
  });

  it("propagates an attestation sink rejection without dispatching repair", async () => {
    const record = jest.fn(() => {
      throw new Error("synthetic attestation persistence failure");
    });
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: validReaderProviderDraft(),
      warnings: [],
    });
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client,
      agentProvider: "codex",
      verifiedAttestationSink: { record },
    });
    const input = readerSummaryInput();
    const route = adapter.route(input, {
      preferredProvider: "agent-runtime",
      maxInputTokens: 24_000,
      maxOutputTokens: 16_000,
      maxEstimatedCostUsd: 1,
    }, { remainingTokens: 40_000, remainingCostUsd: 1 });

    await expect(adapter.generate(input, route)).rejects.toThrow(
      "synthetic attestation persistence failure",
    );
    expect(client.commands).toHaveLength(1);
    expect(record).toHaveBeenCalledTimes(1);
  });
  it("measures a physical attempt only after transport and falls back on invalid usage", async () => {
    const input = readerSummaryInput();
    const client = new CapturingAgentRuntimeClient({
      status: "completed", structuredOutput: validReaderProviderDraft(), warnings: [],
      usage: { inputTokens: -1, outputTokens: 3.5, totalTokens: 0, estimatedCostUsd: -0.01 },
    });
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
    const selectedRoute = adapter.route(input, {
      preferredProvider: "agent-runtime", maxInputTokens: 24_000,
      maxOutputTokens: 16_000, maxEstimatedCostUsd: 1,
    }, { remainingTokens: 40_000, remainingCostUsd: 1 });
    const command = buildAgentRuntimeReaderSummaryTaskCommand({
      input, selectedRoute, attempt: "primary", agentProvider: "codex",
      legacyRecovery: false, modelBackend: "openai-chatgpt",
      reasoningEffort: "high", model: "gpt-5.6-sol",
      maxOutputTokens: 16_000, timeoutMs: 600_000,
    });
    const estimate = jest.fn(() => {
      expect(client.commands).toEqual([command]);
      return { inputTokens: 300, outputTokens: 60, estimatedCostUsd: 0.11 };
    });
    const paid = await runAgentRuntimeReaderSummaryPaidAttempt({ client, input, command, estimate });
    expect(estimate).toHaveBeenCalledTimes(1);
    expect(paid.attemptUsage).toEqual({
      inputTokens: 300, outputTokens: 60, estimatedCostUsd: 0.11,
    });
    expect(paid.dailyGenerationReceipt).toBeUndefined();
    expect(paid.result.status).toBe("completed");
    expect(client.commands).toHaveLength(1);
  });

  it("does not estimate or accept usage on a rejected paid transport", async () => {
    const input = readerSummaryInput();
    const client = new CapturingAgentRuntimeClient({
      status: "completed", structuredOutput: validReaderProviderDraft(), warnings: [],
    }, () => { throw new Error("synthetic paid transport rejection"); });
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
    const selectedRoute = adapter.route(input, {
      preferredProvider: "agent-runtime", maxInputTokens: 24_000,
      maxOutputTokens: 16_000, maxEstimatedCostUsd: 1,
    }, { remainingTokens: 40_000, remainingCostUsd: 1 });
    const command = buildAgentRuntimeReaderSummaryTaskCommand({
      input, selectedRoute, attempt: "primary", agentProvider: "codex",
      legacyRecovery: false, modelBackend: "openai-chatgpt",
      reasoningEffort: "high", model: "gpt-5.6-sol",
      maxOutputTokens: 16_000, timeoutMs: 600_000,
    });
    const estimate = jest.fn(() => ({
      inputTokens: 300, outputTokens: 60, estimatedCostUsd: 0.11,
    }));
    await expect(runAgentRuntimeReaderSummaryPaidAttempt({
      client, input, command, estimate,
    })).rejects.toThrow("synthetic paid transport rejection");
    expect(client.commands).toEqual([command]);
    expect(estimate).not.toHaveBeenCalled();
  });
});
