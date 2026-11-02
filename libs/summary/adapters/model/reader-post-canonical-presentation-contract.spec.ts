import { prepareStrictJsonSchema } from "@agent-teams/account-gateway/llm";
import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand } from "../../ports";
import { readerPostPresentationReferenceCatalog } from "../../domain/services/reader-post-presentation-reference-catalog";
import { AgentRuntimePromotionPresentationV3Builder } from "./agent-runtime-promotion-presentation-v3.builder";
import { toGatewayOutputSchema } from "./gateway-llm/gateway-llm-output-schema";

const input = { tenantId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  interestId: "00000000-0000-4000-8000-000000000003",
  sourceItemId: "00000000-0000-4000-8000-000000000005",
  sourceBindingId: "00000000-0000-4000-8000-000000000006",
  candidateId: "00000000-0000-4000-8000-000000000010", providerKey: "rss",
  trustedIntent: "Synthetic product interest", sourceSnapshotSha256: "1".repeat(64),
  title: "Nova v2.6 model", body: "Nova v2.6 model preview only 😀.", captureComplete: true };
const candidate = { candidateId: input.candidateId, title: input.title, sourceText: input.body };
const references = readerPostPresentationReferenceCatalog(candidate);
const claim = () => ({ candidateId: input.candidateId, status: "available", kind: "claim",
  text: "Nova model preview only", support: [references.find(r => r.field === "bodyPreview")!],
  qualifications: [{ phrase: "preview only", evidence: [references.find(r => r.field === "bodyPreview")!] }],
  confidence: 0.9, qualificationJudgment: "preserved" });

const run = async (proposal: Record<string, unknown>, rows = [input]) => {
  const commands: AgentRuntimeTaskCommand[] = [];
  const client = { runTask: async (command: AgentRuntimeTaskCommand) => {
    commands.push(command); return { status: "completed", warnings: [],
      structuredOutput: { presentations: rows.map(row => ({ ...proposal, candidateId: row.candidateId })) } };
  } } as unknown as AgentRuntimeClientPort;
  const results = await new AgentRuntimePromotionPresentationV3Builder({ client,
    model: "gpt-6.1-sol", reasoningEffort: "low" }).build(rows);
  return { commands, results };
};

describe("canonical Codex presentation affordances", () => {
  it("keeps the canonical wire/model and communicates the actual unchanged seal rules", async () => {
    const { commands, results } = await run(claim());
    expect(results[0]?.status).toBe("available");
    const command = commands[0]!;
    expect(command.controls).toMatchObject({ model: "gpt-6.1-sol", reasoningEffort: "low" });
    expect(command.controls).not.toHaveProperty("modelBackend");
    expect(JSON.parse(command.prompt)).toEqual({ candidates: [candidate] });
    expect(command.systemPrompt).toContain("Keep the canonical response fields text and qualificationJudgment");
    expect(command.systemPrompt).toContain("Do not return baseHeadline or contractVersion");
    expect(command.systemPrompt).toContain("The server does not append phrases to canonical text");
    expect(command.systemPrompt).toContain("text must equal the support quotes joined");
    expect(command.systemPrompt).toContain("subject_only");
    expect(command.systemPrompt).toContain("whole-token copy options");
    expect(command.systemPrompt).toContain("Never include URLs");
    expect(command.systemPrompt).toContain("two or more consecutive periods");
    const options = JSON.parse(command.systemPrompt.split("\nSOURCE_REFERENCE_COPY_OPTIONS=")[1]!);
    expect(options).toEqual([{ candidateId: input.candidateId, references }]);
    expect(command.prompt).not.toContain(input.trustedIntent);
  });

  it("admits the actual catalog schema through the pinned SDK without a model call", async () => {
    const { commands } = await run(claim());
    const strict = prepareStrictJsonSchema(toGatewayOutputSchema(commands[0]!.outputSchema));
    const output = { presentations: [claim()] };
    expect(strict.decode(output)).toEqual(output);
    expect(() => strict.decode({ presentations: [{ ...claim(), candidateId: "foreign" }] })).toThrow();
    expect(() => strict.decode({ presentations: [{ ...claim(), support: [{
      ...claim().support[0]!, start: 1,
    }] }] })).toThrow();
    expect(() => strict.decode({ presentations: [{ ...claim(), baseHeadline: "Wrong wire" }] })).toThrow();
  });

  it("narrows each schema branch to its own candidate's exact copied references", async () => {
    const other = { ...input, candidateId: "00000000-0000-4000-8000-000000000011",
      title: "Different compiler", body: "Different compiler source." };
    const { commands } = await run(claim(), [input, other]);
    const strict = prepareStrictJsonSchema(toGatewayOutputSchema(commands[0]!.outputSchema));
    const otherReferences = readerPostPresentationReferenceCatalog({ candidateId: other.candidateId,
      title: other.title, sourceText: other.body });
    expect(() => strict.decode({ presentations: [claim(), { ...claim(), candidateId: other.candidateId,
      support: [otherReferences[0]!], qualifications: [] }] })).not.toThrow();
    expect(() => strict.decode({ presentations: [claim(), { ...claim(), candidateId: other.candidateId }] })).toThrow();
  });

  it("retains the exact subject-label grammar and qualification rejection at the seal", async () => {
    const support = ["Nova", "v2.6", "model"].map(quote =>
      references.find(r => r.field === "title" && r.quote === quote)!);
    const subject = { ...claim(), kind: "subject_label", text: "Nova v2.6 model discussion",
      support, qualifications: [], qualificationJudgment: "subject_only" };
    expect((await run(subject)).results[0]?.status).toBe("available");
    expect((await run({ ...subject, text: "Nova model offers helpful workflows" })).results[0])
      .toMatchObject({ status: "unavailable", validation: { stage: "headline_seal", code: "subject_label" } });
    expect((await run({ ...claim(), text: "Nova model" })).results[0])
      .toMatchObject({ status: "unavailable", validation: { stage: "headline_seal", code: "qualification" } });
    expect((await run({ ...claim(), text: "Nova model.. preview only" })).results[0])
      .toMatchObject({ status: "unavailable", validation: { stage: "headline_seal", code: "display_text" } });
  });
});
