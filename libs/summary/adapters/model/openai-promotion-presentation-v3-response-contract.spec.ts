import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";
import { validatedPresentationRoot } from "./openai-promotion-presentation-v3-response-contract";
import { assertPresentationShape } from "./openai-promotion-presentation-v3-item-contract";

const requested: ReaderPostPresentationV3Input = {
  tenantId: "tenant", workspaceId: "workspace", interestId: "interest",
  candidateId: "candidate-1", sourceItemId: "source-1", sourceBindingId: "binding-1",
  providerKey: "reddit", trustedIntent: "synthetic intent",
  sourceSnapshotSha256: "1".repeat(64), title: "Synthetic title", body: "Synthetic source",
  captureComplete: true,
};
const available = {
  candidateId: requested.candidateId,
  status: "available",
  kind: "subject_label",
  text: "Synthetic title",
  support: [],
  qualifications: [],
  confidence: 0.9,
  qualificationJudgment: "none",
};

describe("V3 promotion presentation response contract", () => {
  it("requires the exact bounded presentation batch and identity", () => {
    expect(validatedPresentationRoot({ presentations: [available] }, [requested]).get("candidate-1"))
      .toEqual(available);
    expect(() => validatedPresentationRoot({ presentations: [available], extra: true }, [requested]))
      .toThrow(/response root/u);
    expect(() => validatedPresentationRoot({ presentations: [available, available] }, [requested]))
      .toThrow(/invalid batch/u);
  });

  it.each([
    ["unknown property", { ...available, extra: true }],
    ["invalid confidence", { ...available, confidence: Number.NaN }],
    ["invalid support shape", { ...available, support: [{ field: "title", start: -1, end: 2, quote: "x" }] }],
    ["unjustified qualification", { ...available, qualifications: [{ phrase: "Synthetic" }] }],
    ["unsupported status", { ...available, status: "partial" }],
  ])("rejects %s without accepting incomplete attestation", (_scenario, proposal) => {
    expect(() => validatedPresentationRoot({ presentations: [proposal] }, [requested]))
      .toThrow(/response contract/u);
  });
  it("admits well-shaped item evidence without changing input or batch identity", () => {
    const proposal = {
      ...available,
      support: [{ field: "title", start: 0, end: 9, quote: "Synthetic" }],
      qualifications: [{
        phrase: "Synthetic",
        evidence: [{ field: "bodyPreview", start: 0, end: 9, quote: "Synthetic" }],
      }],
    };
    const before = JSON.stringify(proposal);
    expect(() => assertPresentationShape(proposal)).not.toThrow();
    expect(JSON.stringify(proposal)).toBe(before);
    expect(validatedPresentationRoot({ presentations: [proposal] }, [requested]).get(requested.candidateId))
      .toEqual(proposal);
  });

  it.each([
    ["extra field", { ...available, injected: "untrusted" }],
    ["non-finite confidence", { ...available, confidence: Number.POSITIVE_INFINITY }],
    ["unsafe reference offsets", { ...available, support: [{ field: "title", start: 0.5, end: 8, quote: "Synthetic" }] }],
    ["untrusted reference key", { ...available, support: [{ field: "title", start: 0, end: 9, quote: "Synthetic", source: "forged" }] }],
    ["missing qualification evidence", { ...available, qualifications: [{ phrase: "Synthetic", evidence: [] }] }],
    ["too many qualifications", { ...available, qualifications: Array.from({ length: 9 }, () => ({ phrase: "x", evidence: [] })) }],
  ])("direct item admission rejects %s before identity binding", (_case, proposal) => {
    expect(() => assertPresentationShape(proposal)).toThrow("V3 presentation item violates the response contract");
    expect(() => validatedPresentationRoot({ presentations: [proposal] }, [requested]))
      .toThrow("V3 presentation item violates the response contract");
  });

});
