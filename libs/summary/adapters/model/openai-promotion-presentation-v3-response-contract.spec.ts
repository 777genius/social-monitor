import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";
import { validatedPresentationRoot } from "./openai-promotion-presentation-v3-response-contract";

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
});
