import {
  evaluateReaderPromotionV2,
  rankReaderPromotionV2,
  type ReaderPromotionV2Candidate,
  type ReaderPromotionV2Engagement,
  type ReaderPromotionV2ObservedMetrics,
  type ReaderPromotionV2Provider,
} from "@social-monitor/feed/domain";
import { composeReaderSummaryEditorialSlate } from
  "@social-monitor/summary/adapters/evidence/reader-summary-editorial-slate";
import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "@social-monitor/summary/domain";
import { interestReaderSummaryScope, ReaderSummaryJob } from
  "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from
  "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { FakeReaderSummaryJobRepository } from
  "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.spec-support";
import {
  PromotionControlArtifactRepository,
  PromotionControlCapturingModel,
  PromotionControlEventPublisher,
  PromotionControlIdGenerator,
  PromotionControlPolicyRepository,
  PromotionControlPublication,
  promotionControlPeriod,
  promotionControlRejectingTopicMapBuilder,
  promotionControlZeroGitHubProjectionReader,
} from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job-promotion-control.spec-support";
import {
  NOOP_READER_SUMMARY_PROMOTION_METRICS,
  readerSummaryPromotionControl,
} from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control";
import { FixedClock, tenantId, workspaceId } from
  "@social-monitor/shared-kernel";

export type ReaderPromotionV2ProductAssertionEvidence = {
  readonly policyVersion: string;
  readonly thresholdCases: number;
  readonly slatePolicyVersion: string;
  readonly groupingCases: number;
  readonly deterministicOrder: readonly string[];
  readonly noSignalModelCalls: 0;
};

