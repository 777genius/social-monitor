import { bind, contractProposals } from "./agent-runtime-promotion-presentation-v3-proposal";
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

  // These cases exercise the specialist directly, independently of the builder.
  // The first duplicate must invalidate all later answers for that identity.
describe("V3 proposal trust boundaries", () => {
  it("never resurrects a candidate after its second or third answer", () => {
    const inputs = [
      { candidateId: "first" },
      { candidateId: "second" },
    ] as ReaderPostPresentationV3Input[];
    const admitted = contractProposals([
      valid("first"),
      valid("second"),
      valid("first"),
      valid("first"),
    ], inputs);
    expect([...admitted.keys()]).toEqual(["second"]);
  });

  it("projects scope and source binding only from the trusted input", () => {
    const trusted: ReaderPostPresentationV3Input = {
      tenantId: "trusted-tenant",
      workspaceId: "trusted-workspace",
      interestId: "trusted-interest",
      candidateId: "synthetic-id",
      sourceItemId: "trusted-item",
      sourceBindingId: "trusted-binding",
      providerKey: "rss",
      trustedIntent: "synthetic reader interest",
      sourceSnapshotSha256: "1".repeat(64),
      title: "Trusted title",
      body: "Trusted preview",
      captureComplete: true,
    };
    // Directly exercise the binding boundary even when its caller supplies
    // an object with extra untrusted properties.
    const output = bind(trusted, {
      ...valid(),
      tenantId: "forged-tenant",
      workspaceId: "forged-workspace",
      sourceBindingId: "forged-binding",
    });
    expect(output).toEqual(expect.objectContaining({
      status: "accepted",
      binding: expect.objectContaining({
        tenantId: "trusted-tenant",
        workspaceId: "trusted-workspace",
        interestId: "trusted-interest",
        candidateId: "synthetic-id",
        sourceItemId: "trusted-item",
        sourceBindingId: "trusted-binding",
        providerKey: "rss",
        availability: "body_present",
        reviewedInputDigest: expect.any(String),
      }),
    }));
  });
});
