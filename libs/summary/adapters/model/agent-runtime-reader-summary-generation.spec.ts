import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
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
});
