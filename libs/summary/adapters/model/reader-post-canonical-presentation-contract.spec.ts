import { prepareStrictJsonSchema } from "@agent-teams/account-gateway/llm";
import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand } from "../../ports";
import { readerPostPresentationReferenceCatalog, readerPostPresentationCatalogOutputSchema,
  readerPostPresentationCatalogReferenceFailure } from "../../domain/services/reader-post-presentation-reference-catalog";
import { readerPostPresentationV3OutputSchema } from "../../domain/services/reader-post-presentation-v3-proposal";
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

const run = async (proposal: Record<string, unknown> | Record<string, unknown>[], rows = [input]) => {
  const commands: AgentRuntimeTaskCommand[] = [];
  const client = { runTask: async (command: AgentRuntimeTaskCommand) => {
    commands.push(command); return { status: "completed", warnings: [],
      structuredOutput: { presentations: rows.map((row, index) => Array.isArray(proposal)
        ? proposal[index]! : { ...proposal, candidateId: row.candidateId }) } };
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

  it("retains the previously provider-qualified base schema and enforces membership after decode", async () => {
    const { commands } = await run(claim());
    expect(commands[0]!.outputSchema).toBe(readerPostPresentationV3OutputSchema);
    const strict = prepareStrictJsonSchema(toGatewayOutputSchema(commands[0]!.outputSchema));
    const output = { presentations: [claim()] };
    expect(strict.decode(output)).toEqual(output);
    const bad = { ...claim(), support: [{
      ...claim().support[0]!, start: 1,
    }] };
    expect(strict.decode({ presentations: [bad] })).toEqual({ presentations: [bad] });
    expect((await run(bad)).results[0]).toMatchObject({ status: "unavailable",
      validation: { stage: "proposal_contract", code: "source_reference" } });
    expect(() => strict.decode({ presentations: [{ ...claim(), baseHeadline: "Wrong wire" }] })).toThrow();
  });

  it.each(["foreign_support", "foreign_evidence", "duplicate_candidate"] as const)(
    "keeps valid siblings when one canonical %s violates its own catalog", async fault => {
      const rows = Array.from({ length: 4 }, (_, index) => ({ ...input,
        candidateId: `00000000-0000-4000-8000-00000000001${index}` }));
      const output = rows.map(row => ({ ...claim(), candidateId: row.candidateId }));
      const bad = output[1]!;
      if (fault === "foreign_support") bad.support = [{ ...bad.support[0]!, quote: "Different source" }];
      if (fault === "foreign_evidence") bad.qualifications = [{ phrase: "preview only",
        evidence: [{ ...bad.support[0]!, quote: "Different source" }] }];
      if (fault === "duplicate_candidate") bad.candidateId = output[0]!.candidateId;
      const result = await run(output, rows);
      expect(result.results.map(r => r.status)).toEqual(fault === "duplicate_candidate"
        ? ["unavailable", "unavailable", "available", "available"]
        : ["available", "unavailable", "available", "available"]);
    });

  it.each(["support_limit", "qualification_limit", "evidence_limit", "support_duplicate",
    "evidence_duplicate", "non_catalog_range"] as const)(
    "retains the previous expanded schema's exact %s subset per item", async fault => {
      const proposal = claim();
      if (fault === "support_limit") proposal.support = references.slice(0, 5);
      if (fault === "qualification_limit") proposal.qualifications = Array.from({ length: 3 }, () =>
        ({ phrase: "preview only", evidence: [references[0]!] }));
      if (fault === "evidence_limit") proposal.qualifications[0]!.evidence = references.slice(0, 3);
      if (fault === "support_duplicate") proposal.support = [references[0]!, references[0]!];
      if (fault === "evidence_duplicate") proposal.qualifications[0]!.evidence = [references[0]!, references[0]!];
      if (fault === "non_catalog_range") proposal.support = [{ field: "bodyPreview", start: 0,
        end: 5, quote: "Nova " }];
      const previous = prepareStrictJsonSchema(toGatewayOutputSchema(
        readerPostPresentationCatalogOutputSchema([candidate])));
      expect(() => previous.decode({ presentations: [proposal] })).toThrow();
      const code = fault.endsWith("limit") ? "quote_budget" : "source_reference";
      expect(readerPostPresentationCatalogReferenceFailure(proposal, candidate)).toBe(code);
      expect((await run(proposal)).results[0]).toMatchObject({ status: "unavailable",
        validation: { stage: "proposal_contract", code } });
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
