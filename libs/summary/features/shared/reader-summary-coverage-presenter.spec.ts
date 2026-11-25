import type { ReaderSummaryArtifactProps } from "../../domain";
import { buildReaderSummaryCoverageView } from "./reader-summary-coverage-presenter";

describe("buildReaderSummaryCoverageView promotion counts", () => {
  it("does not count ten supplemental GitHub appendix entries as promotion posts", () => {
    const supplementalIds = Array.from({ length: 10 }, (_, index) =>
      `github-trending:${index + 1}`);
    const snapshot = {
      sourceWindow: {
        windowId: "window",
        startedAt: new Date("2026-08-18T00:00:00.000Z"),
        endedAt: new Date("2026-08-19T00:00:00.000Z"),
        selectedFeedItemIds: ["hn:eligible", ...supplementalIds],
        storyClusterIds: [],
      },
      promotionAttestations: [{
        candidateId: "hn:eligible",
        supportFacts: [],
      }],
      storyClusters: [],
      citationMap: [],
    } as unknown as ReaderSummaryArtifactProps;

    const coverage = buildReaderSummaryCoverageView(
      snapshot,
      { sourceMix: [], topReads: [] },
      { status: "fresh", checkedAt: "2026-08-19T00:00:00.000Z" },
      undefined,
    );

    expect(coverage.selectedFeedItemCount).toBe(1);
  });
});
