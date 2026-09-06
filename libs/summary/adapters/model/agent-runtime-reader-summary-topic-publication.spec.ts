import Ajv from "ajv";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand, ReaderSummaryTopicMapPublicationRejection } from "../../ports";
import { BuildReaderSummaryTopicMapUseCase } from "../../features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import { evaluateReaderSummaryTopicMapStructure } from "../../domain/policies/reader-summary-topic-map-structure-quality";
import { AgentRuntimeReaderSummaryTopicLabeler } from "./agent-runtime-reader-summary-topic-labeler.adapter";
import { AgentRuntimeReaderSummaryTopicRelationVerifier } from "./agent-runtime-reader-summary-topic-relation-verifier.adapter";
import type { VerifiedReaderSummaryExecutionAttestation } from "./reader-summary-execution-attestation";
import { withTestExecutionAttestation } from "./reader-summary-execution-attestation.spec-support";
import { reviewPublicationFixture } from "./agent-runtime-reader-summary-topic-publication.spec-support";

const runPublication = async (
  fixture: ReturnType<typeof reviewPublicationFixture>,
  sameTopic: (source: string, target: string) => boolean = () => false,
) => {
  const commands: AgentRuntimeTaskCommand[] = [];
  const attestations: VerifiedReaderSummaryExecutionAttestation[] = [];
  const rejections: ReaderSummaryTopicMapPublicationRejection[] = [];
  const client = (output: (command: AgentRuntimeTaskCommand) => Record<string, unknown>): AgentRuntimeClientPort => ({
    async runTask(command) {
      commands.push(command);
      return withTestExecutionAttestation(command, { status: "completed", structuredOutput: output(command), warnings: [] });
    },
    async checkHealth() { throw new Error("Live calls forbidden in synthetic review fixtures"); },
  });
  const sink = { record(value: VerifiedReaderSummaryExecutionAttestation) { attestations.push(value); } };
  const labeler = new AgentRuntimeReaderSummaryTopicLabeler({ client: client(() => fixture.raw), verifiedAttestationSink: sink });
  const verifier = new AgentRuntimeReaderSummaryTopicRelationVerifier({
    client: client((command) => {
      const prompt = JSON.parse(command.prompt) as { pairs: { sourceNodeId: string; targetNodeId: string }[] };
      return { decisions: prompt.pairs.map((pair) => ({
        sourceNodeId: pair.sourceNodeId, targetNodeId: pair.targetNodeId,
        sameTopic: sameTopic(pair.sourceNodeId, pair.targetNodeId), confidenceScore: 0.99,
        rationale: "Synthetic relation decision for publication regression",
      })) };
    }), verifiedAttestationSink: sink,
  });
  const labeling = jest.spyOn(labeler, "label");
  const verification = jest.spyOn(verifier, "verify");
  const result = await new BuildReaderSummaryTopicMapUseCase({
    mode: "agent-runtime", labeler, relationVerifier: verifier,
    publicationAudit: { async recordRejectedCandidate(value) { rejections.push(value); } },
  }).execute(fixture.input);
  const plans = await Promise.all(labeling.mock.results.map((call) => call.value as ReturnType<typeof labeler.label>));
  const decisions = await Promise.all(verification.mock.results.map((call) => call.value as ReturnType<typeof verifier.verify>));
  expect(plans.length).toBeGreaterThan(0);
  expect(decisions).toHaveLength(plans.length);
  expect(attestations).toHaveLength(plans.length * 2);
  plans.forEach((plan, index) => {
    expect(attestations[index * 2]?.normalizedOutputSha256).toBe(canonicalJsonSha256(plan));
    expect(attestations[index * 2 + 1]?.normalizedOutputSha256).toBe(canonicalJsonSha256(decisions[index]));
    expect(plan.nodeLabels.map((label) => label.topicId)).toEqual(fixture.raw.nodeLabels.map((label) => label.topicId));
  });
  for (const command of commands) expect(command.controls).toMatchObject({ model: "gpt-5.6-sol", reasoningEffort: "high" });
  expect(labeling.mock.calls[0]![0].candidates.map((candidate) => candidate.fallbackLabel)).toEqual(fixture.input.selectedEvidence.map((item) => item.title));
  return { result, plans, rejections, commands };
};