export const runReaderPromotionV2ProductAssertions =
async (): Promise<ReaderPromotionV2ProductAssertionEvidence> => {
  const cases: readonly [string, ReaderPromotionV2Candidate, boolean, boolean][] = [
    ["x-additional-likes", candidate("x", { likes: 15, reposts: 10 }), true, false],
    ["x-additional-reposts", candidate("x", { likes: 21, reposts: 7 }), true, false],
    ["x-top-likes", candidate("x", { likes: 30, reposts: 20 }), true, true],
    ["x-top-reposts", candidate("x", { likes: 50, reposts: 10 }), true, true],
    ["x-below-additional", candidate("x", { likes: 14, reposts: 10 }), false, false],
    ["x-below-top", candidate("x", { likes: 29, reposts: 20 }), true, false],
    ["reddit-additional-no-ratio", candidate("reddit", { score: 25 }), true, false],
    ["reddit-additional-ratio", candidate("reddit", { score: 25, upvoteRatio: 0.55 }), true, false],
    ["reddit-top-no-ratio", candidate("reddit", { score: 50 }), true, true],
    ["reddit-top-ratio", candidate("reddit", { score: 50, upvoteRatio: 0.6 }), true, true],
    ["reddit-low-ratio", candidate("reddit", { score: 50, upvoteRatio: 0.59 }), true, false],
    ["reddit-below-additional", candidate("reddit", { score: 24 }), false, false],
    ["reddit-below-ratio", candidate("reddit", { score: 25, upvoteRatio: 0.54 }), false, false],
    ["reddit-below-top", candidate("reddit", { score: 49 }), true, false],
    ["hn-additional", candidate("hacker_news", { points: 25 }), true, false],
    ["hn-top", candidate("hacker_news", { points: 50 }), true, true],
    ["hn-below-additional", candidate("hacker_news", { points: 24 }), false, false],
    ["hn-below-top", candidate("hacker_news", { points: 49 }), true, false],
    ["github-additional-stars", candidate("github", github(25, 0)), true, false],
    ["github-additional-forks", candidate("github", github(0, 50)), true, false],
    ["github-top-stars", candidate("github", github(50, 0)), true, true],
    ["github-top-forks", candidate("github", github(0, 100)), true, true],
    ["github-below-additional", candidate("github", github(24, 49)), false, false],
    ["github-below-top", candidate("github", github(49, 99)), true, false],
    ["zero-absent", candidate("hacker_news", { points: 0 }), false, false],
  ];
  for (const [name, input, admitted, topQualified] of cases) {
    const actual = evaluateReaderPromotionV2(input);
    assert(actual.admitted === admitted, name);
    assert(!actual.admitted || actual.topQualified === topQualified, name);
  }
  const malformedReddit = candidate("reddit", {
    score: 50, upvoteRatio: Number.NaN,
  });
  assert(!evaluateReaderPromotionV2(malformedReddit).admitted, "reddit-malformed");
  const freshGithub = candidate("github", github(50, 0));
  const staleGithub = {
    ...freshGithub,
    engagement: freshGithub.engagement.state === "observed" ? {
      ...freshGithub.engagement,
      metrics: { ...freshGithub.engagement.metrics, window: "stale" },
    } : freshGithub.engagement,
  } as unknown as ReaderPromotionV2Candidate;
  assert(!evaluateReaderPromotionV2(staleGithub).admitted, "github-stale");
  const unauthoritative = candidate("github", github(50, 0), {
    authoritative: false,
  });
  assert(!evaluateReaderPromotionV2(unauthoritative).admitted,
    "github-unauthoritative");

  const additional = selection([evidence("additional", "x", 35, false)]);
  const additionalSlate = composeReaderSummaryEditorialSlate({
    selection: additional,
  });
  assert(additionalSlate.top.length === 0 &&
    additionalSlate.additional.map((item) => item.candidateId).join() ===
      "additional", "additional-never-fills-top");

  const strong = selection([
    evidence("strong-x", "x", 80, true),
    evidence("strong-reddit", "reddit", 80, true),
  ], [{ leftFeedItemId: "strong-x", rightFeedItemId: "strong-reddit",
    confidence: 0.99 }]);
  const strongSlate = composeReaderSummaryEditorialSlate({ selection: strong });
  assert(strongSlate.orderedCandidateIds.length === 1, "strong-cross-provider");

  const weak = selection([
    evidence("weak-x", "x", 80, true),
    evidence("weak-reddit", "reddit", 80, true),
  ]);
  const weakSlate = composeReaderSummaryEditorialSlate({ selection: weak });
  assert(weakSlate.orderedCandidateIds.length === 2, "weak-separate");

  const sameProviderItems = [
    evidence("same-provider-a", "x", 80, true),
    evidence("same-provider-b", "x", 80, true),
  ];
  const sameProvider = selection(sameProviderItems, [], [{
    ...cluster("same-provider-a"),
    duplicateFeedItemIds: ["same-provider-b"],
  }]);
  assert(composeReaderSummaryEditorialSlate({ selection: sameProvider })
    .orderedCandidateIds.length === 1, "same-provider-normal-dedupe");

  const officialMissing = evidence(
    "official-missing", "x", 0, false, "missing",
  );
  const officialZero = evidence("official-zero", "x", 0, false, "zero");
  assert(composeReaderSummaryEditorialSlate({
    selection: selection([officialMissing]),
  }).orderedCandidateIds.length === 0, "official-cannot-manufacture-rating");
  assert(composeReaderSummaryEditorialSlate({
    selection: selection([officialZero]),
  }).orderedCandidateIds.length === 0, "official-zero-is-absent");

  const ordered = rankReaderPromotionV2([
    candidate("hacker_news", { points: 50 }, { id: "order-b" }),
    candidate("hacker_news", { points: 50 }, { id: "order-a" }),
  ]).orderedCandidateIds;
  const reversed = rankReaderPromotionV2([
    candidate("hacker_news", { points: 50 }, { id: "order-a" }),
    candidate("hacker_news", { points: 50 }, { id: "order-b" }),
  ]).orderedCandidateIds;
  assert(JSON.stringify(ordered) === JSON.stringify(reversed),
    "deterministic-order");

  const noSignalModelCalls = await proveCurrentNoSignalBranch();

  return Object.freeze({
    policyVersion: "reader_promotion_policy.v2",
    thresholdCases: cases.length + 3,
    slatePolicyVersion: additionalSlate.policyVersion,
    groupingCases: 4,
    deterministicOrder: ordered,
    noSignalModelCalls,
  });
};

