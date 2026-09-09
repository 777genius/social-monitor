import { createHash } from "node:crypto";
import { FixedClock } from "@social-monitor/shared-kernel";
import { SourceContentQualityPolicy } from "../../domain";
import { assessedPromotionVerdict } from "../../features/rank-feed-items/promotion-assessment-verdict";
import { assessPromotionReaderHeadline } from "../../features/rank-feed-items/promotion-reader-headline-assessment";
import { headlineRequest, reference, subjectProposal } from "../../../../test/support/promotion-reader-headline";
import { bindPromotionAssessment, promotionReviewInstructions, promotionWireCandidate } from "./promotion-review-wire";
import { parseReviews, promotionResponseSchema } from "./source-content-quality-review-wire";
import { AgentRuntimeSourceContentQualityReviewerAdapter } from "./agent-runtime-source-content-quality-reviewer.adapter";
import { attestRefreshExecution, refreshTestRuntimeClient } from "../../../../scripts/lib/reader-summary-new-input-refresh-model.spec-support";
import { outputFor } from "../../../../scripts/lib/source-content-assessment-runtime.spec-support";

describe("existing batch headline wire and authenticated runtime", () => {
  it("retains the existing exact source/context SHA-256 and transmits full reviewed inputs", () => {
    const request = headlineRequest("😀 First claim.\nLast character: 不", "Orion benchmark e\u0301");
    const wire = promotionWireCandidate(request);
    expect(wire.bindingId).toBe(createHash("sha256").update(JSON.stringify({ candidateId: request.candidateId,
      providerKey: request.providerKey, context: request.promotion, title: request.title,
      body: request.bodyPreview })).digest("hex"));
    expect(wire.untrustedSource).toEqual({ providerKey: request.providerKey, title: request.title, bodyPreview: request.bodyPreview });
    expect(promotionResponseSchema.properties.reviews.items.required).toContain("readerHeadline");
    for (const instruction of ["last character", "late retractions", "distinct title", "wholeInput",
      "Never slice", "eight distinct references", "untrusted", "one result per candidate"]) {
      expect(promotionReviewInstructions).toContain(instruction);
    }
  });

  it.each(["candidateId", "providerKey", "title", "bodyPreview", "tenantId", "workspaceId", "interestId",
    "sourceItemId", "sourceBindingId", "trustedIntent", "availability"])("rejects stale digest after %s changes", (field) => {
    const request = headlineRequest();
    const changed = ["candidateId", "providerKey", "title", "bodyPreview"].includes(field)
      ? { ...request, [field]: "changed" }
      : { ...request, promotion: { ...request.promotion!, [field]: "changed" } };
    expect(() => bindPromotionAssessment({ bindingId: promotionWireCandidate(request).bindingId,
      evidence: [], resolvedSoftFlags: [], readerHeadline: subjectProposal(request) }, changed))
      .toThrow("binding");
  });

  it("parses missing/malformed headline without losing an otherwise identical quality result", () => {
    const request = headlineRequest();
    const base = { candidateId: request.candidateId, bindingId: promotionWireCandidate(request).bindingId,
      decision: "promote", confidence: 0.95, qualityScore: 0.8, interestRelevanceScore: 0.95,
      engagementIntegrityScore: 0.95, flags: [], reason: "Synthetic", resolvedSoftFlags: [],
      evidence: [reference(request, request.title, "title")] };
    const quality: string[] = [];
    for (const readerHeadline of [undefined, null, { status: "available" }, subjectProposal(request)]) {
      const [review] = parseReviews(JSON.stringify({ reviews: [{ ...base, readerHeadline }] }), [request]);
      quality.push(JSON.stringify(assessedPromotionVerdict(request, review, new SourceContentQualityPolicy())));
      expect(assessPromotionReaderHeadline(request, review).status).toBe(readerHeadline && "text" in readerHeadline ? "accepted" : "unavailable");
    }
    expect(new Set(quality).size).toBe(1);
  });

  it.each(["available", "old", "oversize", "failed"])("uses one existing authenticated task for %s result", async (mode) => {
    const request = headlineRequest();
    let calls = 0;
    const adapter = new AgentRuntimeSourceContentQualityReviewerAdapter({
      clock: new FixedClock(new Date("2026-09-09T00:00:00Z")), ids: { generate: () => "synthetic-headline" },
      batchTimeoutMs: 15_000, totalTimeoutMs: 60_000,
      client: refreshTestRuntimeClient(async (command) => {
        calls++;
        expect(JSON.parse(command.controlsJson)).toMatchObject({ model: "gpt-5.6-sol", reasoningEffort: "high",
          schemaVersion: "source_content_assessment.v1", maxOutputTokens: 6_000 });
        expect(JSON.parse(command.outputSchemaJson)).toEqual(promotionResponseSchema);
        const old = outputFor(command);
        const output = mode === "old" ? old : { reviews: old.reviews.map((review) => ({ ...review,
          readerHeadline: mode === "oversize" ? { text: "x".repeat(128_001) } : subjectProposal(request) })) };
        const result = await attestRefreshExecution(command, output);
        return mode === "failed" ? { ...result, status: "failed" as const } : result;
      }),
    });
    if (mode === "oversize" || mode === "failed") {
      await expect(adapter.reviewBatch([request])).rejects.toThrow(mode === "oversize" ? "too large" : "must not be attested");
    } else {
      const [review] = await adapter.reviewBatch([request]);
      expect(assessedPromotionVerdict(request, review, new SourceContentQualityPolicy()).qualityScore).toBe(0.8);
      expect(assessPromotionReaderHeadline(request, review).status).toBe(mode === "old" ? "unavailable" : "accepted");
    }
    expect(calls).toBe(1);
  });
});
