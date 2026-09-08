import { FixedClock } from "@social-monitor/shared-kernel";
import { classifyFeedPromotionEligibility } from "@social-monitor/feed/domain";
import { OpenAiSourceContentQualityReviewerAdapter } from
  "@social-monitor/relevance/adapters/model/openai-source-content-quality-reviewer.adapter";
import { accepting, cutoff, fixture, query, scope } from
  "../../test/support/promotion-content-assessment";
import { createReaderSummaryDailyCapturePublicationWiring } from "./reader-summary-daily-story-relation-verifier";

describe("fresh publication promotion assessment composition", () => {
  it("constructs the existing configured adapter and executes it before selection", async () => {
    const reviewBatch = jest.spyOn(OpenAiSourceContentQualityReviewerAdapter.prototype, "reviewBatch")
      .mockImplementation(accepting.reviewBatch);
    const item = fixture("composition", "reddit", { publishedAt: new Date(cutoff.getTime() - 1000) });
    const canonical = classifyFeedPromotionEligibility(item.toSnapshot());
    if (!canonical.eligible) throw new Error("Synthetic canonical fixture required");
    try {
      const wiring = createReaderSummaryDailyCapturePublicationWiring({
        replay: null, summaryClient: {} as never, clock: new FixedClock(cutoff),
        attestationSink: { record: jest.fn() }, summaryModelMode: "deterministic", agentRuntimeClient: null,
        env: { RELEVANCE_CONTENT_QUALITY_REVIEWER: "openai-responses", OPENAI_API_KEY: "synthetic-test-key" },
        configuredInterests: { readCurrent: async (scope) => ({ kind: "available", interest: { ...scope, query } }) },
        feedItems: { list: async () => ({ items: [] }), findById: async () => null,
          readPromotionSnapshot: async () => ({ ok: true, exhausted: true, physicalRowsRead: 1,
            candidates: [{ item, canonical, metricAuthority: { observedAt: cutoff, regressionState: "stable" } }],
            sourceContent: [{ feedItemId: "composition", sourceItemId: "source-composition", body: item.toSnapshot().bodyPreview }] }),
        },
      });
      const selected = await wiring.evidenceSelector.select({ ...scope, scope: { type: "workspace" },
        period: { cadence: "custom", timezone: "UTC", periodKey: "synthetic-period", startedAt: new Date("2026-09-08T00:00:00Z"), endedAt: cutoff },
        observedThrough: cutoff, maxItems: 120 });
      expect(reviewBatch).toHaveBeenCalledTimes(1);
      expect(reviewBatch.mock.calls[0]![0][0]!.promotion!.trustedIntent).toBe(query);
      expect(selected.selectedEvidence.map((item) => item.feedItemId)).toContain("composition");
    } finally { reviewBatch.mockRestore(); }
  });
});
