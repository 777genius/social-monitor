import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { ok, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { headlineScope, withAssessment } from "./reader-headline.spec-support";
import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";
import { mapRankedItem } from "./relevance-reader-summary-evidence-support";
import {
  emptyPromotionSnapshot,
  FakeStoryRankingMetrics,
  readerSummaryEvidenceTestClock as clock,
  readerSummaryEvidenceTestPeriod as readerSummaryPeriod,
  readerSummaryRankedItemFixture as rankedItem,
} from "./relevance-reader-summary-evidence-test-fixtures";

describe("RelevanceReaderSummaryEvidenceSelector display readiness", () => {
  it("keeps only display-ready candidates in a mixed editorial slate", async () => {
    const acceptedBase = rankedItem({
      feedItemId: "accepted-hn",
      providerKey: "hacker-news",
      rank: 1,
      score: 3,
      sourceText: "Accepted HN source text with complete captured evidence.",
    });
    const acceptedAssessment = withAssessment(
      mapRankedItem(acceptedBase, clock.now(), headlineScope),
      acceptedBase.title,
    ).readerHeadline;
    const rankedItems = [
      { ...acceptedBase, readerHeadline: acceptedAssessment },
      rankedItem({
        feedItemId: "unavailable-hn",
        providerKey: "hacker-news",
        rank: 2,
        score: 2,
        readerHeadline: { status: "unavailable", reasonCode: "not_assessed" },
      }),
    ];
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      { execute: jest.fn(async () => ok({
        generatedAt: clock.now().toISOString(),
        profileApplied: false,
        items: rankedItems,
      })) } as unknown as RankFeedItemsUseCase,
      {
        readPromotionSnapshot: emptyPromotionSnapshot,
        list: jest.fn(async () => ({ items: [] })),
        findById: jest.fn(async () => null),
      } as FeedItemReadRepositoryPort,
      clock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenantId(headlineScope.tenantId),
      workspaceId: workspaceId(headlineScope.workspaceId),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 2,
    });

    expect(selection.editorialSlate?.orderedCandidateIds).toEqual(["accepted-hn"]);
  });
});
