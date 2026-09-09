import { assessPromotionReaderHeadline as assess } from "./promotion-reader-headline-assessment";
import { headlineRequest, headlineReview, reference, subjectProposal } from "../../../../test/support/promotion-reader-headline";

describe("candidate-bound reader headline structure (synthetic semantic judgments)", () => {
  it("accepts the exact constrained subject with immutable evidence and digest", () => {
    const request = headlineRequest();
    const proposal = subjectProposal(request);
    const accepted = assess(request, headlineReview(request, proposal));
    expect(accepted).toMatchObject({ status: "accepted", text: "Orion benchmark discussion",
      binding: { ...request.promotion, candidateId: request.candidateId, providerKey: "reddit",
        reviewedInputDigest: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    proposal.support[0]!.quote = "Changed";
    expect(accepted.status === "accepted" && accepted.support[0]!.quote).toBe("Orion");
    expect(Object.isFrozen(accepted)).toBe(true);
  });

  it("accepts an explicitly qualified claim with source and headline coverage", () => {
    const request = headlineRequest();
    const proposal = { ...subjectProposal(request), kind: "claim", text: "Orion benchmark: Simulation only.",
      qualifications: [{ phrase: "Simulation only.", evidence: [reference(request, "Simulation only.")] }],
      wholeInput: { titleLength: request.title.length, bodyLength: request.bodyPreview!.length,
        qualificationJudgment: "preserved" } };
    expect(assess(request, headlineReview(request, proposal)).status).toBe("accepted");
    expect(assess(request, headlineReview(request, { ...proposal, text: "Orion benchmark was released" })).status).toBe("unavailable");
    expect(assess(request, headlineReview(request, { ...proposal, qualifications: [] })).status).toBe("unavailable");
  });

  it.each([
    null, [], {}, { status: "accepted" }, { status: "unavailable", reasonCode: "invented" },
    { status: "unavailable", reasonCode: "insufficient_support", extra: true },
  ])("rejects malformed/unknown proposal %j", (proposal) => {
    const request = headlineRequest();
    expect(assess(request, headlineReview(request, proposal)).status).toBe("unavailable");
  });

  it.each([
    { extra: true }, { confidence: 0.799 }, { confidence: NaN }, { confidence: 1.01 },
    { kind: "story" }, { support: [] }, { qualifications: undefined },
    { wholeInput: { titleLength: 15, bodyLength: 1, qualificationJudgment: "subject_only" } },
    { text: "Orion safety breakthrough" }, { text: "Orion benchmark discussion…" },
    { text: "Orion benchmark discussion\n" }, { text: "https://example.test" },
  ])("rejects invalid available fields %j", (patch) => {
    const request = headlineRequest();
    expect(assess(request, headlineReview(request, { ...subjectProposal(request), ...patch })).status).toBe("unavailable");
  });

  it.each(["field", "start", "end", "quote", "extra", "duplicate"])("rejects invalid %s references", (field) => {
    const request = headlineRequest();
    const proposal = subjectProposal(request);
    const ref = proposal.support[0]!;
    if (field === "duplicate") proposal.support.push(ref);
    else Object.assign(ref, { [field]: field === "start" ? 1 : field === "end" ? 999 : "wrong" });
    expect(assess(request, headlineReview(request, proposal)).status).toBe("unavailable");
  });

  it.each(["candidateId", "providerKey", "title", "bodyPreview"])("rejects a stale invocation after %s changes", (field) => {
    const request = headlineRequest();
    const review = headlineReview(request);
    expect(assess({ ...request, [field]: "changed" }, review).status).toBe("unavailable");
  });

  it.each(["tenantId", "workspaceId", "interestId", "sourceBindingId", "sourceItemId", "trustedIntent"])(
    "rejects copied scope after %s changes", (field) => {
      const request = headlineRequest();
      const review = headlineReview(request);
      expect(assess({ ...request, promotion: { ...request.promotion!, [field]: "changed" } }, review).status).toBe("unavailable");
    });

  it("missing old extension cannot authorize a headline", () => {
    const request = headlineRequest();
    const review = headlineReview(request);
    const { headlineInput: _input, readerHeadline: _proposal, ...legacy } = review.assessment;
    expect(assess(request, { ...review, assessment: legacy })).toEqual({ status: "unavailable", reasonCode: "not_assessed" });
    expect(assess(request, undefined).status).toBe("unavailable");
    expect(assess(request, { ...review, assessment: { ...review.assessment, headlineInput: undefined } }).status).toBe("unavailable");
  });

  it.each([119, 120])("measures %s UTF-16 units without truncating", (length) => {
    const text = "界".repeat(length - 2) + "😀";
    const request = headlineRequest(text);
    const proposal = { ...subjectProposal(request), kind: "claim", text,
      support: [reference(request, text)], wholeInput: { titleLength: request.title.length,
        bodyLength: text.length, qualificationJudgment: "none" } };
    expect(assess(request, headlineReview(request, proposal)).status).toBe(length === 119 ? "accepted" : "unavailable");
  });

  it.each(["Café e\u0301 编译器。😀", "Bad\u0000text", "Bad\ud800text", "Bad\udc00text"])(
    "preserves round-tripping Unicode or rejects it: %j", (text) => {
      const request = headlineRequest(text);
      const proposal = { ...subjectProposal(request), kind: "claim", text, support: [reference(request, text)],
        wholeInput: { titleLength: request.title.length, bodyLength: text.length, qualificationJudgment: "none" } };
      const result = assess(request, headlineReview(request, proposal));
      expect(result.status).toBe(text.startsWith("Bad") ? "unavailable" : "accepted");
      if (result.status === "accepted") expect(result.text).toBe(text);
    });

  it.each([12_001, 256_001])("rejects unseen source tails at %s units", (length) => {
    const base = headlineRequest("x".repeat(length));
    const request = { ...base, bodyPreview: base.bodyPreview!.slice(0, 12_000),
      promotion: { ...base.promotion!, availability: "truncated" as const } };
    expect(assess(request, headlineReview(request)).status).toBe("unavailable");
  });

  it("supports complete title-only subjects, without inventing a body", () => {
    const request = headlineRequest("");
    expect(assess(request, headlineReview(request))).toMatchObject({ status: "accepted",
      binding: { availability: "title_only" }, wholeInput: { bodyLength: 0 } });
  });
});
