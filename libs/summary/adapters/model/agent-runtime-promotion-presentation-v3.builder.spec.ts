import { withTestExecutionAttestation } from "./reader-summary-execution-attestation.spec-support";
import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";
import {
  AgentRuntimePromotionPresentationV3Builder,
  resolveAgentRuntimePromotionPresentationV3BuilderOptions,
} from "./agent-runtime-promotion-presentation-v3.builder";

describe("AgentRuntimePromotionPresentationV3Builder", () => {
  it("uses the configured runtime provider without sending private interest text", async () => {
    const client = new PresentationRuntimeClient();
    const input = fixtureInput();
    const builder = new AgentRuntimePromotionPresentationV3Builder({
      client,
      agentProvider: "codex",
      model: "gpt-5.6-sol",
      timeoutMs: 1_234,
    });

    const result = await builder.build([input]);

    expect(result[0]).toMatchObject({ status: "available" });
    expect(client.commands[0]).toMatchObject({
      provider: "codex",
      purpose: "social_monitor.reader_summary.promotion_presentation.v3",
      timeoutMs: 1_234,
      controls: expect.objectContaining({ model: "gpt-5.6-sol" }),
    });
    expect(client.commands[0]?.prompt).not.toContain(input.trustedIntent);
  });

  it("uses MiMo for V3 presentation when the daily backend is MiMo", async () => {
    const client = new AttestedPresentationRuntimeClient();
    const builder = new AgentRuntimePromotionPresentationV3Builder(
      resolveAgentRuntimePromotionPresentationV3BuilderOptions({
        AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
        AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.6-sol",
      }, client));
    expect((await builder.build([fixtureInput()]))[0]).toMatchObject({ status: "available" });
    expect(client.commands[0]?.controls).toMatchObject({
      model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan",
      reasoningEffort: "high", outputSchemaName: "social_monitor_reader_post_presentation_v3",
      schemaVersion: "reader_post_presentation.v3",
    });
  });

  it("isolates MiMo identity from Codex without changing exact MiMo retries", async () => {
    const client = new AttestedPresentationRuntimeClient();
    const codex = new AgentRuntimePromotionPresentationV3Builder({ client });
    const mimo = new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan", model: "mimo-v2.6-pro" });
    await codex.build([fixtureInput()]);
    await mimo.build([fixtureInput()]);
    await mimo.build([fixtureInput()]);
    expect(client.commands[0]?.requestId).not.toBe(client.commands[1]?.requestId);
    expect(client.commands[1]?.requestId).toBe(client.commands[2]?.requestId);
  });

  it("refuses MiMo output without physical execution attestation", async () => {
    const builder = new AgentRuntimePromotionPresentationV3Builder({
      client: new PresentationRuntimeClient(), modelBackend: "xiaomi-mimo-token-plan" });
    await expect(builder.build([fixtureInput()])).rejects.toThrow("execution attestation is invalid");
  });

  it("rejects a fallback model attestation before sealing a headline", async () => {
    const client = new AttestedPresentationRuntimeClient();
    const original = client.runTask.bind(client);
    jest.spyOn(client, "runTask").mockImplementation(async command => {
      const result = await original(command);
      return { ...result, executionAttestation: {
        ...result.executionAttestation!, model: "gpt-5.6-sol",
      } };
    });
    const builder = new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan" });
    await expect(builder.build([fixtureInput()])).rejects.toThrow("execution attestation is invalid");
  });

  it("rejects a conflicting presentation model under MiMo", () => {
    expect(() => resolveAgentRuntimePromotionPresentationV3BuilderOptions({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
      AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_MODEL: "gpt-5.6-sol",
    }, new PresentationRuntimeClient())).toThrow("conflicts with purpose policy");
  });

  it("fails closed for an unsupported runtime provider configuration", () => {
    expect(() => resolveAgentRuntimePromotionPresentationV3BuilderOptions({
      AGENT_RUNTIME_PROVIDER: "openai",
    }, new PresentationRuntimeClient())).toThrow();
  });

  it("keeps exact retries idempotent but isolates changed batches and source revisions", async () => {
    const client = new PresentationRuntimeClient();
    const builder = new AgentRuntimePromotionPresentationV3Builder({ client });
    const first = fixtureInput();
    const second = { ...fixtureInput(), candidateId: "00000000-0000-4000-8000-000000000007" };

    await builder.build([first]);
    await builder.build([first]);
    await builder.build([first, second]);
    await builder.build([{ ...first, sourceSnapshotSha256: "2".repeat(64) }]);

    expect(client.commands[0]?.requestId).toBe(client.commands[1]?.requestId);
    expect(client.commands[0]?.requestId).not.toBe(client.commands[2]?.requestId);
    expect(client.commands[0]?.requestId).not.toBe(client.commands[3]?.requestId);
    expect(client.commands[0]?.correlationId).not.toBe(client.commands[2]?.correlationId);
    expect(client.commands.every((command) => !command.requestId.includes(first.trustedIntent)))
      .toBe(true);
  });
});

class PresentationRuntimeClient implements AgentRuntimeClientPort {
  readonly commands: AgentRuntimeTaskCommand[] = [];

  async runTask(command: AgentRuntimeTaskCommand): Promise<AgentRuntimeTaskResult> {
    this.commands.push(command);
    const parsed = JSON.parse(command.prompt) as { candidates: { candidateId: string }[] };
    return {
      status: "completed" as const,
      structuredOutput: { presentations: parsed.candidates.map(({ candidateId }) => ({
        candidateId,
        status: "available",
        kind: "claim",
        text: "Useful database method",
        support: [{ field: "bodyPreview", start: 0, end: 7, quote: "Useful " }],
        qualifications: [],
        confidence: 0.9,
        qualificationJudgment: "none",
      })) },
      warnings: [],
    };
  }

  async checkHealth() {
    return { status: "serving" as const, runtimeEngine: "test",
      runtimeVersion: "test", warnings: [] };
  }
}

class AttestedPresentationRuntimeClient extends PresentationRuntimeClient {
  override async runTask(command: AgentRuntimeTaskCommand) {
    return withTestExecutionAttestation(command, await super.runTask(command));
  }
}

const fixtureInput = () => ({
  tenantId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  interestId: "00000000-0000-4000-8000-000000000003",
  candidateId: "00000000-0000-4000-8000-000000000004",
  sourceItemId: "00000000-0000-4000-8000-000000000005",
  sourceBindingId: "00000000-0000-4000-8000-000000000006",
  providerKey: "rss",
  trustedIntent: "private workspace research interest",
  sourceSnapshotSha256: "1".repeat(64),
  title: "Useful database method",
  body: "Useful body source.",
  captureComplete: true,
});
