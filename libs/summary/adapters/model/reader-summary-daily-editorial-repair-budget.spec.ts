import { gatewayLlmFailure } from "./gateway-llm/gateway-llm-failure";
import { validateDailyEditorialPlan, dailyEditorialCoveragePlan } from "../../domain";
import { generateReaderSummaryWithDailyEditor } from "../../features/execute-reader-summary-job/reader-summary-daily-editorial-generation";
import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import { CapturingAgentRuntimeClient } from "./agent-runtime-reader-summary-model.spec-support";
import { dailyDigestFixture, dailyProviderDraft } from "./reader-summary-daily-digest.fixture";

it("charges an editorial writer repair against the combined model budget", async () => {
  const { input, evidence } = await dailyDigestFixture();
  const rawPlan = { version: "reader_summary.daily_editorial.v2",
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

it.each([
  { limit: "tokens", budget: { remainingTokens: 30000, remainingCostUsd: 10 },
    primaryUsage: { inputTokens: 29900, outputTokens: 100, totalTokens: 30000, estimatedCostUsd: 0 } },
  { limit: "cost", budget: { remainingTokens: 100000, remainingCostUsd: 0.6 },
    primaryUsage: { inputTokens: 200, outputTokens: 200, totalTokens: 400, estimatedCostUsd: 0.55 } },
])("avoids a paid repair when an invalid writer exhausts the shared $limit budget", async ({ budget, primaryUsage }) => {
  const { input, evidence } = await dailyDigestFixture();
  const rawPlan = { version: "reader_summary.daily_editorial.v2",
    topics: [{ title: "Blocked repair", why: "Source-bound topic",
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
    }, warnings: [], usage: primaryUsage },
    { status: "completed", structuredOutput: dailyProviderDraft(writer), warnings: [] },
  ]);
  const model = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  await expect(generateReaderSummaryWithDailyEditor({
    model, input,
    policy: { preferredProvider: "agent-runtime", maxInputTokens: 100000,
      maxOutputTokens: 16000, maxEstimatedCostUsd: 5 },
    budget,
  })).rejects.toThrow("Daily editorial writer cannot repair within the shared model budget");
  expect(client.commands).toHaveLength(2);
  expect(client.commands[1]!.metadata?.attempt).toBe("primary");
});

it("does not pay for a schema-rejected daily writer repair after budget exhaustion", async () => {
  const { input, evidence } = await dailyDigestFixture();
  const rawPlan = { version: "reader_summary.daily_editorial.v2",
    topics: [{ title: "Gateway schema failure", why: "Frozen source-bound topic",
      depth: "detailed", feedItemIds: [evidence.dailyGenerationInput!.selected[19]!.feedItemId] }] };
  const client = new CapturingAgentRuntimeClient([
    { status: "completed", structuredOutput: rawPlan, warnings: [],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.1 } },
    { status: "failed", warnings: [],
      failure: gatewayLlmFailure({ ok: false, code: "output_invalid", effect: "completed",
        retry: { kind: "new_attempt", afterMs: 0, mayDuplicateCost: true },
        execution: null, usage: null, cleanup: "closed" },
      { taskId: "daily-writer", attempt: 1 },
      { first: "$.headline:maxLength", all: ["$.headline:maxLength=160"] }),
      usage: { inputTokens: 200, outputTokens: 200, totalTokens: 400, estimatedCostUsd: 0.55 } },
  ]);
  const model = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  await expect(generateReaderSummaryWithDailyEditor({
    model, input,
    policy: { preferredProvider: "agent-runtime", maxInputTokens: 100000,
      maxOutputTokens: 16000, maxEstimatedCostUsd: 5 },
    budget: { remainingTokens: 100000, remainingCostUsd: 0.6 },
  })).rejects.toThrow("Daily editorial writer cannot repair within the shared model budget");
  expect(client.commands).toHaveLength(2);
  expect(client.commands[1]!.metadata?.attempt).toBe("primary");
});

it("rejects a legacy model response to a new synthesis request before the writer dispatch", async () => {
  const {input,evidence}=await dailyDigestFixture();
  const client=new CapturingAgentRuntimeClient([{status:"completed",structuredOutput:{version:"reader_summary.daily_editorial.v1",
    topics:[{title:"Old event plan",why:"Old contract",depth:"detailed",feedItemIds:[evidence.dailyGenerationInput!.selected[0]!.feedItemId]}]},warnings:[]}]);
  const model=new AgentRuntimeReaderSummaryModelAdapter({client,agentProvider:"codex"});
  await expect(generateReaderSummaryWithDailyEditor({model,input,
    policy:{preferredProvider:"agent-runtime",maxInputTokens:100000,maxOutputTokens:16000,maxEstimatedCostUsd:5},
    budget:{remainingTokens:100000,remainingCostUsd:5}})).rejects.toThrow("legacy plan for a synthesis request");
  expect(client.commands).toHaveLength(1);
  expect(client.commands[0]!.controls?.schemaVersion).toBe("reader_summary.daily_editorial.v2");
});
