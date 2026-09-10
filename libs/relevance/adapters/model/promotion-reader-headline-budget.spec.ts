import Ajv from "ajv";
import { FixedClock } from "@social-monitor/shared-kernel";
import { SourceContentQualityPolicy } from "../../domain";
import { assessPromotionContent } from "../../features/rank-feed-items/promotion-content-assessment";
import { assessPromotionReaderHeadline as assess } from "../../features/rank-feed-items/promotion-reader-headline-assessment";
import { headlineRequest, headlineReview, subjectProposal } from "../../../../test/support/promotion-reader-headline";
import { promotionWireCandidate } from "./promotion-review-wire";
import { parseReviews, promotionResponseSchema } from "./source-content-quality-review-wire";
import { AgentRuntimeSourceContentQualityReviewerAdapter } from "./agent-runtime-source-content-quality-reviewer.adapter";
import { attestRefreshExecution, refreshTestRuntimeClient } from "../../../../scripts/lib/reader-summary-new-input-refresh-model.spec-support";

const fixture = (quoteLength: number, supportCount: number, qualificationCount: number, char = "x") => {
  const request = headlineRequest(char.repeat(2100));
  const support = Array.from({ length: supportCount }, (_, start) => ({ field: "bodyPreview" as const,
    start, end: start + quoteLength, quote: request.bodyPreview!.slice(start, start + quoteLength) }));
  const proposal = { ...subjectProposal(request), kind: "claim", text: "q0 q1 q2 q3 q4 q5 q6 q7", support,
    qualifications: Array.from({ length: qualificationCount }, (_, i) => ({ phrase: `q${i}`, evidence: support })),
    wholeInput: { titleLength: request.title.length, bodyLength: request.bodyPreview!.length,
      qualificationJudgment: qualificationCount ? "preserved" : "none" } };
  return { request, proposal };
};

it.each([
  [1, 4, 1, true], // exactly eight serialized occurrences
  [1, 3, 2, false], // nine occurrences, only three distinct coordinates
  [256, 2, 0, true], // exactly 512 quote units
  [171, 3, 0, false],
  [257, 1, 0, false],
  [2000, 8, 8, false], // independent review's 72-occurrence counterexample
])("bounds occurrences and characters: %s/%s/%s", (length, refs, qualifiers, accepted) => {
  const { request, proposal } = fixture(length, refs, qualifiers);
  expect(assess(request, headlineReview(request, proposal)).status).toBe(accepted ? "accepted" : "unavailable");
});

it("counts JSON escape expansion too", () => {
  const { request, proposal } = fixture(256, 2, 0, "\u0001");
  expect(assess(request, headlineReview(request, proposal)).status).toBe("unavailable");
});

it("preserves all quality verdicts with malformed or oversized annotations in completed bounded actual adapter batches", async () => {
  const { request, proposal } = fixture(100, 8, 8);
  const clock = new FixedClock(new Date("2026-09-09T00:00:00Z"));
  const requests = Array.from({ length: 8 }, (_, i) => ({ ...request, candidateId: `synthetic-${i}` }));
  const verdicts: string[] = [];
  for (const readerHeadline of [undefined, null, { status: "available" }, proposal,
    { status: "unavailable", reasonCode: { toString: null } },
    { status: "unavailable", reasonCode: ["insufficient_support"] },
  ]) {
    let calls = 0;
    const adapter = new AgentRuntimeSourceContentQualityReviewerAdapter({ clock,
      ids: { generate: () => "synthetic-budget" }, batchTimeoutMs: 15000, totalTimeoutMs: 60000,
      client: refreshTestRuntimeClient(async (command) => {
        calls++;
        const candidates = JSON.parse(command.prompt).candidates as { candidateId: string }[];
        expect(candidates).toHaveLength(8);
        const reviews = candidates.map(({ candidateId }) => {
          const input = requests.find((request) => request.candidateId === candidateId)!;
          const { assessment, ...quality } = headlineReview(input, readerHeadline);
          return { ...quality, bindingId: promotionWireCandidate(input).bindingId,
            evidence: assessment.evidence, resolvedSoftFlags: [], readerHeadline };
        });
        const output = { reviews };
        expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThan(128000);
        return attestRefreshExecution(command, output);
      }),
    });
    const result = await assessPromotionContent({ requests, reviewer: adapter, clock,
      policy: new SourceContentQualityPolicy() });
    expect(calls).toBe(1);
    expect(result.verdicts.size).toBe(8);
    expect([...result.verdicts.values()].every((verdict) => verdict.qualityScore === 0.8)).toBe(true);
    expect([...result.readerHeadlines.values()].every((headline) => headline.status === "unavailable")).toBe(true);
    if (readerHeadline?.status === "unavailable") {
      expect([...result.readerHeadlines.values()]).toEqual(requests.map(() => ({
        status: "unavailable", reasonCode: "invalid_assessment",
      })));
    }
    verdicts.push(JSON.stringify([...result.verdicts]));
  }
  expect(new Set(verdicts).size).toBe(1);
});

it("never accepts incomplete JSON to recover quality", () => {
  expect(() => parseReviews('{"reviews":[')).toThrow();
});

it("caps headline quotes in the real schema without capping legacy quality quotes", () => {
  const validate = new Ajv().compile(promotionResponseSchema);
  for (const length of [256, 257]) {
    const { request, proposal } = fixture(length, 1, 0);
    const { assessment, ...quality } = headlineReview(request, proposal);
    const evidence = [{ field: "bodyPreview", start: 0, end: 2100, quote: request.bodyPreview }];
    const output = { reviews: [{ ...quality, bindingId: promotionWireCandidate(request).bindingId,
      evidence, resolvedSoftFlags: assessment.resolvedSoftFlags, readerHeadline: proposal }] };
    expect(validate(output)).toBe(length === 256);
    expect(validate({ reviews: [{ ...output.reviews[0],
      readerHeadline: { status: "unavailable", reasonCode: "unresolved_qualifications" } }] })).toBe(true);
  }
});
