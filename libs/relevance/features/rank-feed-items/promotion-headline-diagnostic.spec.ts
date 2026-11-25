import { FixedClock } from "@social-monitor/shared-kernel";
import { SourceContentQualityPolicy } from "../../domain";
import { assessPromotionReaderHeadline as assess } from "./promotion-reader-headline-assessment";
import { assessPromotionContent } from "./promotion-content-assessment";
import { headlineRequest, headlineReview, subjectProposal } from "../../../../test/support/promotion-reader-headline";
import type { PromotionHeadlineDiagnostic } from "./promotion-headline-diagnostic";

describe("private actual headline branch diagnostics", () => {
  it.each([
    ["refusal", "model_incomplete_source", null, null, null],
    ["shape", "whole_input_shape", false, null, null],
    ["title", "whole_input_count", true, false, null],
    ["body", "whole_input_count", true, true, false],
    ["truncated", "request_truncated", null, null, null],
    ["length", "request_length", null, null, null],
    ["availability", "request_availability", null, null, null],
  ] as const)("distinguishes %s without changing reduced result", (mode, origin, shape, title, body) => {
    const base = headlineRequest(mode === "length" ? "x".repeat(12_001) : undefined);
    const request = mode === "truncated" || mode === "availability"
      ? { ...base, promotion: { ...base.promotion!, availability: mode === "truncated" ? "truncated" as const : "title_only" as const } } : base;
    const proposal = subjectProposal(request);
    const raw = mode === "refusal" || mode === "truncated" || mode === "availability" || mode === "length"
      ? { status: "unavailable", reasonCode: "incomplete_source" }
      : { ...proposal, wholeInput: mode === "shape" ? {} : { ...proposal.wholeInput,
        ...(mode === "title" ? { titleLength: 0 } : { bodyLength: 0 }) } };
    const review = headlineReview(request, raw);
    const observe = jest.fn();
    expect(assess(request, review, observe)).toEqual(assess(request, review));
    expect(assess(request, review)).toEqual({ status: "unavailable", reasonCode: "incomplete_source" });
    expect(observe).toHaveBeenCalledWith(request.candidateId, expect.objectContaining({
      reasonOrigin: origin, wholeInputShape: shape, titleCountEqual: title, bodyCountEqual: body,
    }));
  });

  it("preserves malformed binding/proposal precedence before request/whole checks", () => {
    const base = headlineRequest();
    const request = { ...base, promotion: { ...base.promotion!, availability: "truncated" as const } };
    const observe = jest.fn();
    assess(request, headlineReview(base, null), observe);
    expect(observe.mock.calls[0]![1].reasonOrigin).toBe("invalid_binding");
    assess(base, headlineReview(base, { ...subjectProposal(base), confidence: 0, wholeInput: {} }), observe);
    expect(observe.mock.calls[1]![1]).toMatchObject({ reasonOrigin: "invalid_proposal", wholeInputShape: null });
    assess(request, undefined, observe);
    expect(observe.mock.calls[2]![1].reasonOrigin).toBe("not_assessed");
  });

  it("counts UTF-16 and emits only the fixed private allowlist", () => {
    const request = headlineRequest("Orion benchmark 😀 e\u0301", "Orion benchmark 😀");
    let row: PromotionHeadlineDiagnostic | undefined;
    const result = assess(request, headlineReview(request), (_id, diagnostic) => { row = diagnostic; });
    expect(result.status).toBe("accepted");
    expect(row).toEqual({ reasonOrigin: "accepted", reviewedTitleUtf16: request.title.length,
      reviewedBodyUtf16: request.bodyPreview!.length, availability: "body_present",
      wholeInputShape: true, titleCountEqual: true, bodyCountEqual: true });
    expect(Object.isFrozen(row)).toBe(true);
    expect(JSON.stringify(row)).not.toContain("Orion");
    expect(result).not.toHaveProperty("reasonOrigin");
  });

  it.each(["throw", "reject", "pending"])("isolates %s sinks without retries or annotation differences", async (failure) => {
    const request = headlineRequest();
    const reviewBatch = jest.fn(async () => [headlineReview(request)]);
    const input = { requests: [request], reviewer: { reviewBatch }, policy: new SourceContentQualityPolicy(),
      clock: new FixedClock(new Date("2026-09-10T00:00:00Z")) };
    const baseline = await assessPromotionContent(input);
    const observe = jest.fn(() => {
      if (failure === "throw") throw new Error("synthetic sink failure");
      return failure === "reject" ? Promise.reject(new Error("synthetic sink rejection")) : new Promise<void>(() => {});
    });
    const observed = await assessPromotionContent({ ...input, observeHeadlineDiagnostic: observe });
    expect(observed).toEqual(baseline);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(reviewBatch).toHaveBeenCalledTimes(2);
  });
});
