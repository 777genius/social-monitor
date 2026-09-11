import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import { mapRankedItem } from "./relevance-reader-summary-evidence-support";
import { admittedSummaryEvidenceItem } from "../../domain/services/reader-post-promotion-evidence-admission";
import { assessedSource, headlineScope, withAssessment } from "./reader-headline.spec-support";
import { project } from "./reader-summary-faithful-source.spec-support";
import { readerPostDisplayHeadline } from "../../domain/services/reader-post-display-headline";

describe("headline mapping and unchanged top/additional placement", () => {
  it("carries the immutable relevance annotation through both summary mapping boundaries", () => {
    const lead = assessedSource();
    const ranked = { ...lead, publishedAt: lead.publishedAt.toISOString(), observedAt: lead.observedAt.toISOString(),
      safety: { status: "allowed", categories: [], rawPayloadRetained: false, retentionPolicy: "normalized_preview_only" }, rank: 1, clusterId: "cluster", clusterSize: 1, duplicateFeedItemIds: [] } as RankedFeedItemView;
    const mapped = mapRankedItem(ranked, lead.observedAt, headlineScope);
    const admitted = admittedSummaryEvidenceItem(mapped);
    expect(admitted.readerHeadline).toEqual(lead.readerHeadline);
    expect(admitted.readerHeadline).not.toBe(mapped.readerHeadline);
    expect(admitted.sourceText).toBe(lead.sourceText);
    expect(mapped.title).toBe(lead.title);
    expect(mapped.bodyPreview).toBe(lead.bodyPreview);
    expect(mapped.score).toBe(lead.score);
    expect(mapped.whyImportant).toEqual(lead.whyImportant);
    expect(mapRankedItem(ranked, lead.observedAt, { ...headlineScope, tenantId: "wrong" }).readerHeadline)
      .toEqual({ status: "unavailable", reasonCode: "invalid_assessment" });
  });

  it("applies the same exact display/source semantics after Additional overflow", () => {
    const lead = assessedSource();
    const higher = Array.from({ length: 8 }, (_, index) => withAssessment({
      ...lead, feedItemId: `higher-${index}`, sourceItemId: `source-higher-${index}`,
      canonicalUrl: `https://example.test/higher-${index}`,
      promotionFacts: { ...lead.promotionFacts!, canonicalIdentity: `higher:${index}`,
        metrics: { provider: "x", likes: 100_000, reposts: 0, weightedScore: 100_000 } },
    }, `Orion benchmark ${index}; simulation only`));
    const accepted = project([...higher, lead]);
    const unavailable = project([...higher, { ...lead, readerHeadline: undefined }]);
    expect(accepted.additionalPosts[0]?.title).toBe("Orion benchmark findings are preliminary; simulation only");
    expect(accepted.additionalPosts[0]?.capturedSource?.body).toBe(lead.sourceText);
    for (const group of ["topReads", "additionalPosts"] as const) {
      expect(accepted[group].map((card) => card.promotionCandidateId))
        .toEqual(unavailable[group].map((card) => card.promotionCandidateId));
      expect(accepted[group].map((card) => card.editorialScoreComponents))
        .toEqual(unavailable[group].map((card) => card.editorialScoreComponents));
    }
    expect(unavailable.additionalPosts[0]?.displayHeadline?.status).toBe("unavailable");
  });

  it.each(["wrong quote", "duplicate reference", "unknown field", "missing qualifications", "low confidence", "overflow"])(
    "fails closed for malformed accepted annotation: %s", (kind) => {
      const lead = assessedSource();
      const raw = structuredClone(lead.readerHeadline) as unknown as Record<string, unknown>;
      if (kind === "wrong quote") raw.support = [{ field: "title", start: 0, end: 5, quote: "Other" }];
      if (kind === "duplicate reference") raw.support = [...raw.support as unknown[], ...raw.support as unknown[]];
      if (kind === "unknown field") raw.extra = true;
      if (kind === "missing qualifications") delete raw.qualifications;
      if (kind === "low confidence") raw.confidence = 0.79;
      if (kind === "overflow") raw.qualifications = Array(9).fill((raw.qualifications as unknown[])[0]);
      expect(readerPostDisplayHeadline({ ...lead, readerHeadline: raw as typeof lead.readerHeadline }).status).toBe("unavailable");
    },
  );
});