const candidate = (
  provider: ReaderPromotionV2Provider,
  metrics: WithoutProvider<ReaderPromotionV2ObservedMetrics>,
  override: {
    readonly id?: string;
    readonly authoritative?: boolean;
    readonly authorityAt?: string;
    readonly checkedAt?: string;
  } = {},
): ReaderPromotionV2Candidate => {
  const id = override.id ?? `case-${provider}-${JSON.stringify(metrics)}`;
  const authorityAt = override.authorityAt ?? "2026-08-29T17:00:00.000Z";
  const normalizedMetrics = {
    ...metrics,
    provider,
    ...(provider === "github" && override.checkedAt !== undefined
      ? { checkedAt: override.checkedAt }
      : {}),
  } as ReaderPromotionV2ObservedMetrics;
  const engagement: ReaderPromotionV2Engagement = {
    state: "observed",
    authoritative: override.authoritative ?? true,
    authority: {
      source: provider === "github" ? "github_checked_at" : "durable_projection",
      observedAt: authorityAt,
      regressionState: "stable",
    },
    metrics: normalizedMetrics,
  };
  return {
    candidateId: id,
    canonicalIdentity: `canary:${id}`,
    provider,
    contentKind: provider === "github" ? "repository" :
      provider === "hacker_news" ? "story" : "original_post",
    publishedAt: "2026-08-29T12:00:00.000Z",
    engagementCutoffAt: "2026-08-29T18:00:00.000Z",
    admission: {
      relevanceFloorMet: true,
      qualityFloorMet: true,
      integrityFloorMet: true,
      safetyFloorMet: true,
      freshnessFloorMet: true,
    },
    engagement,
    relevanceScore: 0.9,
    evidenceQualityScore: 0.8,
    integrityScore: 0.85,
    freshnessScore: 0.75,
  };
};

const github = (starsDelta: number, forksDelta: number) => ({
  window: "24h" as const,
  checkedAt: "2026-08-29T17:00:00.000Z",
  starsDelta,
  forksDelta,
});

type WithoutProvider<T> = T extends unknown ? Omit<T, "provider"> : never;

const evidence = (
  id: string,
  provider: "x" | "reddit",
  signal: number,
  top: boolean,
  officialSignal?: "missing" | "zero",
): SummaryEvidenceItem => {
  const publishedAt = new Date("2026-08-29T12:00:00.000Z");
  const observedAt = new Date("2026-08-29T17:00:00.000Z");
  const metrics = provider === "x"
    ? { provider: "x" as const,
        likes: officialSignal === "zero" ? 0 : top ? 40 : 15,
        reposts: officialSignal === "zero" ? 0 : top ? 20 : 10,
        weightedScore: signal }
    : { provider: "reddit" as const, score: signal, upvoteRatio: 0.8 };
  return {
    feedItemId: id,
    sourceItemId: `source-${id}`,
    sourceBindingId: `binding-${id}`,
    interestId: "canary-interest",
    providerKey: provider,
    canonicalUrl: `https://example.invalid/${id}`,
    title: `Canary product assertion ${id}`,
    publishedAt,
    observedAt,
    score: signal,
    whyImportant: ["canary"],
    contentQuality: {
      qualityScore: 0.8,
      interestRelevanceScore: 0.9,
      engagementIntegrityScore: 0.85,
      eligibleForSummary: true,
      eligibleForTopRead: true,
      needsLlmReview: false,
      decision: "admit",
      flags: [],
      reason: "canary",
    },
    promotionFacts: {
      contentKind: "original_post",
      canonicalIdentity: `canary:${id}`,
      safetyValid: true,
      freshnessValid: true,
      freshnessProvenance: {
        status: "observed",
        publishedAt,
        observedAt,
        ingestionCutoff: new Date("2026-08-29T18:00:00.000Z"),
      },
      authorityAttestation: officialSignal !== undefined ? {
        status: "attested", official: true, trusted: true,
        attestedBy: "source_catalog",
      } : undefined,
      metricsState: officialSignal === "missing" ? "missing" : "observed",
      metrics: officialSignal === "missing" ? undefined : metrics,
      engagementAuthority: officialSignal === "missing" ? undefined : {
        observedAt,
        regressionState: "stable",
      },
    },
  };
};

