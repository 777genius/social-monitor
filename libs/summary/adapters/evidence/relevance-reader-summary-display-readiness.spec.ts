import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import { ReaderSummaryJob, workspaceReaderSummaryScope } from "../../domain";
import { ExecuteReaderSummaryJobUseCase } from "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { FakeReaderSummaryJobRepository } from "../../features/execute-reader-summary-job/execute-reader-summary-job.spec-support";
import { readerSummaryPromotionControl, NOOP_READER_SUMMARY_PROMOTION_METRICS } from "../../features/execute-reader-summary-job/reader-summary-promotion-control";
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
      candidateId: "unavailable-hn", reasonCodes: ["display_headline_unavailable"],
    }));
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
  it("leaves genuinely ineligible inventory with an empty slate", async () => {
    const selection = await selectorFor([ineligibleReady()]).select(query);
    expect(selection.editorialSlate?.orderedCandidateIds).toEqual([]);
    expect(selection.selectedEvidence).toEqual([]);
  });

  it.each([false, true])("fails early without model or publication (ineligible ready=%s)", async (includeReady) => {
    const jobs = new FakeReaderSummaryJobRepository();
    await jobs.save(ReaderSummaryJob.request({
      ...query, id: "display-job", idempotencyKey: "display-job-key", requestedAt: clock.now(),
    }));
    const selector = selectorFor([
      ...Array.from({ length: 6 }, (_, index) => ({
        ...invalid(), feedItemId: `eligible-invalid-${index}`,
        canonicalUrl: `https://example.test/invalid-${index}`,
        title: `Independent signal ${index}`,
        readerHeadline: { status: "unavailable" as const,
          reasonCode: index === 5 ? "invalid_assessment" as const : "unresolved_qualifications" as const },
      })),
      ...(includeReady ? [ineligibleReady()] : []),
    ]);
    const model = { route: jest.fn(), generate: jest.fn(), classifyError: jest.fn() };
    const artifacts = { save: jest.fn() };
    const publications = { publish: jest.fn() };
    const useCase = new ExecuteReaderSummaryJobUseCase(
      jobs, artifacts as never, {} as never, selector, model as never,
      publications as never, { generate: () => "unused-artifact" }, clock,
      readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
    );
    const result = await useCase.execute({ ...query, readerSummaryJobId: "display-job" });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({
      code: "external.dependency_unavailable",
      details: expect.objectContaining({ kind: "reader_summary_display_headlines_unavailable",
        selectedFeedItemIds: expect.arrayContaining(Array.from({ length: 6 }, (_, index) => `eligible-invalid-${index}`)) }),
    }) });
    expect(model.route).not.toHaveBeenCalled();
    expect(model.generate).not.toHaveBeenCalled();
    expect(model.classifyError).not.toHaveBeenCalled();
    expect(artifacts.save).not.toHaveBeenCalled();
    expect(publications.publish).not.toHaveBeenCalled();
    expect((await jobs.findById({ ...query, readerSummaryJobId: "display-job" }))?.toSnapshot())
      .toMatchObject({ status: "failed", failureReason: expect.stringContaining("selected headlines unavailable") });
  });
});
