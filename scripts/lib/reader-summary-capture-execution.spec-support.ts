import { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { FeedItem } from "@social-monitor/feed/domain";
import { InMemoryUserRelevanceProfileRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { type Clock } from "@social-monitor/shared-kernel";
import { RelevanceReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { DeterministicReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-reader-summary-model.adapter";
import { ReaderSummaryJob } from "@social-monitor/summary/domain";
import type { ReaderSummaryNewInputRefreshAuthority } from "@social-monitor/summary/application/contracts/reader-summary-new-input-refresh-authority";
import type { ReaderSummaryV3PreflightPort } from "@social-monitor/summary/ports";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { FakeReaderSummaryJobRepository } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.spec-support";
import { PromotionControlArtifactRepository, PromotionControlPolicyRepository,
  PromotionControlPublication, PromotionControlEventPublisher, PromotionControlIdGenerator,
  promotionControlEmptyTopicMapBuilder } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job-promotion-control.spec-support";
import { readerSummaryPromotionControl, NOOP_READER_SUMMARY_PROMOTION_METRICS } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control";

import { cutoffScope, cutoffA, cutoffB, cutoffPeriod } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-cutoff.spec-support";
export { cutoffScope, cutoffA, cutoffB, cutoffPeriod } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-cutoff.spec-support";

export async function cutoffScenario(options: {
  readonly job?: ReaderSummaryJob;
  readonly authority?: ReaderSummaryNewInputRefreshAuthority;
  readonly preflight?: ReaderSummaryV3PreflightPort;
  readonly onLookup?: () => void;
} = {}) {
  let now = cutoffB.getTime();
  const clock: Clock = { now: () => new Date(now) };
  const jobs = new FakeReaderSummaryJobRepository();
  const job = options.job ?? ReaderSummaryJob.request({ ...cutoffScope, id: "cutoff-job",
    scope: { type: "workspace" }, period: cutoffPeriod, idempotencyKey: "live-attempt-A", requestedAt: cutoffA });
  await jobs.save(job);
  const lookup = jobs.findById.bind(jobs);
  jest.spyOn(jobs, "findById").mockImplementation(async (query) => {
    options.onLookup?.();
    return lookup(query);
  });
  const claim = jest.spyOn(jobs, "claimForExecution");
  const feed = new InMemoryFeedItemReadRepository();
  for (const [id, observedAt, providerKey] of [
    ["primary-early", new Date("2026-06-26T11:00:00Z"), "hacker-news"],
    ["primary-late", new Date("2026-06-26T12:30:00Z"), "hacker-news"],
    ["github-late", new Date("2026-06-26T12:30:00Z"), "github-trending-page"],
  ] as const) {
    feed.upsert(FeedItem.publish({ ...cutoffScope, id, interestId: "fixture-interest", sourceItemId: `source-${id}`,
      sourceBindingId: `binding-${providerKey}`, providerKey, canonicalUrl: `https://example.test/${id}`,
      title: `Runtime regression fixed in ${id}`, bodyPreview: "Runtime regression fixed with an available patch and measured benchmark results.",
      publishedAt: new Date("2026-06-26T10:00:00Z"), observedAt,
      providerMetadata: providerKey === "hacker-news" ? { kind: "hacker_news_story", points: 500, comments: 50 }
        : { kind: "github_trending_page_repository", repository: { fullName: "fixture/repo", totalStars: 20000 },
            trending: { rank: 1, starsGained: 1500, window: "daily" } },
    }));
  }
  const readSnapshot = feed.readPromotionSnapshot.bind(feed);
  const snapshotRead = jest.spyOn(feed, "readPromotionSnapshot").mockImplementation(async (query) => {
    const result = await readSnapshot(query);
    // In-memory filtering is real; synthetic canonical metrics also carry the
    // stable observation authority supplied by the durable repository in use.
    return result.ok ? { ...result, candidates: result.candidates.map((candidate) => ({
      ...candidate, metricAuthority: { observedAt: candidate.item.toSnapshot().observedAt,
        regressionState: "stable" as const },
    })) } : result;
  });
  const supplementalRead = jest.spyOn(feed, "list");
  const ranker = new RankFeedItemsUseCase(feed, new InMemoryUserRelevanceProfileRepository(), clock,
    undefined, undefined, undefined, { reviewBatch: async (requests) => requests.map((request) => ({
      candidateId: request.candidateId, decision: "promote" as const, confidence: 1,
      qualityScore: 1, interestRelevanceScore: 1, engagementIntegrityScore: 1, flags: [], reason: "Synthetic assessed fixture",
      assessment: { binding: request.promotion!, evidence: [{ field: "title" as const, start: 0,
        end: request.title.length, quote: request.title }], resolvedSoftFlags: [] },
    })) }, undefined, { readCurrent: async (scope) => ({ kind: "available", interest: { ...scope, query: "runtime regression" } }) });
  const selector = new RelevanceReaderSummaryEvidenceSelector(ranker, feed, clock);
  const select = jest.spyOn(selector, "select");
  const model = new DeterministicReaderSummaryModelAdapter();
  const generate = jest.spyOn(model, "generate").mockImplementation(async (input, route) => {
    now = Date.parse("2026-06-26T14:00:00Z");
    return DeterministicReaderSummaryModelAdapter.prototype.generate.call(model, input, route);
  });
  const artifacts = new PromotionControlArtifactRepository();
  const publication = new PromotionControlPublication(jobs, artifacts, new PromotionControlEventPublisher());
  const publish = jest.spyOn(publication, "publish");
  const github = { read: jest.fn(async (_query: { observedThrough: Date }) => {
    void _query;
    return { eligibleBindingIds: [], items: [], pageCount: 1 };
  }) };
  const dependencies: ConstructorParameters<typeof ExecuteReaderSummaryJobUseCase> = [jobs, artifacts,
    new PromotionControlPolicyRepository(), selector, model, publication, new PromotionControlIdGenerator(), clock,
    readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS), undefined, undefined,
    promotionControlEmptyTopicMapBuilder(), undefined, github, undefined, undefined, undefined, options.authority, options.preflight];
  return { job, jobs, claim, feed, selector, select, snapshotRead, supplementalRead, model, generate, artifacts,
    publish, github, dependencies, execute: new ExecuteReaderSummaryJobUseCase(...dependencies), clock };
}
