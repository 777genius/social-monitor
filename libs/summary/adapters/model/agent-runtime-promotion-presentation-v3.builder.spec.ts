import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand } from "../../ports";
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

  it("fails closed for an unsupported runtime provider configuration", () => {
    expect(() => resolveAgentRuntimePromotionPresentationV3BuilderOptions({
      AGENT_RUNTIME_PROVIDER: "openai",
    }, new PresentationRuntimeClient())).toThrow();
  });
});

class PresentationRuntimeClient implements AgentRuntimeClientPort {
  readonly commands: AgentRuntimeTaskCommand[] = [];

  async runTask(command: AgentRuntimeTaskCommand) {
    this.commands.push(command);
    return {
      status: "completed" as const,
      structuredOutput: { presentations: [{
        candidateId: fixtureInput().candidateId,
        status: "available",
        kind: "claim",
        text: "Useful database method",
        support: [{ field: "bodyPreview", start: 0, end: 7, quote: "Useful " }],
        qualifications: [],
        confidence: 0.9,
        qualificationJudgment: "none",
      }] },
      warnings: [],
    };
  }

  async checkHealth() {
    return { status: "serving" as const, runtimeEngine: "test",
      runtimeVersion: "test", warnings: [] };
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
