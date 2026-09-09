import { FixedClock, SystemClock } from "@social-monitor/shared-kernel";
import { SourceContentQualityPolicy } from "../../domain";
import { assessPromotionContent } from "./promotion-content-assessment";
import { headlineRequest, headlineReview, subjectProposal } from "../../../../test/support/promotion-reader-headline";
import { accepting, cutoff, fixture, run } from "../../../../test/support/promotion-content-assessment";
import type { SourceContentQualityReviewRequest } from "../../ports";

describe("headline annotation never participates in quality or ranking", () => {
  it("preserves complete ranking, scores, flags, evidence and selection byte-for-byte across headline states", async () => {
    const items = [fixture("a", "reddit", { title: "Orion benchmark", bodyPreview: "Orion benchmark simulation only." }),
      fixture("b", "reddit", { title: "Orion benchmark", bodyPreview: "Orion benchmark retracted." })];
    const baseline = await run(items, accepting);
    for (const state of ["accepted", "unavailable", "malformed", "missing"] as const) {
      const reviewBatch = jest.fn(async (requests: readonly SourceContentQualityReviewRequest[]) => requests.map((r) => {
        const result = headlineReview(r, state === "accepted" ? subjectProposal(r)
          : state === "unavailable" ? { status: "unavailable", reasonCode: "unresolved_qualifications" } : null);
        return state === "missing" ? { ...result, assessment: { ...result.assessment, readerHeadline: undefined } } : result;
      }));
      const actual = await run(items, { reviewBatch });
      expect(reviewBatch).toHaveBeenCalledTimes(1);
      const strip = (value: typeof actual) => JSON.stringify({ ...value,
        items: value.items.map(({ readerHeadline: _headline, ...item }) => item) });
      expect(strip(actual)).toBe(strip(baseline));
      expect(actual.items.map((i) => i.readerHeadline?.status)).toEqual([state === "accepted" ? "accepted" : "unavailable",
        state === "accepted" ? "accepted" : "unavailable"]);
    }
  });

  it.each(["missing", "duplicate", "foreign", "budget"])("returns unavailable for %s batch results", async (failure) => {
    const request = headlineRequest();
    const reviewBatch = jest.fn(async () => failure === "missing" ? [] : failure === "duplicate"
      ? [headlineReview(request), headlineReview(request)]
      : [{ ...headlineReview(request), candidateId: "foreign" }]);
    const result = await assessPromotionContent({ requests: failure === "budget"
      ? [{ ...request, bodyPreview: "x".repeat(64_001) }] : [request], reviewer: { reviewBatch },
      clock: new FixedClock(cutoff), policy: new SourceContentQualityPolicy() });
    expect(result.readerHeadlines.get(request.candidateId)?.status).toBe("unavailable");
    expect(result.verdicts.get(request.candidateId)?.eligibleForTopRead).toBe(false);
    expect(reviewBatch).toHaveBeenCalledTimes(failure === "budget" ? 0 : 1);
  });

  it("discards late replies without adding a second call or changing returned annotations", async () => {
    jest.useFakeTimers(); jest.setSystemTime(cutoff);
    try {
      const request = headlineRequest();
      const reviewBatch = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        return [headlineReview(request)];
      });
      const pending = assessPromotionContent({ requests: [request], reviewer: { reviewBatch },
        clock: new SystemClock(), policy: new SourceContentQualityPolicy() });
      await jest.advanceTimersByTimeAsync(15_001);
      const result = await pending;
      expect(result.readerHeadlines.get(request.candidateId)?.status).toBe("unavailable");
      await jest.advanceTimersByTimeAsync(10_000);
      expect(result.readerHeadlines.get(request.candidateId)?.status).toBe("unavailable");
      expect(reviewBatch).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });

  it.each([12_001, 256_001])("keeps full available source and original evidence at capture length %s", async (length) => {
    const prefix = "Orion benchmark. ";
    const tail = " Retracted fully.";
    const body = prefix + "x".repeat(length - prefix.length - tail.length) + tail;
    const reviewBatch = jest.fn(async (requests: readonly SourceContentQualityReviewRequest[]) => requests.map((r) => headlineReview(r)));
    const result = await run([fixture("long", "reddit", { title: "Orion benchmark", bodyPreview: body })], { reviewBatch });
    expect(reviewBatch.mock.calls[0]![0][0]!.promotion!.availability).toBe("truncated");
    expect(result.items[0]!.readerHeadline?.status).toBe("unavailable");
    expect(result.items[0]!.sourceText).toBe(body.slice(0, 256_000));
    expect(result.items[0]!.contentQuality.qualityScore).toBe(0.8);
  });
});