const selection = (
  items: readonly SummaryEvidenceItem[],
  approvedSameStoryRelations: SummaryEvidenceSelection["approvedSameStoryRelations"] = [],
  clusters: readonly StoryCluster[] = items.map((item) => cluster(item.feedItemId)),
): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "story_ranking_v10",
  sourceWindow: {
    windowId: "canary-window",
    startedAt: new Date("2026-08-29T00:00:00.000Z"),
    endedAt: new Date("2026-08-29T18:00:00.000Z"),
    periodStartedAt: new Date("2026-08-29T00:00:00.000Z"),
    periodEndedAt: new Date("2026-08-30T00:00:00.000Z"),
    ingestionCutoff: new Date("2026-08-29T18:00:00.000Z"),
    selectedFeedItemIds: items.map((item) => item.feedItemId),
    storyClusterIds: clusters.map((item) => item.id),
  },
  clusters,
  selectedEvidence: items,
  approvedSameStoryRelations,
});

const cluster = (id: string): StoryCluster => ({
  id: `cluster-${id}`,
  storyKey: `story-${id}`,
  representativeFeedItemId: id,
  duplicateFeedItemIds: [],
  interestIds: ["canary-interest"],
  providerKeys: [],
  score: 1,
  observedAtRange: {
    startedAt: new Date("2026-08-29T17:00:00.000Z"),
    endedAt: new Date("2026-08-29T17:00:00.000Z"),
  },
  whyImportant: ["canary"],
});

const proveCurrentNoSignalBranch = async (): Promise<0> => {
  const tenant = tenantId("canary-tenant");
  const workspace = workspaceId("canary-workspace");
  const jobs = new FakeReaderSummaryJobRepository();
  const artifacts = new PromotionControlArtifactRepository();
  const events = new PromotionControlEventPublisher();
  const model = new PromotionControlCapturingModel();
  await jobs.save(ReaderSummaryJob.request({
    id: "canary-no-signal-job", tenantId: tenant, workspaceId: workspace,
    scope: interestReaderSummaryScope("canary-interest"),
    period: {
      ...promotionControlPeriod,
      startedAt: new Date("2026-08-29T00:00:00.000Z"),
      endedAt: new Date("2026-08-30T00:00:00.000Z"),
      periodKey:
        "custom:2026-08-29T00:00:00.000Z:2026-08-30T00:00:00.000Z:UTC",
    },
    idempotencyKey: "canary-no-signal",
    requestedAt: new Date("2026-08-29T18:00:00.000Z"),
  }));
  const result = await new ExecuteReaderSummaryJobUseCase(
    jobs, artifacts, new PromotionControlPolicyRepository(),
    { async select() { return selection([]); } }, model,
    new PromotionControlPublication(jobs, artifacts, events),
    new PromotionControlIdGenerator(),
    new FixedClock(new Date("2026-08-29T18:00:01.000Z")),
    readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
    undefined, undefined, promotionControlRejectingTopicMapBuilder(),
    undefined, promotionControlZeroGitHubProjectionReader(),
  ).execute({ tenantId: tenant, workspaceId: workspace,
    readerSummaryJobId: "canary-no-signal-job" });
  const artifact = artifacts.all()[0]?.toSnapshot();
  assert(result.ok && result.value.status === "no_signal", "no-signal-status");
  assert(model.generatedEvidenceIds().length === 0, "no-signal-zero-model-calls");
  assert(artifact?.topStories.length === 0 && artifact.usage.inputTokens === 0 &&
    artifact.usage.outputTokens === 0, "no-signal-empty-artifact");
  return 0;
};

const assert = (condition: boolean, name: string): void => {
  if (!condition) throw new Error(`canary_product_assertion_failed:${name}`);
};
