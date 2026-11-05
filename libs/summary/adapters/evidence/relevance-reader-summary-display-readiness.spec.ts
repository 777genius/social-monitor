import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import { workspaceReaderSummaryScope } from "../../domain";
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
        title: "Cited story",
        bodyPreview: "Cited story",
        sourceText: "Cited story",
        readerHeadline: { status: "unavailable", reasonCode: "not_assessed" },
      }),
    ];
    const selector = selectorFor(rankedItems);

    const selection = await selector.select({
      tenantId: tenantId(headlineScope.tenantId),
      workspaceId: workspaceId(headlineScope.workspaceId),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 2,
    });

    expect(selection.editorialSlate?.orderedCandidateIds).toEqual(["accepted-hn"]);
    expect(selection.selectedEvidence.map((item) => item.feedItemId)).toEqual(["accepted-hn"]);
    expect(selection.editorialSlate?.excluded).toContainEqual(expect.objectContaining({
      candidateId: "unavailable-hn",
    }));
  });

  it("accepts a fully reviewed title-only candidate", async () => {
    const titleOnlyBase = rankedItem({
      feedItemId: "accepted-title-only",
      providerKey: "hacker-news",
      rank: 1,
      score: 3,
      sourceText: "",
    });
    const mapped = mapRankedItem(titleOnlyBase, clock.now(), headlineScope);
    const selection = await selectorFor([{
      ...titleOnlyBase,
      readerHeadline: withAssessment(mapped, titleOnlyBase.title).readerHeadline,
    }]).select(query);

    expect(selection.editorialSlate?.orderedCandidateIds).toEqual([
      "accepted-title-only",
    ]);
  });
});

function selectorFor(rankedItems: readonly RankedFeedItemView[]) {
  return new RelevanceReaderSummaryEvidenceSelector(
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
}

const query = {
  tenantId: tenantId(headlineScope.tenantId),
  workspaceId: workspaceId(headlineScope.workspaceId),
  scope: workspaceReaderSummaryScope(), period: readerSummaryPeriod, maxItems: 2,
};
const invalid = () => rankedItem({
  feedItemId: "eligible-invalid", providerKey: "hacker-news", rank: 1, score: 3,
  readerHeadline: { status: "unavailable", reasonCode: "unresolved_qualifications" },
});
const ineligibleReady = () => {
  const base = rankedItem({
    feedItemId: "ineligible-ready", providerKey: "hacker-news", rank: 2, score: 2,
    providerMetadata: { kind: "hacker_news_story", points: 0, comments: 0 },
  });
  return { ...base, readerHeadline: withAssessment(
    mapRankedItem(base, clock.now(), headlineScope), base.title,
  ).readerHeadline };
};

describe("display availability after authoritative eligibility", () => {
  it("keeps a useful post whose display headline is unavailable", async () => {
    const selection = await selectorFor([rankedItem({
      feedItemId: "source-title-hn",
      providerKey: "hacker-news",
      rank: 1,
      score: 3,
      title: "Developer tooling ships new compiler diagnostics",
      bodyPreview: "Useful source evidence for an AI developer summary.",
      readerHeadline: { status: "unavailable", reasonCode: "not_assessed" },
    })]).select(query);

    expect(selection.editorialSlate?.orderedCandidateIds).toEqual(["source-title-hn"]);
    expect(selection.editorialSlate?.excluded).not.toContainEqual(expect.objectContaining({
      candidateId: "source-title-hn", reasonCodes: ["display_headline_unavailable"],
    }));
  });
  it("leaves genuinely ineligible inventory with an empty slate", async () => {
    const selection = await selectorFor([ineligibleReady()]).select(query);
    expect(selection.editorialSlate?.orderedCandidateIds).toEqual([]);
    expect(selection.selectedEvidence).toEqual([]);
  });

  it("keeps unassessed source titles together with failed headline polish", async () => {
    const selection = await selectorFor([
      rankedItem({
        feedItemId: "source-title-hn",
        providerKey: "hacker-news",
        rank: 1,
        score: 3,
        title: "Developer tooling ships new compiler diagnostics",
        bodyPreview: "Useful source evidence for an AI developer summary.",
        readerHeadline: { status: "unavailable", reasonCode: "not_assessed" },
      }),
      rankedItem({
        feedItemId: "invalid-assessment-hn",
        providerKey: "hacker-news",
        rank: 2,
        score: 2,
        title: "Runtime regression discussion stays reader facing",
        bodyPreview: "Useful source evidence for an AI developer summary.",
        readerHeadline: { status: "unavailable", reasonCode: "invalid_assessment" },
      }),
    ]).select(query);

    expect([...selection.editorialSlate!.orderedCandidateIds].sort()).toEqual([
      "invalid-assessment-hn",
      "source-title-hn",
    ]);
    expect(selection.editorialSlate?.excluded).not.toContainEqual(expect.objectContaining({
      candidateId: "invalid-assessment-hn",
    }));
  });

  it("does not select unusable source titles without a display headline", async () => {
    const selection = await selectorFor(Array.from({ length: 6 }, (_, index) => ({
      ...invalid(), feedItemId: `eligible-invalid-${index}`,
      canonicalUrl: `https://example.test/invalid-${index}`,
      title: "Cited story",
      bodyPreview: "Cited story",
      sourceText: "Cited story",
      readerHeadline: { status: "unavailable" as const,
        reasonCode: index === 5 ? "invalid_assessment" as const : "unresolved_qualifications" as const },
    }))).select(query);
    expect(selection.editorialSlate?.orderedCandidateIds).toEqual([]);
    expect(selection.selectedEvidence).toEqual([]);
  });
});
