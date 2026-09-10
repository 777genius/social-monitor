import { FixedClock, SystemClock } from "@social-monitor/shared-kernel";
import { AgentRuntimeSourceContentQualityReviewerAdapter } from "./agent-runtime-source-content-quality-reviewer.adapter";
import { parseReviews } from "./source-content-quality-review-wire";
import { cutoff, fixture, run } from "../../../../test/support/promotion-content-assessment";
import { outputFor } from "../../../../scripts/lib/source-content-assessment-runtime.spec-support";
import { attestRefreshExecution, refreshTestRuntimeClient } from "../../../../scripts/lib/reader-summary-new-input-refresh-model.spec-support";

type Wire = Record<string, unknown>;
// Sanitized shapes from both completed journals: qualityScore/confidence existed,
// relevance/integrity scores and flags did not. No original source text is copied.
const observed = (review: Wire, second = false): Wire => ({
  candidateId: review.candidateId, bindingId: review.bindingId,
  decision: "relevant", confidence: 0.95, qualityScore: 0.8,
  evidence: review.evidence,
  ...(second ? { justification: "Synthetic", screeningFlagResolutions: [] }
    : { reason: "Synthetic", flagResolutions: [] }),
});
const mutations: Record<string, (output: { reviews: Wire[] }) => Wire> = {
  "observed batch one": (o) => ({ results: o.reviews.map((r) => observed(r)) }),
  "observed batch two": (o) => ({ results: o.reviews.map((r) => observed(r, true)) }),
  "results alias only": (o) => ({ results: o.reviews }),
  "relevant decision": (o) => ({ reviews: o.reviews.map((r) => ({ ...r, decision: "relevant" })) }),
  "not_relevant decision": (o) => ({ reviews: o.reviews.map((r) => ({ ...r, decision: "not_relevant" })) }),
};
for (const field of ["confidence", "qualityScore", "interestRelevanceScore", "engagementIntegrityScore", "flags", "reason", "resolvedSoftFlags"]) {
  mutations[`missing ${field}`] = (o) => ({ reviews: o.reviews.map((r) => {
    const copy = { ...r }; delete copy[field]; return copy;
  }) });
}
for (const [field, alias] of [["reason", "justification"], ["resolvedSoftFlags", "flagResolutions"],
  ["resolvedSoftFlags", "screeningFlagResolutions"]] as const) {
  mutations[alias] = (o) => ({ reviews: o.reviews.map((r) => {
    const copy = { ...r, [alias]: r[field] }; delete copy[field]; return copy;
  }) });
}

describe("assessment schema consumer protocol", () => {
  it.each([{}, { results: [] }, { reviews: null }, { reviews: {} }])(
    "explicitly rejects missing/non-array reviews: %j", (output) => {
      expect(() => parseReviews(JSON.stringify(output))).toThrow("protocol requires a reviews array");
    });

  it.each(Object.keys(mutations))("rejects %s through attested structured output and keeps candidates pending", async (name) => {
    const failures: string[] = [];
    let calls = 0;
    const adapter = new AgentRuntimeSourceContentQualityReviewerAdapter({
      clock: new FixedClock(cutoff), ids: { generate: () => `sandbox-wire-${++calls}` },
      batchTimeoutMs: 300_000, totalTimeoutMs: 600_000,
      client: refreshTestRuntimeClient(async (request) => {
        const output = mutations[name]!(outputFor(request));
        const result = await attestRefreshExecution(request, output);
        // A valid text summary cannot repair malformed selected structured output.
        return { ...result, outputText: JSON.stringify(outputFor(request)) };
      }),
    });
    const result = await run([fixture("protocol")], { reviewBatch: async (requests, options) => {
      try { return await adapter.reviewBatch(requests, options); }
      catch (error) { failures.push((error as Error).message); throw error; }
    } });
    expect(calls).toBe(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).not.toContain("runtime completion");
    if (name.includes("observed") || name === "results alias only") {
      expect(failures[0]).toBe("Quality review protocol requires a reviews array");
    }
    expect(result.ranking.orderedCandidateIds).toHaveLength(0);
    expect(result.items[0]!.contentQuality).toMatchObject({ qualityScore: 0,
      needsLlmReview: true, eligibleForTopRead: false });
  });

  it.each([true, false])("preserves valid siblings=%s when the third batch times out without retry", async (valid) => {
    jest.useFakeTimers();
    jest.setSystemTime(cutoff);
    let calls = 0;
    try {
      const adapter = new AgentRuntimeSourceContentQualityReviewerAdapter({
        clock: new SystemClock(), ids: { generate: () => `sandbox-deadline-${calls}` },
        batchTimeoutMs: 300_000, totalTimeoutMs: 600_000,
        client: refreshTestRuntimeClient(async (request) => {
          calls++;
          if (calls === 3) return new Promise(() => {});
          const output = outputFor(request);
          return attestRefreshExecution(request, valid ? output
            : mutations[calls === 1 ? "observed batch one" : "observed batch two"]!(output));
        }),
      });
      const pending = run(Array.from({ length: 24 }, (_, i) => fixture(`wire-${String(i).padStart(2, "0")}`)),
        adapter, { clock: new SystemClock(), execution: { deadlineAtMs: cutoff.getTime() + 300_000 } });
      await jest.advanceTimersByTimeAsync(300_001);
      const result = await pending;
      expect(calls).toBe(3);
      expect(result.ranking.orderedCandidateIds).toHaveLength(valid ? 8 : 0);
      expect(result.items.filter((item) => item.contentQuality.needsLlmReview)).toHaveLength(valid ? 16 : 24);
      await jest.advanceTimersByTimeAsync(300_000);
      expect(calls).toBe(3);
      expect(result.ranking.orderedCandidateIds).toHaveLength(valid ? 8 : 0);
    } finally { jest.useRealTimers(); }
  });
});
