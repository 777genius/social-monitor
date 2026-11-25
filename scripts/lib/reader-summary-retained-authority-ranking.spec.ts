import { classifyFeedPromotionEligibility, evaluateReaderPromotionV2, FeedItem } from "@social-monitor/feed/domain";
import type { RetainedPromotionAuthority } from "@social-monitor/feed/domain/value-objects/retained-promotion-authority";
import type { FeedItemReadRepositoryPort, PromotionFeedItemCandidate } from "@social-monitor/feed/ports";
import { FixedClock } from "@social-monitor/shared-kernel";
import { mapRankedItem } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence-support";
import { readerSummaryPromotionV2Candidate } from "@social-monitor/summary/adapters/evidence/reader-summary-editorial-candidate";
import { RelevanceReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import type { SummaryEvidenceSelection } from "@social-monitor/summary/domain";
import { accepting, fixture, query, scope } from "../../test/support/promotion-content-assessment";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";

const execution = new Date("2026-09-15T14:27:48.446Z");
const retainedAt = "2026-09-15T01:03:27.135Z";
const start = new Date("2026-09-10T00:00:00.000Z");
const end = new Date("2026-09-11T00:00:00.000Z");
const digest = "a".repeat(64);
const authorization = (): RetainedPromotionAuthority => ({
  mode: "retained-current-authority", projection: "feed-engagement-snapshot-and-last-two-observations-v1",
  boundThrough: "2026-09-15T14:20:00.000Z",
  bindings: [{ feedItemId: "retained", authoritySha256: digest, cutoffAt: retainedAt }],
});

const setup = (provider: string, mutate?: (candidate: PromotionFeedItemCandidate) => PromotionFeedItemCandidate) => {
  const item = fixture("retained", provider, { publishedAt: new Date("2026-09-10T12:00:00.000Z"),
    observedAt: new Date("2026-09-10T12:01:00.000Z") });
  const canonical = classifyFeedPromotionEligibility(item.toSnapshot());
  if (!canonical.eligible) throw new Error("Invalid fixture");
  const base: PromotionFeedItemCandidate = { item, canonical,
    metricAuthority: { observedAt: new Date(retainedAt), regressionState: "stable" },
    retainedAuthoritySha256: digest, retainedAuthorityObservedAt: "2026-09-15T01:03:27.135000Z" };
  const candidate = mutate?.(base) ?? base;
  const readPromotionSnapshot = jest.fn(async () => ({ ok: true as const,
    candidates: [candidate], exhausted: true as const, physicalRowsRead: 1,
    sourceContent: [{ feedItemId: "retained", sourceItemId: item.toSnapshot().sourceItemId,
      body: candidate.item.toSnapshot().bodyPreview }] }));
  const feed: FeedItemReadRepositoryPort = { list: async () => ({ items: [] }),
    findById: async () => null, readPromotionSnapshot };
  const reviewBatch = jest.fn(accepting.reviewBatch!);
  const ranker = new RankFeedItemsUseCase(feed, { findByUser: async () => null } as never,
    new FixedClock(execution), undefined, undefined, undefined, { reviewBatch }, undefined,
    { readCurrent: async (requested) => ({ kind: "available", interest: { ...requested, query } }) });
  return { ranker, reviewBatch, readPromotionSnapshot, feed };
};
const execute = async (provider: string, authority: RetainedPromotionAuthority | undefined,
  mutate?: (candidate: PromotionFeedItemCandidate) => PromotionFeedItemCandidate) => {
  const context = setup(provider, mutate);
  const result = await context.ranker.execute({ ...scope, limit: 10,
    rankingProfile: "reader_post_promotion", publishedAtOrAfter: start, publishedBefore: end,
    observedAtOrBefore: execution, ...(authority === undefined ? {} : { retainedEngagementAuthority: authority }) });
  if (!result.ok) throw result.error;
  const item = mapRankedItem(result.value.items[0]!, execution);
  const selection: SummaryEvidenceSelection = { rankingPolicyVersion: "fixture", selectedEvidence: [item], clusters: [],
    sourceWindow: { windowId: "retained", startedAt: start, endedAt: end, periodStartedAt: start, periodEndedAt: end,
      ingestionCutoff: execution, selectedFeedItemIds: [item.feedItemId], storyClusterIds: [] } };
  const finalCandidate = readerSummaryPromotionV2Candidate(item, selection)!;
  return { ...context, item, selection, finalCandidate, evaluation: evaluateReaderPromotionV2(finalCandidate) };
};

describe.each(["reddit", "x-twitter", "hacker-news"])("%s retained historical authority", (provider) => {
  it("admits an old retained observation to the reviewer and final V2 at the same bound cutoff", async () => {
    const result = await execute(provider, authorization());
    expect(result.reviewBatch).toHaveBeenCalledTimes(1);
    expect(result.reviewBatch.mock.calls[0]![0].map((request) => request.candidateId)).toEqual(["retained"]);
    expect(result.finalCandidate.engagementCutoffAt).toBe(retainedAt);
    expect(result.item.promotionFacts?.retainedEngagementAuthority).toMatchObject({ cutoffAt: retainedAt, authoritySha256: digest });
    expect(result.evaluation.admitted).toBe(true);
    expect(result.readPromotionSnapshot).toHaveBeenCalledWith(expect.objectContaining({ timestampPolicy: "published_at",
      observedThrough: execution, windowStartedAt: start, windowEndedAt: end, retainedAuthorityProjection: true }));
  });

  it("admits live observations older than six hours without requesting a retained projection", async () => {
    const result = await execute(provider, undefined);
    expect(result.reviewBatch).toHaveBeenCalledTimes(1);
    expect(result.evaluation.admitted).toBe(true);
    expect(result.finalCandidate.engagementCutoffAt).toBe(execution.toISOString());
    expect(result.readPromotionSnapshot.mock.calls[0]).toBeDefined();
    expect(result.readPromotionSnapshot).toHaveBeenCalledWith(expect.not.objectContaining({ retainedAuthorityProjection: true }));
  });

  it("keeps live observations eligible while the six-hour age gate is off", async () => {
    const fresh = new Date(execution.getTime() - 6 * 3_600_000);
    const result = await execute(provider, undefined, (candidate) => ({ ...candidate,
      metricAuthority: { observedAt: fresh, regressionState: "stable" } }));
    expect(result.reviewBatch).toHaveBeenCalledTimes(1);
    expect(result.evaluation.admitted).toBe(true);
    const stale = await execute(provider, undefined, (candidate) => ({ ...candidate,
      metricAuthority: { observedAt: new Date(fresh.getTime() - 1), regressionState: "stable" } }));
    expect(stale.reviewBatch).toHaveBeenCalledTimes(1);
    expect(stale.evaluation.admitted).toBe(true);
  });

  it.each<[string, (candidate: PromotionFeedItemCandidate) => PromotionFeedItemCandidate]>([
    ["post-authority observation", (c) => ({ ...c, metricAuthority: { observedAt: new Date("2026-09-15T01:03:27.136Z"), regressionState: "stable" } })],
    ["future observation", (c) => ({ ...c, metricAuthority: { observedAt: new Date("2026-09-16T00:00:00.000Z"), regressionState: "stable" } })],
    ["submillisecond post-authority observation", (c) => ({ ...c, retainedAuthorityObservedAt: "2026-09-15T01:03:27.135001Z" })],
    ["missing authority", (c) => ({ ...c, metricAuthority: undefined })],
    ["missing projection", (c) => ({ ...c, retainedAuthoritySha256: undefined })],
    ["changed projection", (c) => ({ ...c, retainedAuthoritySha256: "b".repeat(64) })],
    ["unresolved regression", (c) => ({ ...c, metricAuthority: { observedAt: new Date(retainedAt), regressionState: "unresolved_regression" } })],
    ["observed after authorized capture", (c) => ({ ...c, item: FeedItem.rehydrate({ ...c.item.toSnapshot(), observedAt: execution }) })],
    ["invalid exact timestamp ordering", (c) => ({ ...c, exactTimestamps: { publishedAt: "2026-09-10T12:00:00.000001Z", observedAt: "2026-09-10T12:00:00.000000Z" } })],
    ["unsafe content", (c) => ({ ...c, item: FeedItem.rehydrate({ ...c.item.toSnapshot(), title: "I used a coding agent to interpret my medical diagnosis from the doctor", bodyPreview: "A medical diagnosis from the doctor" }) })],
    ["below-floor metrics", (c) => ({ ...c, item: FeedItem.rehydrate({ ...c.item.toSnapshot(), providerMetadata:
      provider === "reddit" ? { kind: "reddit_post", score: 0, upvoteRatio: 0.9 }
        : provider === "x-twitter" ? { kind: "x_post", contentKind: "original_post", likes: 0, reposts: 0 }
        : { kind: "hacker_news_story", points: 0 } }) })],
  ])("excludes %s before review and at final admission", async (_label, mutate) => {
    const result = await execute(provider, authorization(), mutate);
    expect(result.reviewBatch).not.toHaveBeenCalled();
    expect(result.evaluation.admitted).toBe(false);
  });

  it.each([{ bindings: [] }, { bindings: [{ feedItemId: "other", authoritySha256: digest, cutoffAt: retainedAt }] },
    { bindings: [...authorization().bindings, ...authorization().bindings] }])("rejects missing, foreign or duplicate bindings: %j", async ({ bindings }) => {
    const result = await execute(provider, { ...authorization(), bindings });
    expect(result.reviewBatch).not.toHaveBeenCalled();
    expect(result.evaluation.admitted).toBe(false);
  });
});

it("carries the explicit authority from evidence selection to ranking without changing published_at", async () => {
  const context = setup("reddit");
  const selector = new RelevanceReaderSummaryEvidenceSelector(context.ranker, context.feed, new FixedClock(execution));
  const result = await selector.select({ ...scope, scope: { type: "workspace" },
    period: { cadence: "daily", startedAt: start, endedAt: end, timezone: "UTC", periodKey: "2026-09-10" },
    maxItems: 10, timestampPolicy: "published_at", observedThrough: execution,
    retainedEngagementAuthority: authorization() });
  expect(context.reviewBatch).toHaveBeenCalledTimes(1);
  expect(result.selectedEvidence.some((item) => item.feedItemId === "retained")).toBe(true);
});


it("preserves a bound microsecond observation while projecting both V2 times to milliseconds", async () => {
  const exact = "2026-09-15T01:03:27.135001Z";
  const authority = { ...authorization(), bindings: [{ feedItemId: "retained", authoritySha256: digest, cutoffAt: exact }] };
  const result = await execute("reddit", authority, (candidate) => ({ ...candidate, retainedAuthorityObservedAt: exact }));
  expect(result.reviewBatch).toHaveBeenCalledTimes(1);
  expect(result.item.promotionFacts?.retainedEngagementAuthority?.cutoffAt).toBe(exact);
  expect(result.finalCandidate.engagementCutoffAt).toBe(retainedAt);
  expect(result.evaluation.admitted).toBe(true);
});

it.each([
  { boundThrough: "2026-09-15T01:00:00.000Z" },
  { boundThrough: "2026-09-15T14:27:48.446001Z" },
  { projection: "unrecognized-projection" },
  { mode: "live" },
])("rejects invalid explicit authority at assessment: %j", async (patch) => {
  const result = await execute("reddit", { ...authorization(), ...patch } as RetainedPromotionAuthority);
  expect(result.reviewBatch).not.toHaveBeenCalled();
  expect(result.evaluation.admitted).toBe(false);
});

it("rejects observed_at retained mode before reading candidates or calling the reviewer", async () => {
  const context = setup("reddit");
  const result = await context.ranker.execute({ ...scope, limit: 10, rankingProfile: "reader_post_promotion",
    observedAtOrAfter: start, observedBefore: end, observedAtOrBefore: execution,
    retainedEngagementAuthority: authorization() });
  expect(result.ok).toBe(false);
  expect(context.readPromotionSnapshot).not.toHaveBeenCalled();
  expect(context.reviewBatch).not.toHaveBeenCalled();
});

it.each(["missing", "future", "regression", "floor", "unsafe", "cutoff", "ordering"])(
  "rechecks %s at final admission even with an accepted review", async (failure) => {
    const result = await execute("reddit", authorization());
    const facts = result.item.promotionFacts!;
    const changed = { ...result.item, promotionFacts: { ...facts,
      ...(failure === "missing" ? { engagementAuthority: undefined } : {}),
      ...(failure === "future" ? { engagementAuthority: { ...facts.engagementAuthority!, observedAt: execution } } : {}),
      ...(failure === "regression" ? { engagementAuthority: { ...facts.engagementAuthority!, regressionState: "unresolved_regression" as const } } : {}),
      ...(failure === "floor" ? { metrics: { provider: "reddit" as const, score: 0 } } : {}),
      ...(failure === "unsafe" ? { safetyValid: false } : {}),
      ...(failure === "cutoff" ? { retainedEngagementAuthority: { ...facts.retainedEngagementAuthority!, cutoffAt: execution.toISOString() } } : {}),
      ...(failure === "ordering" && facts.freshnessProvenance?.status === "observed"
        ? { freshnessProvenance: { ...facts.freshnessProvenance, exactObservedAt: "2026-09-15T14:20:00.000001Z" } } : {}),
    } };
    const candidate = readerSummaryPromotionV2Candidate(changed, result.selection)!;
    expect(candidate.admission.qualityFloorMet).toBe(true);
    expect(evaluateReaderPromotionV2(candidate).admitted).toBe(false);
  },
);


it("keeps feed ingestion ordering separate from the retained metric observation clock", async () => {
  const result = await execute("reddit", authorization(), (candidate) => ({ ...candidate,
    item: FeedItem.rehydrate({ ...candidate.item.toSnapshot(), observedAt: new Date("2026-09-15T01:04:00.000Z") }),
  }));
  expect(result.reviewBatch).toHaveBeenCalledTimes(1);
  expect(result.evaluation.admitted).toBe(true);
  expect(result.finalCandidate.engagementCutoffAt).toBe(retainedAt);
  expect(result.item.promotionFacts?.freshnessProvenance).toMatchObject({ ingestionCutoff: execution });
});


it("rejects a bound metric observation before the content was published", async () => {
  const beforePublication = "2026-09-09T01:00:00.000Z";
  const authority = { ...authorization(), bindings: [{ feedItemId: "retained", authoritySha256: digest, cutoffAt: beforePublication }] };
  const result = await execute("reddit", authority, (candidate) => ({ ...candidate,
    metricAuthority: { observedAt: new Date(beforePublication), regressionState: "stable" },
    retainedAuthorityObservedAt: "2026-09-09T01:00:00.000000Z",
  }));
  expect(result.reviewBatch).not.toHaveBeenCalled();
  expect(result.evaluation.admitted).toBe(false);
});
