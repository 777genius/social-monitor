import { assessPromotionReaderHeadline as assess } from "../../features/rank-feed-items/promotion-reader-headline-assessment";
import { validPromotionReferences } from "../../features/rank-feed-items/promotion-evidence-reference";
import { headlineRequest, headlineReview, reference, subjectProposal } from "../../../../test/support/promotion-reader-headline";
import { parseReviews } from "./source-content-quality-review-wire";
import { promotionWireCandidate } from "./promotion-review-wire";

it("rejects the exact OrionX/v2.10 counterexample through the real parser", () => {
  const request = headlineRequest("OrionX v2.10 compiler implementation.", "OrionX compiler");
  const proposal = { ...subjectProposal(headlineRequest()), text: "Orion v2.1 compiler discussion",
    support: [reference(request, "Orion"), reference(request, "v2.1"), reference(request, "compiler")],
    wholeInput: { titleLength: request.title.length, bodyLength: request.bodyPreview!.length,
      qualificationJudgment: "subject_only" } };
  const { assessment, ...quality } = headlineReview(request, proposal);
  const [review] = parseReviews(JSON.stringify({ reviews: [{ ...quality,
    bindingId: promotionWireCandidate(request).bindingId, evidence: assessment.evidence,
    resolvedSoftFlags: [], readerHeadline: proposal }] }), [request]);
  expect(assess(request, review).status).toBe("unavailable");
  expect(validPromotionReferences(request, proposal.support)).toBe(true);
});

it.each([
  ["Orion\u0301 compiler", "Orion", "compiler"],
  ["𐐀Orion compiler", "Orion", "compiler"],
  ["Orion𐐀 compiler", "Orion", "compiler"],
  ["Orion-X compiler", "Orion", "compiler"],
  ["X-Orion compiler", "Orion", "compiler"],
  ["Orion‐X compiler", "Orion", "compiler"],
  ["Orion_compiler compiler", "Orion", "compiler"],
  ["Orion compilerish", "Orion", "compiler"],
  ["Orion v2.10 compiler", "Orion", "v2.1", "compiler"],
  ["Orion v2.1.3 compiler", "Orion", "v2.1", "compiler"],
  ["Orion v2.1-beta compiler", "Orion", "v2.1", "compiler"],
  ["Orion v2.1+build compiler", "Orion", "v2.1", "compiler"],
  ["Orion v2.1rc1 compiler", "Orion", "v2.1", "compiler"],
  ["Orion v2.1\u0301 compiler", "Orion", "v2.1", "compiler"],
])("rejects partial subject tokens in %s without strengthening quality references", (body, ...quotes) => {
  const request = headlineRequest(body);
  const support = quotes.map((quote) => reference(request, quote));
  const proposal = { ...subjectProposal(request), support, text: `${quotes.join(" ")} discussion` };
  expect(validPromotionReferences(request, support)).toBe(true);
  expect(assess(request, headlineReview(request, proposal)).status).toBe("unavailable");
});

it.each(["Orion-X", "Orio\u0301n", "𐐀rion"])("accepts a complete Unicode name %s and version", (name) => {
  const request = headlineRequest(`(${name}) v2.10 compiler implementation.`);
  const quotes = [name, "v2.10", "compiler"];
  const proposal = { ...subjectProposal(request), support: quotes.map((quote) => reference(request, quote)),
    text: `${quotes.join(" ")} discussion` };
  expect(assess(request, headlineReview(request, proposal)).status).toBe("accepted");
});
