import type { SourceContentQualityReviewRequest, SourceContentQualityReviewResult } from "../../ports";
import { PROMOTION_ASSESSMENT_BOUNDS as bounds } from "./promotion-content-assessment";
import { accepting, fixture, review, run } from "../../../../test/support/promotion-content-assessment";

describe("promotion assessment protocol and budgets through V2", () => {
  it("reviews the full >25 competing population in stable bounded batches", async () => {
    const reviewBatch = jest.fn(accepting.reviewBatch);
    const items = Array.from({ length: 37 }, (_, i) => fixture(`candidate-${String(i).padStart(2, "0")}`)).reverse();
    const result = await run(items, { reviewBatch });
    expect(result.ranking.ranked).toHaveLength(37);
    const calls = reviewBatch.mock.calls;
    expect(calls.map(([requests]) => requests.length)).toEqual([8, 8, 8, 8, 5]);
    expect(calls.flatMap(([requests]) => requests.map((r) => r.candidateId)))
      .toEqual(items.map((i) => i.toSnapshot().id).sort());
    for (const [requests] of calls) expect(new TextEncoder().encode(JSON.stringify(requests)).length)
      .toBeLessThanOrEqual(bounds.batchBytes);
  });

  it.each([undefined, { reviewBatch: async () => [] }, { reviewBatch: async () => { throw new Error("unavailable"); } }])(
    "keeps missing/unavailable reviewer evidence pending", async (reviewer) => {
      const result = await run([fixture("clean", "hacker-news", {
        title: "Developer tooling and secure coding include new compiler diagnostic messages", bodyPreview: "",
      })], reviewer);
      expect(result.items[0]!.contentQuality).toMatchObject({ qualityScore: 0, decision: "needs_context",
        needsLlmReview: true, eligibleForTopRead: false });
      expect(result.ranking.ranked).toHaveLength(0);
    });

  const malformed: Record<string, (r: SourceContentQualityReviewRequest) => SourceContentQualityReviewResult> = {
    "low confidence": (r) => review(r, { confidence: 0.79 }),
    "missing score": (r) => review(r, { qualityScore: undefined }),
    "nonfinite score": (r) => review(r, { qualityScore: NaN }),
    "inflated score": (r) => review(r, { qualityScore: 1.1 }),
    "missing assessment": (r) => review(r, { assessment: undefined }),
    "transplanted binding": (r) => review(r, { assessment: { ...review(r).assessment!, binding: { ...r.promotion! } } }),
    "missing evidence": (r) => review(r, { assessment: { ...review(r).assessment!, evidence: [] } }),
    "other text": (r) => review(r, { assessment: { ...review(r).assessment!, evidence: [
      { field: "bodyPreview", start: 0, end: 10, quote: "unseen data" },
    ] } }),
    "invalid offsets": (r) => review(r, { assessment: { ...review(r).assessment!, evidence: [
      { field: "title", start: -1, end: r.title.length, quote: r.title },
    ] } }),
    "arbitrary clearing": (r) => review(r, { assessment: { ...review(r).assessment!, resolvedSoftFlags: [
      { flag: "crypto_promo" as never, justification: "Invalid hard override", evidence: review(r).assessment!.evidence },
    ] } }),
    "resolution without evidence": (r) => review(r, { assessment: { ...review(r).assessment!, resolvedSoftFlags: [
      { flag: "rumor_only", justification: "The cited local test describes observed behavior, not a release rumor.", evidence: [] },
    ] } }),
  };
  it.each(Object.keys(malformed))("fails closed on %s", async (name) => {
    const result = await run([fixture("invalid")], { reviewBatch: async (requests) => requests.map(malformed[name]!) });
    expect(result.ranking.ranked).toHaveLength(0);
    expect(result.items[0]!.contentQuality).toMatchObject({ qualityScore: 0, needsLlmReview: true });
  });

  it.each(["duplicate", "unknown"])("rejects an entire ambiguous %s response batch", async (kind) => {
    const result = await run([fixture("a"), fixture("b")], { reviewBatch: async (requests) => {
      const results = requests.map((r) => review(r));
      return [...results, { ...results[0]!, candidateId: kind === "unknown" ? "foreign" : "a" }];
    } });
    expect(result.ranking.ranked).toHaveLength(0);
    expect(result.items.every((i) => i.contentQuality.reason.endsWith("invalid_batch"))).toBe(true);
  });

  it("keeps the missing member of a partial batch pending", async () => {
    const result = await run([fixture("a"), fixture("b")], { reviewBatch: async (requests) => [review(requests[0]!)] });
    expect(result.ranking.orderedCandidateIds).toEqual(["a"]);
    expect(result.items.find((i) => i.feedItemId === "b")!.contentQuality.reason).toContain("missing_result");
  });

  it("bounds candidates and bytes without silently admitting overflow", async () => {
    const reviewBatch = jest.fn(accepting.reviewBatch);
    const result = await run(Array.from({ length: 205 }, (_, i) => fixture(`candidate-${String(i).padStart(3, "0")}`)), { reviewBatch });
    expect(reviewBatch.mock.calls.flatMap(([r]) => r)).toHaveLength(200);
    expect(result.items.filter((i) => i.contentQuality.needsLlmReview)).toHaveLength(5);
    expect(result.ranking.ranked).toHaveLength(200);
    const oversized = await run([fixture("large")], { reviewBatch }, { query: "configured interest ".repeat(5000) });
    expect(oversized.ranking.ranked).toHaveLength(0);
    expect(oversized.items[0]!.contentQuality.reason).toContain("budget_exhausted");
  });

  it("bounds total bytes and runs only one batch at a time", async () => {
    let active = 0;
    let peak = 0;
    let bytes = 0;
    const result = await run(Array.from({ length: 60 }, (_, i) => fixture(`long-${i}`, "reddit", {
      bodyPreview: "Observed compiler diagnostics on local examples. ".repeat(260),
    })), { reviewBatch: async (requests) => {
      peak = Math.max(peak, ++active);
      const size = new TextEncoder().encode(JSON.stringify(requests)).length;
      expect(size).toBeLessThanOrEqual(bounds.batchBytes);
      bytes += size;
      await Promise.resolve();
      active--;
      return requests.map((r) => review(r));
    } });
    expect(peak).toBe(1);
    expect(bytes).toBeLessThanOrEqual(bounds.totalBytes);
    expect(result.ranking.ranked.length).toBeGreaterThan(25);
    expect(result.ranking.ranked.length).toBeLessThan(60);
    expect(result.items.filter((i) => i.contentQuality.needsLlmReview).length).toBeGreaterThan(0);
  });

  it("declares truncated source and keeps insufficient context pending", async () => {
    const reviewBatch = jest.fn(async (requests: readonly SourceContentQualityReviewRequest[]) => requests.map((r) => {
      expect(r.promotion!.availability).toBe("truncated");
      expect(r.bodyPreview!.length).toBe(12_000);
      return review(r, { decision: "needs_context" });
    }));
    const result = await run([fixture("truncated", "reddit", { bodyPreview: "Measured local results. ".repeat(15_000) })], { reviewBatch });
    expect(reviewBatch).toHaveBeenCalledTimes(1);
    expect(result.ranking.ranked).toHaveLength(0);
  });

  it("aborts deadline-bound batches, stops at the total deadline and ignores late results", async () => {
    jest.useFakeTimers();
    const signals: AbortSignal[] = [];
    let late: (() => void) | undefined;
    const reviewBatch = jest.fn((requests: readonly SourceContentQualityReviewRequest[], options?: { signal: AbortSignal }) => {
      signals.push(options!.signal);
      return new Promise<readonly SourceContentQualityReviewResult[]>((resolve) => { late = () => resolve(requests.map((r) => review(r))); });
    });
    try {
      const pending = run(Array.from({ length: 40 }, (_, i) => fixture(`deadline-${i}`)), { reviewBatch });
      await jest.advanceTimersByTimeAsync(bounds.deadlineMs + 1);
      const result = await pending;
      expect(reviewBatch.mock.calls.length).toBeLessThanOrEqual(4);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      expect(result.ranking.ranked).toHaveLength(0);
      expect(result.items.every((i) => i.contentQuality.needsLlmReview)).toBe(true);
      late?.();
      await Promise.resolve();
      expect(result.ranking.ranked).toHaveLength(0);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
});
