import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import { CapturingAgentRuntimeClient } from "./agent-runtime-reader-summary-model.spec-support";
import { dailyDigestFixture } from "./reader-summary-daily-digest.fixture";
import { readFailedDailyEditorUsage } from "./reader-summary-failed-daily-editor-usage";
import { gatewayLlmLocalFailure } from "./gateway-llm/gateway-llm-failure";

const routePolicy = {
  preferredProvider: "agent-runtime",
  maxInputTokens: 1_000_000,
  maxOutputTokens: 16_000,
  maxEstimatedCostUsd: 5,
};
const routeBudget = { remainingTokens: 1_000_000, remainingCostUsd: 5 };

it("keeps the exact scoped daily-editorial request and verifies the returned plan", async () => {
  const { input, evidence } = await dailyDigestFixture();
  const rawPlan = { version: "reader_summary.daily_editorial.v2",
    topics: [{ title: "Specific daily development", why: "One grounded source-backed event",
      depth: "detailed", feedItemIds: [evidence.dailyGenerationInput!.selected[19]!.feedItemId] }] };
  const client = new CapturingAgentRuntimeClient([
    { status: "completed", structuredOutput: rawPlan, warnings: [],
      usage: { inputTokens: 12, outputTokens: 34, totalTokens: 46, estimatedCostUsd: 0.02 } },
  ]);
  const records: unknown[] = [];
  const model = new AgentRuntimeReaderSummaryModelAdapter({
    client, agentProvider: "codex",
    verifiedAttestationSink: { record: (value) => { records.push(value); } },
  });
  const route = model.route(input, routePolicy, routeBudget);
  const attempt = await model.planDaily(input, route);
  const command = client.commands[0]!;
  expect(command.purpose).toBe("social_monitor.reader_summary.daily_editorial.plan.v1");
  expect(command.tenantId).toBe(input.tenantId);
  expect(command.workspaceId).toBe(input.workspaceId);
  expect(command.controls).toMatchObject({
    outputSchemaName: "social_monitor_daily_editorial_plan",
    schemaVersion: "reader_summary.daily_editorial.v2",
    maxOutputTokens: 3000,
  });
  expect(command.metadata?.promptVersion).toBe("reader_summary.daily_editorial.v2");
  expect(attempt.plan.version).toBe("reader_summary.daily_editorial.v2");
  expect(attempt.usage).toEqual({ inputTokens: 12, outputTokens: 34, estimatedCostUsd: 0.02 });
  expect(attempt.editorRequestSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(attempt.editorOutputSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(records).toHaveLength(1);
});

it("rejects a legacy daily-editor response and preserves paid-failure usage", async () => {
  const { input, evidence } = await dailyDigestFixture();
  const client = new CapturingAgentRuntimeClient([
    { status: "completed", structuredOutput: {
      version: "reader_summary.daily_editorial.v1",
      topics: [{ title: "Old plan", why: "Legacy plan",
        depth: "detailed", feedItemIds: [evidence.dailyGenerationInput!.selected[19]!.feedItemId] }],
    }, warnings: [], usage: {
      inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0.01,
    } },
  ]);
  const model = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  const route = model.route(input, routePolicy, routeBudget);
  let rejected: unknown;
  try {
    await model.planDaily(input, route);
  } catch (error) {
    rejected = error;
  }
  expect(rejected).toBeInstanceOf(Error);
  expect((rejected as Error).message).toContain("legacy plan for a synthesis request");
  expect(readFailedDailyEditorUsage(rejected)).toEqual({
    inputTokens: 10, outputTokens: 20, estimatedCostUsd: 0.01,
  });
  expect(client.commands).toHaveLength(1);
});

it("does not charge a predispatch gateway rejection even when it carries estimated usage", async () => {
  const { input } = await dailyDigestFixture();
  const client = new CapturingAgentRuntimeClient([
    { status: "failed", warnings: [],
      failure: gatewayLlmLocalFailure("invalid_schema", "Synthetic predispatch rejection"),
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0.01 } },
  ]);
  const model = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  const route = model.route(input, routePolicy, routeBudget);
  let rejected: unknown;
  try {
    await model.planDaily(input, route);
  } catch (error) {
    rejected = error;
  }
  expect(rejected).toBeInstanceOf(Error);
  expect(readFailedDailyEditorUsage(rejected)).toBeUndefined();
  expect(client.commands).toHaveLength(1);
});
