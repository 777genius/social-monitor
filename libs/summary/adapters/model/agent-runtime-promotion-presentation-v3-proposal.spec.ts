import { contractProposals } from "./agent-runtime-promotion-presentation-v3-proposal";
import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";

const requested = [{ candidateId: "synthetic-id" }] as ReaderPostPresentationV3Input[];

const valid = (id = "synthetic-id"): Record<string, unknown> => ({
  candidateId: id,
  confidence: 0.9,
  kind: "claim",
  qualificationJudgment: "none",
  qualifications: [],
  status: "available",
  support: [],
  text: "Synthetic short headline",
});

describe("V3 canonical presentation proposal contract", () => {
  it("accepts only a unique requested candidate", () => {
    expect(contractProposals([valid()], requested).has("synthetic-id")).toBe(true);
    expect(contractProposals([valid("unknown")], requested).size).toBe(0);
    expect(contractProposals([valid(), valid()], requested).size).toBe(0);
  });

  it("rejects a display longer than 119 UTF-16 code units", () => {
    expect(contractProposals([{ ...valid(), text: "a".repeat(120) }], requested).size)
      .toBe(0);
  });

  it("rejects unknown fields and non-finite confidence", () => {
    expect(contractProposals([{ ...valid(), extra: true }], requested).size).toBe(0);
    expect(contractProposals([{ ...valid(), confidence: Number.NaN }], requested).size)
      .toBe(0);
  });
});
