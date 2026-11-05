import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";
import { buildReaderSummaryTopicMap } from "../../domain/services/reader-summary-topic-map-builder";
import { reconcileVerifiedReaderSummaryTopicRelations } from "../../domain/services/reader-summary-topic-relation-reconciliation";
import { AgentRuntimeReaderSummaryTopicLabeler } from "./agent-runtime-reader-summary-topic-labeler.adapter";
import { AgentRuntimeReaderSummaryTopicRelationVerifier } from "./agent-runtime-reader-summary-topic-relation-verifier.adapter";
import type { VerifiedReaderSummaryExecutionAttestation } from "./reader-summary-execution-attestation";
import { withTestExecutionAttestation } from "./reader-summary-execution-attestation.spec-support";
import { topicIntegrityFixture } from "./agent-runtime-reader-summary-topic-integrity.spec-support";

const pair = { sourceNodeId: "topic:story:checkpoint-0", targetNodeId: "topic:story:checkpoint-1", sharedTerms: ["beacon"] };
const fixtureInput = () => {
  const fixture = topicIntegrityFixture(["Beacon", "Beacon"]);
  return {
    ...fixture,
    input: {
      ...fixture.params,
      candidates: fixture.candidates,
      tenantId: tenantId("test-topic-integrity"),
      workspaceId: workspaceId("test-topic-integrity"),
      scope: { type: "workspace" as const },
      requestedAt: new Date("2026-09-06T00:00:00Z"),
      period: {
        cadence: "daily" as const,
        startedAt: new Date("2026-09-05T00:00:00Z"),
        endedAt: new Date("2026-09-06T00:00:00Z"),
        timezone: "UTC", periodKey: "test-topic-integrity",
      },
    },
  };
};
const fakeClient = (
  output: Record<string, unknown>,
  mutate: (result: AgentRuntimeTaskResult) => AgentRuntimeTaskResult = (result) => result,
) => {
  const commands: AgentRuntimeTaskCommand[] = [];
  const client: AgentRuntimeClientPort = {
    async runTask(command) {
      commands.push(command);
      return mutate(withTestExecutionAttestation(command, {
        status: "completed", structuredOutput: output, warnings: [],
      }));
    },
    async checkHealth() { throw new Error("No runtime health calls allowed in this offline fixture"); },
  };
  return { client, commands };
};

describe("topic integrity provenance at the model boundary", () => {
  it.each([false, true])("binds normalized output and decisions before deriving sameTopic=%s identity", async (sameTopic) => {
    const fixture = fixtureInput();
    const labelClient = fakeClient({
      nodeLabels: fixture.rawLabels.map((label) => ({
        ...label,
        relationIdentity: { source: "topic-relation-reconciliation", canonicalNodeId: "forged" },
      })), groups: [],
    });
    const attestations: VerifiedReaderSummaryExecutionAttestation[] = [];
    const sink = { record: (value: VerifiedReaderSummaryExecutionAttestation) => { attestations.push(value); } };
    const labeler = new AgentRuntimeReaderSummaryTopicLabeler({ client: labelClient.client, verifiedAttestationSink: sink });
    const plan = await labeler.label(fixture.input);
    expect(plan.nodeLabels.every((label) => label.relationIdentity === undefined)).toBe(true);
    expect(attestations[0]?.normalizedOutputSha256).toBe(canonicalJsonSha256(plan));
    const relationClient = fakeClient({ decisions: [{ ...pair, sameTopic, confidenceScore: 0.99 }] });
    const verifier = new AgentRuntimeReaderSummaryTopicRelationVerifier({ client: relationClient.client, verifiedAttestationSink: sink });
    const decisions = await verifier.verify({ ...fixture.input, labelPlan: plan, relations: [pair] });
    expect(attestations[1]?.normalizedOutputSha256).toBe(canonicalJsonSha256(decisions));
    expect(attestations.map((item) => item.taskRole)).toEqual(["topic_label", "topic_relation"]);
    const verified = reconcileVerifiedReaderSummaryTopicRelations({ labelPlan: plan, candidates: [pair], decisions });
    expect(buildReaderSummaryTopicMap({ ...fixture.params, labelPlan: verified }).nodes).toHaveLength(sameTopic ? 1 : 2);
    for (const command of [...labelClient.commands, ...relationClient.commands]) {
      expect(command.controls).toMatchObject({ model: "gpt-5.6-sol", reasoningEffort: "high" });
    }
    expect(labelClient.commands).toHaveLength(1);
    expect(relationClient.commands).toHaveLength(1);
  });

  it.each(["missing", "tampered"])("rejects %s execution attestation before admitting relation decisions", async (mode) => {
    const fixture = fixtureInput();
    const labelClient = fakeClient({ nodeLabels: fixture.rawLabels, groups: [] });
    const plan = await new AgentRuntimeReaderSummaryTopicLabeler({ client: labelClient.client }).label(fixture.input);
    const relationClient = fakeClient({ decisions: [{ ...pair, sameTopic: true, confidenceScore: 0.99 }] }, (result) =>
      mode === "missing" ? { ...result, executionAttestation: undefined }
        : { ...result, structuredOutput: { decisions: [{ ...pair, sameTopic: false, confidenceScore: 0.99 }] } },
    );
    const attestations: VerifiedReaderSummaryExecutionAttestation[] = [];
    const verifier = new AgentRuntimeReaderSummaryTopicRelationVerifier({
      client: relationClient.client,
      verifiedAttestationSink: { record: (value) => { attestations.push(value); } },
    });
    await expect(verifier.verify({ ...fixture.input, labelPlan: plan, relations: [pair] })).rejects.toThrow("execution attestation is invalid");
    expect(attestations).toHaveLength(0);
    expect(relationClient.commands).toHaveLength(1);
  });
});
