import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { ok, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";
import {
  FakeStoryRankingMetrics,
  readerSummaryEvidenceTestClock as clock,
  readerSummaryEvidenceTestPeriod as period,
} from "./relevance-reader-summary-evidence-test-fixtures";

describe("RelevanceReaderSummaryEvidenceSelector observed empty window", () => {
  it("does not fabricate evidence for an empty provider window", async () => {
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      {
        execute: jest.fn(async () =>
          ok({
            generatedAt: clock.now().toISOString(),
            profileApplied: false,
            items: [],
          }),
        ),
      } as unknown as RankFeedItemsUseCase,
      {
        list: jest.fn(async () => ({ items: [] })),
        findById: jest.fn(async () => null),
      },
      clock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-observed-empty"),
      workspaceId: workspaceId("workspace-observed-empty"),
      scope: { type: "workspace" },
      period,
      maxItems: 5,
      timestampPolicy: "observed_at",
    });

    expect(selection.selectedEvidence).toEqual([]);
    expect(selection.sourceWindow.selectedFeedItemIds).toEqual([]);
  });
});
