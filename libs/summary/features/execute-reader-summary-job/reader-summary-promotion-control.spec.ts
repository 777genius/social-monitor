import type { ReaderSummaryArtifact } from "../../domain";
import {
  enabledReaderSummaryPromotionControl,
  recordReaderSummaryPromotionLifecycle,
  type ReaderSummaryPromotionAggregateMetrics,
} from "./reader-summary-promotion-control";

describe("recordReaderSummaryPromotionLifecycle", () => {
  it("keeps supplemental GitHub entries out of aggregate promotion telemetry", () => {
    const records: ReaderSummaryPromotionAggregateMetrics[] = [];
    const control = enabledReaderSummaryPromotionControl({
      record: (metrics) => records.push(metrics),
    });
    const artifact = {
      toSnapshot: () => ({
        promotionAttestations: [{
          candidateId: "hn:eligible",
          placement: "top",
          supportFacts: [],
        }],
        sourceWindow: {
          selectedFeedItemIds: [
            "hn:eligible",
            ...Array.from({ length: 10 }, (_, index) =>
              `github-trending:${index + 1}`),
          ],
        },
      }),
    } as unknown as ReaderSummaryArtifact;

    recordReaderSummaryPromotionLifecycle({
      artifact,
      control,
      lifecycle: "delivered",
    });

    expect(records).toEqual([expect.objectContaining({
      candidateCount: 1,
      admittedEvidenceCount: 1,
      topCount: 1,
      additionalCount: 0,
    })]);
  });
});
