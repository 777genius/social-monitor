import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import { resolveAgentRuntimeReaderSummaryRuntimeSettings } from "./agent-runtime-reader-summary-runtime-settings";
import {
  admitAgentRuntimeReaderSummaryRoute,
  estimateAgentRuntimeReaderSummaryUsage,
} from "./agent-runtime-reader-summary-route-admission";
import {
  CapturingAgentRuntimeClient,
  readerSummaryInput,
  validReaderProviderDraft,
} from "./agent-runtime-reader-summary-model.spec-support";
import { currentReaderSummaryPromptRelease } from "./openai-responses-reader-summary-prompt";

describe("Agent Runtime reader summary route admission", () => {
  const policy = {
    preferredProvider: "agent-runtime" as const,
    maxInputTokens: 24_000,
    maxOutputTokens: 16_000,
    maxEstimatedCostUsd: 1,
  };
  const budget = { remainingTokens: 40_000, remainingCostUsd: 1 };

  const makeAdapter = () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: validReaderProviderDraft(),
      warnings: [],
    });
    const options = { client, agentProvider: "codex" as const };
    return {
      client,
      adapter: new AgentRuntimeReaderSummaryModelAdapter(options),
      settings: resolveAgentRuntimeReaderSummaryRuntimeSettings(options),
    };
  };

  it("keeps direct route and estimate policy identical to adapter delegation", () => {
    const { client, adapter, settings } = makeAdapter();
    const input = readerSummaryInput();
    const snapshot = JSON.stringify(input);

    const route = admitAgentRuntimeReaderSummaryRoute({ input, policy, budget, settings });

    expect(route).toEqual(adapter.route(input, policy, budget));
    expect(route.model).toBe("codex:gpt-5.6-sol:high");
    expect(route.promptVersion).toBe(currentReaderSummaryPromptRelease.id);
    expect(route.schemaVersion).toBe("reader_summary.artifact.v1");
    expect(estimateAgentRuntimeReaderSummaryUsage({
      input, selectedRoute: route, settings,
    })).toEqual(adapter.estimate(input, route));
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(client.commands).toEqual([]);
  });

  it("rejects insufficient request or remaining budgets before provider dispatch", () => {
    const { client, adapter, settings } = makeAdapter();
    const input = readerSummaryInput();
    const rejects = [
      { policy: { ...policy, maxInputTokens: 0 }, budget },
      { policy, budget: { ...budget, remainingTokens: 0 } },
      { policy, budget: { ...budget, remainingCostUsd: -1 } },
    ];
    for (const caseBudget of rejects) {
      expect(() => admitAgentRuntimeReaderSummaryRoute({
        input, settings, ...caseBudget,
      })).toThrow("Reader summary model budget exceeded");
      expect(() => adapter.route(input, caseBudget.policy, caseBudget.budget))
        .toThrow("Reader summary model budget exceeded");
    }
    expect(client.commands).toEqual([]);
  });
});
