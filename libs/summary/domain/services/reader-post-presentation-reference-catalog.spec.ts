import { readerPostPresentationCatalogOutputSchema, readerPostPresentationCatalogProposalFailure,
  readerPostPresentationReferenceCatalog } from "./reader-post-presentation-reference-catalog";
import { readerPostPresentationProposalFailure } from "./reader-post-presentation-v3-proposal";

const candidate = { candidateId: "original", title: "Useful database method", sourceText: "Useful body source." };
const proposal = () => ({ candidateId: "original", status: "available", kind: "claim",
  text: "Useful database method", support: [{ field: "bodyPreview", start: 0, end: 19, quote: "Useful body source." }],
  qualifications: [] as { phrase: string; evidence: typeof candidateReference[] }[], confidence: 0.9,
  qualificationJudgment: "none" });
const candidateReference = { field: "bodyPreview", start: 0, end: 19, quote: "Useful body source." };

describe("source-owned presentation reference catalog", () => {
  it("bounds authentic decoded-source references even for astral letters and escaped characters", () => {
    const source = { ...candidate, sourceText: ("\u{10400}".repeat(40) + '\t\n"\\').repeat(100) };
    const references = readerPostPresentationReferenceCatalog(source);
    expect(references.length).toBeGreaterThan(4);
    expect(references.length).toBeLessThanOrEqual(56);
    expect(references).toEqual(readerPostPresentationReferenceCatalog(source));
    for (const ref of references) {
      const text = ref.field === "title" ? source.title : source.sourceText;
      expect(text.slice(ref.start, ref.end)).toBe(ref.quote);
      expect(ref.quote.length).toBeLessThanOrEqual(64);
      expect(JSON.stringify(ref.quote).length).toBeLessThanOrEqual(128);
      expect(ref.quote).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
    }
    expect(references.some(ref => ref.field === "bodyPreview" && ref.end > source.sourceText.length - 100)).toBe(true);
  });

  it("accepts an exact whole-source option regardless of JSON property order", () => {
    const output = proposal();
    output.support = [{ quote: "Useful body source.", end: 19, start: 0, field: "bodyPreview" }];
    expect(readerPostPresentationCatalogProposalFailure({ presentations: [output] }, [candidate])).toBeNull();
  });

  it("rejects an independently calculated range even when it happens to match the source", () => {
    const output = { presentations: [{ ...proposal(), support: [{ field: "bodyPreview", start: 0, end: 7, quote: "Useful " }] }] };
    expect(readerPostPresentationProposalFailure(output, [candidate])).toBeNull();
    expect(readerPostPresentationCatalogProposalFailure(output, [candidate])).toEqual({ code: "source_reference", index: 0 });
  });

  it("retains the original source, duplicate, candidate, and qualification rejection predicates", () => {
    const sourceRef = { ...candidateReference, quote: "PRIVATE_OTHER_SOURCE" };
    const fixtures = [
      { value: { ...proposal(), support: [sourceRef] }, code: "source_reference" },
      { value: { ...proposal(), support: [candidateReference, candidateReference] }, code: "source_reference" },
      { value: { ...proposal(), candidateId: "foreign" }, code: "proposal_shape_or_identity" },
      { value: { ...proposal(), qualifications: [{ phrase: "preview only", evidence: [candidateReference] }],
        qualificationJudgment: "preserved" }, code: "qualification" },
    ];
    for (const fixture of fixtures) {
      expect(readerPostPresentationCatalogProposalFailure({ presentations: [fixture.value] }, [candidate]))
        .toMatchObject({ code: fixture.code });
    }
  });

  it("keeps eight copied occurrences within both quote budgets without cross-array deduplication", () => {
    const source = { ...candidate, sourceText: "Useful database method preview only. ".repeat(16) };
    const references = readerPostPresentationReferenceCatalog(source).filter(ref => ref.field === "bodyPreview").slice(0, 4);
    expect(references).toHaveLength(4);
    const output = { presentations: [{ ...proposal(), text: "Useful database method preview only",
      support: references, qualifications: [
        { phrase: "preview", evidence: references.slice(0, 2) },
        { phrase: "only", evidence: references.slice(0, 2) },
      ], qualificationJudgment: "preserved" }] };
    const all = [...references, ...references.slice(0, 2), ...references.slice(0, 2)];
    expect(all).toHaveLength(8);
    expect(all.reduce((sum, ref) => sum + ref.quote.length, 0)).toBeLessThanOrEqual(512);
    expect(all.reduce((sum, ref) => sum + JSON.stringify(ref.quote).length, 0)).toBeLessThanOrEqual(1024);
    expect(readerPostPresentationCatalogProposalFailure(output, [source])).toBeNull();
    output.presentations[0]!.support = [...references, references[0]!];
    expect(readerPostPresentationCatalogProposalFailure(output, [source])).not.toBeNull();
  });

  it("binds schema choices to each original candidate rather than admitting a caller-selected broad schema", () => {
    const other = { candidateId: "other", title: "Different compiler release", sourceText: "Different source." };
    const schema = readerPostPresentationCatalogOutputSchema([candidate, other]);
    expect(schema.properties.presentations.minItems).toBe(2);
    expect(schema.properties.presentations.maxItems).toBe(2);
    const [first, second] = schema.properties.presentations.items.oneOf;
    expect(first!.properties.candidateId.const).toBe("original");
    expect(second!.properties.candidateId.const).toBe("other");
    expect(first!.properties.support.items.enum).toContainEqual(candidateReference);
    expect(second!.properties.support.items.enum).not.toContainEqual(candidateReference);
  });
});
