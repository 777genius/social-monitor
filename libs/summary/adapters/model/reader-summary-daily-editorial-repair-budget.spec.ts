import { validateDailyEditorialPlan, dailyEditorialCoveragePlan } from "../../domain";
import { generateReaderSummaryWithDailyEditor } from "../../features/execute-reader-summary-job/reader-summary-daily-editorial-generation";
import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import { CapturingAgentRuntimeClient } from "./agent-runtime-reader-summary-model.spec-support";
import { dailyDigestFixture, dailyProviderDraft } from "./reader-summary-daily-digest.fixture";

it("charges an editorial writer repair against the combined model budget", async () => {
  const { input, evidence } = await dailyDigestFixture();
  const rawPlan = { version: "reader_summary.daily_editorial.v1",
    topics: [{ title: "Repair budget", why: "One frozen source-bound topic",
      depth: "detailed", feedItemIds: [evidence.dailyGenerationInput!.selected[19]!.feedItemId] }] };
  const plan = validateDailyEditorialPlan(rawPlan, evidence.dailyGenerationInput!);
  const writer = { ...input, dailyEditorialPlan: plan,
    coveragePlan: dailyEditorialCoveragePlan(plan, evidence),
    policy: { ...input.policy, maxStories: 1 } };
  const client = new CapturingAgentRuntimeClient([
    { status: "completed", structuredOutput: rawPlan, warnings: [],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.1 } },
    { status: "completed", structuredOutput: {
      ...dailyProviderDraft(writer), narrativeSections: [],
    }, warnings: [],
    usage: { inputTokens: 200, outputTokens: 200, totalTokens: 400, estimatedCostUsd: 0.3 } },
    { status: "completed", structuredOutput: dailyProviderDraft(writer), warnings: [],
      usage: { inputTokens: 200, outputTokens: 200, totalTokens: 400, estimatedCostUsd: 0.3 } },
  ]);
  const model = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  await expect(generateReaderSummaryWithDailyEditor({
    model, input,
    policy: { preferredProvider: "agent-runtime", maxInputTokens: 100000,
      maxOutputTokens: 16000, maxEstimatedCostUsd: 5 },
    budget: { remainingTokens: 100000, remainingCostUsd: 0.6 },
  })).rejects.toThrow("Daily editorial writer exceeded the shared model budget");
  expect(client.commands).toHaveLength(3);
  expect(client.commands[0]!.purpose).toBe("social_monitor.reader_summary.daily_editorial.plan.v1");
  expect(client.commands[1]!.metadata?.attempt).toBe("primary");
  expect(client.commands[2]!.metadata?.attempt).toBe("repair");
});
