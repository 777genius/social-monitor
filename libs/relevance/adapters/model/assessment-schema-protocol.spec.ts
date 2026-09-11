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
const compatible = {
  "observed batch one": (o: { reviews: Wire[] }) => ({ results: o.reviews.map((r) => observed(r)) }),
  "observed batch two": (o: { reviews: Wire[] }) => ({ results: o.reviews.map((r) => observed(r, true)) }),
  // The same two dialects under the schema-compliant `reviews` envelope instead
  // of the legacy `results` envelope. Normalization must key
  // off the item shape, not the outer key.
  "observed batch one under reviews envelope": (o: { reviews: Wire[] }) => ({ reviews: o.reviews.map((r) => observed(r)) }),
  "observed batch two under reviews envelope": (o: { reviews: Wire[] }) => ({ reviews: o.reviews.map((r) => observed(r, true)) }),
  "results alias only": (o: { reviews: Wire[] }) => ({ results: o.reviews }),
} as const;
const mutations: Record<string, (output: { reviews: Wire[] }) => Wire> = {
  // A single tampered field on an otherwise-complete canonical item is not a
  // legacy dialect and must stay rejected, not reinterpreted.
  "relevant decision": (o) => ({ reviews: o.reviews.map((r) => ({ ...r, decision: "relevant" })) }),
  "not_relevant decision": (o) => ({ reviews: o.reviews.map((r) => ({ ...r, decision: "not_relevant" })) }),
  // A genuine legacy-shaped item with a tampered binding must still be
  // rejected: item-dialect normalization cannot weaken the binding check.
  "legacy dialect with tampered binding": (o) => ({ reviews: o.reviews.map((r) =>
    observed({ ...r, bindingId: `${String(r.bindingId)}-tampered` })) }),
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

  it.each(Object.entries(compatible))(
    "accepts a nonempty completed %s response with exact request binding", async (_name, mutate) => {
    let calls = 0;
    const adapter = new AgentRuntimeSourceContentQualityReviewerAdapter({
      clock: new FixedClock(cutoff), ids: { generate: () => `sandbox-compatible-${++calls}` },
      batchTimeoutMs: 300_000, totalTimeoutMs: 600_000,
      client: refreshTestRuntimeClient(async (request) =>
        attestRefreshExecution(request, mutate(outputFor(request)))),
    });
    const result = await run([fixture("protocol")], adapter);
    expect(calls).toBe(1);
    expect(result.items[0]!.contentQuality).toMatchObject({ qualityScore: 0.8,
      needsLlmReview: false, eligibleForSummary: true });
    expect(result.ranking.orderedCandidateIds).toEqual(["protocol"]);
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
    expect(result.ranking.orderedCandidateIds).toHaveLength(0);
    expect(result.items[0]!.contentQuality).toMatchObject({ qualityScore: 0,
      needsLlmReview: true, eligibleForTopRead: false });
  });

  it.each([true, false])("preserves canonical=%s compatible siblings when the third batch times out without retry", async (canonical) => {
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
          return attestRefreshExecution(request, canonical ? output
            : compatible[calls === 1 ? "observed batch one" : "observed batch two"](output));
        }),
      });
      const pending = run(Array.from({ length: 24 }, (_, i) => fixture(`wire-${String(i).padStart(2, "0")}`)),
        adapter, { clock: new SystemClock(), execution: { deadlineAtMs: cutoff.getTime() + 300_000 } });
      await jest.advanceTimersByTimeAsync(300_001);
      const result = await pending;
      expect(calls).toBe(3);
      expect(result.ranking.orderedCandidateIds).toHaveLength(16);
      expect(result.items.filter((item) => item.contentQuality.needsLlmReview)).toHaveLength(8);
      await jest.advanceTimersByTimeAsync(300_000);
      expect(calls).toBe(3);
      expect(result.ranking.orderedCandidateIds).toHaveLength(16);
    } finally { jest.useRealTimers(); }
  });
});
