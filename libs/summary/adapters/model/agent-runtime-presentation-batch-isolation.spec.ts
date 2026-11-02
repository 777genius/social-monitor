import type { AgentRuntimeClientPort, AgentRuntimeTaskResult } from "../../ports";
import { AgentRuntimePromotionPresentationV3Builder } from "./agent-runtime-promotion-presentation-v3.builder";
import { decodeMimoQualifiedHeadlines } from "../../domain/services/mimo-qualified-headline-codec";
import { decodeReaderPostPresentationBatch } from "../../domain/services/reader-post-presentation-batch-decode";
import { readerPostPresentationReferenceCatalog } from "../../domain/services/reader-post-presentation-reference-catalog";

const inputs = Array.from({ length: 4 }, (_, index) => ({
  tenantId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  interestId: "00000000-0000-4000-8000-000000000003",
  sourceItemId: "00000000-0000-4000-8000-000000000005",
  sourceBindingId: "00000000-0000-4000-8000-000000000006",
  candidateId: `00000000-0000-4000-8000-00000000001${index}`,
  providerKey: "rss", trustedIntent: "Synthetic database interest",
  sourceSnapshotSha256: "1".repeat(64), title: "Useful database method",
  body: "Useful body source.", captureComplete: true,
}));
const candidates = inputs.map((input) => ({ candidateId: input.candidateId,
  title: input.title, sourceText: input.body }));
const wire = () => ({ contractVersion: "mimo_qualified_headline.v1", presentations:
  candidates.map((candidate) => ({ candidateId: candidate.candidateId,
    status: "available", kind: "claim", baseHeadline: "Useful database method",
    support: [readerPostPresentationReferenceCatalog(candidate).find(r => r.field === "bodyPreview")!],
    qualifications: [], confidence: 0.9 })) });
const canonicalWire = () => ({ presentations: candidates.map((candidate) => ({
      candidateId: candidate.candidateId, status: "available", kind: "claim",
      text: "Useful database method", support: [readerPostPresentationReferenceCatalog(candidate)
        .find(r => r.field === "bodyPreview")!], qualifications: [], confidence: 0.9,
      qualificationJudgment: "none",
    })) });
const clientFor = (output: Record<string, unknown>): AgentRuntimeClientPort => ({
  runTask: async (): Promise<AgentRuntimeTaskResult> => ({ status: "completed",
    structuredOutput: output, warnings: [] }),
  checkHealth: async () => ({ status: "serving", runtimeEngine: "test",
    runtimeVersion: "test", warnings: [] }),
});

describe("strict independent presentation outcomes", () => {
  it("keeps three grounded siblings when one gateway headline fails the same validator", async () => {
    const raw = wire();
    raw.presentations[1]!.baseHeadline = "We just dropped a method";
    // The legacy batch decoder keeps its original strict all-or-nothing API.
    expect(decodeMimoQualifiedHeadlines(raw, candidates).failure?.code).toBe("display_text");
    const decoded = decodeReaderPostPresentationBatch(raw, candidates);
    expect(decoded.map(r => r.failure?.code ?? "available"))
      .toEqual(["available", "display_text", "available", "available"]);
    const builder = new AgentRuntimePromotionPresentationV3Builder({
      client: clientFor(raw), modelBackend: "openrouter", model: "openai/gpt-oss-120b" });
    const results = await builder.build(inputs);
    expect(results.map(r => r.status)).toEqual(["available", "unavailable", "available", "available"]);
    expect(results[1]).toEqual({ status: "unavailable", reason: "invalid_presentation",
      validation: { stage: "source_copy_decode", code: "display_text" } });
    // No repaired or paraphrased bad headline is ever accepted.
    expect(raw.presentations[1]!.baseHeadline).toBe("We just dropped a method");
  });

  it.each(["duplicate", "unknown", "missing", "extra", "envelope"] as const)(
    "rejects ambiguous global %s without salvaging an identity", (fault) => {
      const raw = wire();
      if (fault === "duplicate") raw.presentations[1]!.candidateId = raw.presentations[0]!.candidateId;
      if (fault === "unknown") raw.presentations[1]!.candidateId = "unknown";
      if (fault === "missing") raw.presentations.pop();
      if (fault === "extra") raw.presentations.push({ ...raw.presentations[0]! });
      if (fault === "envelope") Object.assign(raw, { additional: true });
      const decoded = decodeReaderPostPresentationBatch(raw, candidates);
      expect(decoded).toHaveLength(4);
      expect(decoded.every(r => r.failure !== undefined && r.proposal === undefined)).toBe(true);
    });

  it("retains the exact failed grounding predicate on the Codex canonical path", async () => {
    const output = canonicalWire();
    output.presentations[1]!.support = [{ ...output.presentations[1]!.support[0]!, quote: "Useful" }];
    const results = await new AgentRuntimePromotionPresentationV3Builder({
      client: clientFor(output), model: "gpt-6.1-sol", reasoningEffort: "low" }).build(inputs);
    expect(results.map(r => r.status)).toEqual(["available", "unavailable", "available", "available"]);
    expect(results[1]).toEqual({ status: "unavailable", reason: "invalid_presentation",
      validation: { stage: "proposal_contract", code: "source_reference" } });
  });

  it.each(["qualification_judgment", "display_text", "confidence"] as const)(
    "reports the independent Codex %s seal rejection", async (code) => {
      const output = canonicalWire();
      const bad = output.presentations[1]!;
      if (code === "qualification_judgment") bad.qualificationJudgment = "subject_only";
      if (code === "display_text") bad.text = "We just dropped a method";
      if (code === "confidence") bad.confidence = 0.7;
      const results = await new AgentRuntimePromotionPresentationV3Builder({
        client: clientFor(output), model: "gpt-6.1-sol", reasoningEffort: "low" }).build(inputs);
      expect(results.map(r => r.status)).toEqual(["available", "unavailable", "available", "available"]);
      expect(results[1]).toEqual({ status: "unavailable", reason: "invalid_presentation",
        validation: { stage: "headline_seal", code } });
    });
});
