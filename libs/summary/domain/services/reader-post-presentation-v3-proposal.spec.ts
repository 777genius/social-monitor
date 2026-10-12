import { readerPostPresentationCandidates, validReaderPostPresentationProposals } from "./reader-post-presentation-v3-proposal";

const candidate = { candidateId: "candidate-1", title: "Useful database method",
  sourceText: "😀 Useful method only in preview" };
const reference = { field: "bodyPreview", start: 17, end: 32, quote: "only in preview" };
const proposal = () => ({ candidateId: candidate.candidateId, status: "available", kind: "claim",
  text: "Useful method only in preview", support: [reference],
  qualifications: [{ phrase: "only in preview", evidence: [reference] }], confidence: 0.9,
  qualificationJudgment: "preserved" });
const accepts = (value: unknown) => validReaderPostPresentationProposals(
  { presentations: [value] }, [candidate]);

describe("trusted presentation proposals", () => {
  it("freezes the complete original projection and accepts exact UTF-16 source evidence", () => {
    const candidates = readerPostPresentationCandidates(JSON.stringify({ candidates: [candidate] }));
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(Object.isFrozen(candidates[0])).toBe(true);
    expect(candidates[0]).toEqual(candidate);
    expect(accepts(proposal())).toBe(true);
  });

  it.each([
    { ...proposal(), support: [{ ...reference, start: 16 }] },
    { ...proposal(), support: [{ ...reference, quote: "only in release" }] },
    { ...proposal(), text: "Useful method", qualificationJudgment: "preserved" },
    { ...proposal(), qualificationJudgment: "none" },
    { ...proposal(), confidence: 0.79 },
    { ...proposal(), kind: "subject_label" },
    { ...proposal(), candidateId: "unrequested" },
    { ...proposal(), binding: { tenantId: "invented" } },
  ])("refuses changed quotes, missing qualifiers, insufficient confidence and injected bindings", value => {
    expect(accepts(value)).toBe(false);
  });

  it("requires all and only original IDs once, regardless of response order", () => {
    const candidates = [candidate, { ...candidate, candidateId: "candidate-2" }];
    const second = { ...proposal(), candidateId: "candidate-2" };
    expect(validReaderPostPresentationProposals({ presentations: [second, proposal()] }, candidates)).toBe(true);
    expect(validReaderPostPresentationProposals({ presentations: [proposal(), proposal()] }, candidates)).toBe(false);
    expect(validReaderPostPresentationProposals({ presentations: [proposal()] }, candidates)).toBe(false);
    expect(validReaderPostPresentationProposals({ presentations: [proposal()], result: true }, [candidate])).toBe(false);
  });

  it.each([1, 2, 3, 4])("accepts the exact supported batch cardinality %i", count => {
    const candidates = Array.from({ length: count }, (_, index) => ({ ...candidate, candidateId: `candidate-${index}` }));
    const presentations = candidates.map(source => ({ ...proposal(), candidateId: source.candidateId }));
    expect(validReaderPostPresentationProposals({ presentations }, candidates)).toBe(true);
  });

  it("accepts an explicit unavailable result without certifying a headline", () => {
    expect(accepts({ ...proposal(), status: "unavailable", text: "", confidence: 0,
      support: [], qualifications: [], qualificationJudgment: "none" })).toBe(true);
  });

  it("retains whole-token subject-label validation", () => {
    const source = { candidateId: "subject", title: "Nova model", sourceText: "Nova model" };
    const value = { ...proposal(), candidateId: "subject", kind: "subject_label", text: "Nova model discussion",
      qualifications: [], qualificationJudgment: "subject_only", support: [
        { field: "bodyPreview", start: 0, end: 4, quote: "Nova" },
        { field: "bodyPreview", start: 5, end: 10, quote: "model" },
      ] };
    expect(validReaderPostPresentationProposals({ presentations: [value] }, [source])).toBe(true);
    expect(validReaderPostPresentationProposals({ presentations: [value] }, [
      { ...source, sourceText: "Nova models" },
    ])).toBe(false);
  });

  it.each([[], Array(5).fill(candidate), [candidate, candidate], [{ ...candidate, privateIntent: "extra" }],
    [{ ...candidate, sourceText: "\uD800" }]].map(candidates => ({ candidates })))("rejects invalid or unbounded source projections", ({ candidates }) => {
    expect(() => readerPostPresentationCandidates(JSON.stringify({ candidates }))).toThrow();
  });
});
