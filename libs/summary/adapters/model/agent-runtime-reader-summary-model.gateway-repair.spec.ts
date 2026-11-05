import type { AgentRuntimeTaskResult } from "../../ports";
import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import {
  CapturingAgentRuntimeClient,
  readerSummaryInput,
  validReaderProviderDraft,
} from "./agent-runtime-reader-summary-model.spec-support";
import { gatewayLlmFailure } from "./gateway-llm/gateway-llm-failure";
import type { VerifiedReaderSummaryExecutionAttestation } from "./reader-summary-execution-attestation";
import { withTestGatewayExecutionAttestation } from "./reader-summary-execution-attestation.spec-support";

// What GatewayLlmClient returns when the strict decode rejects Kimi output.
const rejected = (all: readonly string[]): AgentRuntimeTaskResult => ({
  status: "failed", warnings: [], usage: { inputTokens: 56_000, outputTokens: 4_000, totalTokens: 60_000, estimatedCostUsd: 0 },
  failure: gatewayLlmFailure({ ok: false, code: "output_invalid", effect: "completed",
    retry: { kind: "new_attempt", afterMs: 0, mayDuplicateCost: true }, execution: null, usage: null,
    cleanup: "closed" }, { taskId: "sm-task", attempt: 1 }, { first: "$.topStories[0].summary:length", all }),
});
const completed = (): AgentRuntimeTaskResult => ({ status: "completed", warnings: [],
  structuredOutput: validReaderProviderDraft(),
  usage: { inputTokens: 56_500, outputTokens: 4_500, totalTokens: 61_000, estimatedCostUsd: 0 } });
const policy = { preferredProvider: "agent-runtime", maxInputTokens: 24_000, maxOutputTokens: 16_000,
  maxEstimatedCostUsd: 1 } as const;
const budget = { remainingTokens: 400_000, remainingCostUsd: 1 };
const kimi = (client: CapturingAgentRuntimeClient, captured: VerifiedReaderSummaryExecutionAttestation[] = []) =>
  new AgentRuntimeReaderSummaryModelAdapter({ client, modelBackend: "kimi-code", model: "k3-256k",
    verifiedAttestationSink: { record: (value) => { captured.push(value); } } });

describe("AgentRuntimeReaderSummaryModelAdapter on a gateway backend", () => {
  it("repairs a schema-rejected summary once, naming every broken path but no output", async () => {
    const violations = ["$.topStories[0].summary:maxLength=300", "$.headline:maxLength=160"];
    const client = new CapturingAgentRuntimeClient([rejected(violations), completed()],
      withTestGatewayExecutionAttestation);
    const captured: VerifiedReaderSummaryExecutionAttestation[] = [];
    const adapter = kimi(client, captured);
    const input = readerSummaryInput();

    const attempt = await adapter.generate(input, adapter.route(input, policy, budget));

    expect(client.commands).toHaveLength(2);
    expect(client.commands[0]?.systemPrompt).toContain("Hard limits.");
    expect(client.commands[0]?.systemPrompt).toContain("- $.topStories[].summary: at most 255 characters");
    expect(client.commands[0]?.systemPrompt).toContain("- $.confidence.score: a number from 0 to 1");
    expect(client.commands[0]?.systemPrompt).not.toMatch(/\$\.citationMap\[\]\.feedItemId:/u);
    expect(client.commands[1]).toMatchObject({ purpose: "social_monitor.reader_summary.repair.v2",
      metadata: expect.objectContaining({ attempt: "repair" }) });
    expect(client.commands[1]?.systemPrompt).toContain(
      "rejected by the output schema at: $.topStories[0].summary:maxLength=300; $.headline:maxLength=160.");
    expect(client.commands[1]?.systemPrompt).toContain("- $.topStories[].summary: at most 255 characters");
    expect(client.commands[1]?.systemPrompt).not.toContain("narrativeSections[0] must have kind lead");
    expect(captured).toEqual([expect.objectContaining({ taskRole: "summary", attempt: "repair" })]);
    // Both paid attempts count towards the logical run.
    expect(attempt.draft.usage).toMatchObject({ inputTokens: 112_500, outputTokens: 8_500 });
  });

  it("fails after the single repair when the repair is rejected too", async () => {
    const client = new CapturingAgentRuntimeClient(
      [rejected(["$.topStories[0].summary:maxLength=300"]), rejected(["$.topStories[1].summary:maxLength=300"])],
      withTestGatewayExecutionAttestation);
    const adapter = kimi(client);
    const input = readerSummaryInput();

    await expect(adapter.generate(input, adapter.route(input, policy, budget))).rejects.toThrow(
      "Provider output failed structured output validation at $.topStories[0].summary:length");
    expect(client.commands).toHaveLength(2);
  });

  it("repairs Codex through the gateway the same way, without the Kimi hard limits", async () => {
    const client = new CapturingAgentRuntimeClient([rejected(["$.headline:maxLength=160"]), completed()],
      withTestGatewayExecutionAttestation);
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
    const input = readerSummaryInput();

    await adapter.generate(input, adapter.route(input, policy, budget));
    expect(client.commands).toHaveLength(2);
    expect(client.commands[1]?.systemPrompt).toContain("rejected by the output schema at: $.headline:maxLength=160.");
    expect(client.commands.map((command) => command.systemPrompt.includes("Hard limits."))).toEqual([false, false]);
  });

  it("leaves a CLI runtime schema failure without a repair", async () => {
    // The CLI runtime enforces the schema itself and reports no violation list.
    const client = new CapturingAgentRuntimeClient({ status: "failed", warnings: [], failure: {
      code: "provider_output_invalid", safeMessage: "Structured output schema rejected", retryable: false,
      reconnectRequired: false, causeCategory: "output_schema", details: {
        outputValidationStage: "schema_normalization", outputValidationCode: "schema_normalization_failed" } } });
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
    const input = readerSummaryInput();

    await expect(adapter.generate(input, adapter.route(input, policy, budget))).rejects.toThrow(
      "Structured output schema rejected");
    expect(client.commands).toHaveLength(1);
    expect(client.commands[0]?.systemPrompt).not.toContain("Hard limits.");
  });
});
