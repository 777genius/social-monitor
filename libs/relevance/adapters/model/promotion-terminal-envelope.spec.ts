import { fixture, run } from "../../../../test/support/promotion-content-assessment";
import { OpenAiSourceContentQualityReviewerAdapter } from "./openai-source-content-quality-reviewer.adapter";

type Envelope = {
  status?: string; error?: unknown; incomplete_details?: unknown;
  output: { type: string; role?: string; status?: string;
    content: { type: string; text?: string; refusal?: string }[] }[];
};
const mutations: [string, (body: Envelope) => void][] = [
  ...["incomplete", "failed", "cancelled", "in_progress", "queued", "unknown", undefined]
    .map((status): [string, (body: Envelope) => void] => [String(status), (body) => { body.status = status; }]),
  ["incomplete details", (body) => { body.incomplete_details = { reason: "max_output_tokens" }; }],
  ["error", (body) => { body.error = { code: "synthetic" }; }],
  ["missing message status", (body) => { delete body.output[0]!.status; }],
  ["incomplete message", (body) => { body.output[0]!.status = "incomplete"; }],
  ["wrong role", (body) => { body.output[0]!.role = "user"; }],
  ["refusal", (body) => { body.output[0]!.content.push({ type: "refusal", refusal: "synthetic" }); }],
  ["ambiguous text", (body) => { body.output[0]!.content.push(body.output[0]!.content[0]!); }],
  ["unknown output", (body) => { body.output.push({ type: "unknown", content: [] }); }],
];
const adapter = (mutate: (body: Envelope) => void) => new OpenAiSourceContentQualityReviewerAdapter({
  apiKey: "synthetic-test-key", fetchFn: async (_url, init) => {
    const candidates = JSON.parse(JSON.parse(String(init!.body)).input).candidates;
    const reviews = candidates.map((candidate: { candidateId: string; bindingId: string; untrustedSource: { bodyPreview: string } }) => ({
      candidateId: candidate.candidateId, bindingId: candidate.bindingId,
      decision: "promote", confidence: 0.95, qualityScore: 0.8,
      interestRelevanceScore: 0.95, engagementIntegrityScore: 0.95,
      flags: [], reason: "Synthetic", resolvedSoftFlags: [], evidence: [{ field: "bodyPreview",
        start: 0, end: candidate.untrustedSource.bodyPreview.length, quote: candidate.untrustedSource.bodyPreview }],
    }));
    const body = { status: "completed", error: null, incomplete_details: null,
      output: [{ type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: JSON.stringify({ reviews }) }] }] };
    mutate(body);
    return new Response(JSON.stringify(body), { status: 200 });
  },
});

describe("promotion terminal envelope through adapter, ranker, Summary and V2", () => {
  it("accepts a completed positive control", async () => {
    const result = await run([fixture("terminal")], adapter(() => {}));
    expect(result.ranking.orderedCandidateIds).toEqual(["terminal"]);
    expect(result.candidates[0]!.evidenceQualityScore).toBe(0.8);
  });
  it.each(mutations)("keeps %s JSON pending with zero evidence", async (_name, mutate) => {
    const result = await run([fixture("terminal")], adapter(mutate));
    expect(result.ranking.orderedCandidateIds).toEqual([]);
    expect(result.candidates[0]!.evidenceQualityScore).toBe(0);
    expect(result.items[0]!.contentQuality).toMatchObject({ needsLlmReview: true,
      reason: "promotion_assessment_pending:unavailable_or_timeout" });
  });
});