describe("reviewer full publication inputs through actual use case and adapters", () => {
  it.each(["conflict", "low-confidence"] as const)("rejects %s at 3/8 on both attempts instead of resurrecting the excluded assignment", async (kind) => {
    const fixture = reviewPublicationFixture(kind);
    const { result, plans, rejections } = await runPublication(fixture);
    expect(result.ok).toBe(false);
    expect(plans).toHaveLength(2);
    expect(rejections).toHaveLength(2);
    const excluded = kind === "conflict" ? 2 : 3;
    for (const [index, rejection] of rejections.entries()) {
      expect(plans[index]!.nodeLabels[excluded]!.groupId).toBe("group:ungrouped");
      expect(rejection).toMatchObject({ minimumGroupedCoverage: 0.5, attemptNumber: index + 1, willRetry: index === 0 });
      expect(rejection.structureQuality).toMatchObject({ passed: true, metrics: { nodeCount: 8, groupedCoverage: 0.375 } });
      expect(rejection.topicMap.nodes[excluded]!.groupId).toBe("group:ungrouped");
      expect(rejection.topicMap.nodes.flatMap((node) => node.citationIds)).toEqual(fixture.input.citationMap.map((citation) => citation.citationId));
    }
  });

  it("preserves benign 3+1 completion exactly at the unchanged .5 publication threshold", async () => {
    const { result, plans, rejections } = await runPublication(reviewPublicationFixture("complete"));
    expect(rejections).toHaveLength(0);
    expect(plans).toHaveLength(1);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(evaluateReaderSummaryTopicMapStructure(result.value)).toMatchObject({ passed: true, metrics: { nodeCount: 8, groupedCoverage: 0.5 } });
    expect(result.value.nodes.slice(0, 4).every((node) => node.groupId === "group:orion" && node.keywords[0] === "Orion" && node.keywords.length === 8)).toBe(true);
  });

  it("retains conflicting member lineage when verified positive identity merges its display node", async () => {
    const fixture = reviewPublicationFixture("conflict");
    fixture.raw.nodeLabels[2]!.subject = "Orion Beacon";
    const pair = [fixture.raw.nodeLabels[0]!.nodeId, fixture.raw.nodeLabels[2]!.nodeId];
    const { result, rejections } = await runPublication(fixture, (source, target) => pair.includes(source) && pair.includes(target));
    expect(result.ok).toBe(false);
    expect(rejections).toHaveLength(2);
    for (const { topicMap } of rejections) {
      expect(topicMap.nodes).toHaveLength(7);
      expect(topicMap.nodes.find((node) => node.storyClusterIds.includes("story:review-2"))).toMatchObject({
        groupId: "group:ungrouped", storyClusterIds: ["story:review-0", "story:review-2"],
      });
    }
  });

  it("derives assignment lineage from the actual assignment despite a forged model lineage field", async () => {
    const fixture = reviewPublicationFixture("conflict");
    Object.assign(fixture.raw.nodeLabels[2]!, { originalGroupId: "group:orion" });
    const { result, plans } = await runPublication(fixture);
    expect(result.ok).toBe(false);
    expect(plans[0]!.nodeLabels[2]!.originalGroupId).toBe("group:quartz");
  });

  it.each(["xAI", undefined, "Orion", "RSS", "", " \t "])("publishes recovered xAI with accepted grounded group display (proposed: %s)", async (proposed) => {
    const fixture = reviewPublicationFixture("xai");
    if (proposed === undefined) fixture.raw.groups = [];
    else fixture.raw.groups[0]!.label = proposed;
    const { result, plans, rejections, commands } = await runPublication(fixture);
    const validate = new Ajv({ allErrors: true }).compile(commands[0]!.outputSchema);
    // Omitted definitions are an existing adversarial control; RSS/empty are schema-valid.
    expect(validate(fixture.raw)).toBe(proposed !== undefined);
    expect(plans[0]!.groups[0]!.recoveredDisplayLabel).toBe("Xai");
    expect(result.ok).toBe(true);
    expect(rejections).toHaveLength(0);
    expect(plans).toHaveLength(1);
    if (!result.ok) throw result.error;
    expect(evaluateReaderSummaryTopicMapStructure(result.value)).toMatchObject({ passed: true, metrics: { nodeCount: 2, groupedCoverage: 1, invalidSemanticGroupLabelCount: 0 } });
    expect(result.value.groups[0]).toMatchObject({ id: "group:xai", label: "Xai" });
    expect(result.value.nodes.every((node) => node.groupId === "group:xai" && node.keywords[0] === "Xai" && node.keywords.length === 8)).toBe(true);
    expect(result.value.nodes.map((node) => node.storyClusterIds)).toEqual(fixture.input.clusters.map((cluster) => [cluster.id]));
    expect(result.value.nodes.flatMap((node) => node.citationIds)).toEqual(fixture.input.citationMap.map((citation) => citation.citationId));
  });

  it.each(["RSS", ""])("ignores a forged recovered display when no trusted cohort supports primary %j", async (label) => {
    const fixture = reviewPublicationFixture("xai");
    fixture.input = {
      ...fixture.input,
      selectedEvidence: fixture.input.selectedEvidence.map((item) => ({
        ...item, title: item.title.replace("xAI ", ""), bodyPreview: item.bodyPreview?.replace("xAI ", ""),
      })),
    };
    Object.assign(fixture.raw.groups[0]!, { label, recoveredDisplayLabel: "Xai" });
    const { result, plans, rejections } = await runPublication(fixture);
    expect(plans[0]!.groups[0]!.recoveredDisplayLabel).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(rejections).toHaveLength(0);
    if (!result.ok) throw result.error;
    expect(result.value.nodes).toHaveLength(2);
    expect(result.value.nodes.every((node) => node.groupId === "group:ungrouped")).toBe(true);
    expect(result.value.groups[0]?.label).toBe("Ungrouped");
  });
});
