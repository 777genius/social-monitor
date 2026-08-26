import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { InMemoryQueuePublisher } from "@social-monitor/platform-queue/adapters/in-memory";
import { WorkerRuntime } from "@social-monitor/platform-worker";
import { ReaderSummaryJobQueuePublisherAdapter } from "@social-monitor/summary/adapters/messaging/reader-summary-job-queue.adapter";
import { InMemorySummaryEventPublisher } from "@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher";
import { ReaderSummaryPromotionMetricsRecorder } from "@social-monitor/summary/adapters/metrics/reader-summary-promotion-metrics.recorder";
import { DeterministicReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-reader-summary-model.adapter";
import { InMemoryReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-publication";
import { InMemoryReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { readerSummaryPromotionControl } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { ExecuteReaderSummaryJobCommandHandler } from "@social-monitor/summary/interfaces/queue/execute-reader-summary-job-command.handler";
import {
  FixedClock,
  type IdGenerator,
  ok,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import type { ReaderSummaryItem } from "@social-monitor/summary/domain";
import type {
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryGitHubProjectionReaderPort,
  SummaryQuotaPort,
  UserSummaryPreferenceReaderPort,
} from "@social-monitor/summary/ports";

import { ReaderSummaryJobQueueDrainLoop } from "../apps/intelligence-worker/src/reader-summary-job-queue-drain-loop";
import { InMemorySummaryJobQueueReader } from "../apps/intelligence-worker/src/summary-job-queue-reader";

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `readerSummary-workflow-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

const workflowContentQuality = () => ({
  qualityScore: 0.9,
  interestRelevanceScore: 0.9,
  engagementIntegrityScore: 0.9,
  eligibleForSummary: true,
  eligibleForTopRead: true,
  needsLlmReview: false,
  decision: "eligible",
  flags: [],
  reason: "Workflow smoke evidence is publication eligible.",
});

const workflowFreshness = (publishedAt: string, observedAt: string) => ({
  status: "observed" as const,
  publishedAt: new Date(publishedAt),
  observedAt: new Date(observedAt),
  ingestionCutoff: new Date("2026-06-23T08:30:00.000Z"),
});

const workflowRedditPromotionFacts = () => ({
  contentKind: "original_post" as const,
  canonicalIdentity: "url:https://example.com/ai-tooling",
  safetyValid: true,
  freshnessValid: true,
  freshnessProvenance: workflowFreshness(
    "2026-06-23T08:00:00.000Z",
    "2026-06-23T08:01:00.000Z",
  ),
  metricsState: "observed" as const,
  metrics: {
    provider: "reddit" as const,
    score: 50,
    comments: 8,
    upvoteRatio: 0.6,
  },
});

const workflowGitHubPromotionFacts = () => ({
  contentKind: "repository" as const,
  canonicalIdentity: "url:https://github.com/example/ai-tooling",
  checkedAt: new Date("2026-06-23T08:30:00.000Z"),
  authorityAttestation: {
    status: "attested" as const,
    official: true,
    trusted: true,
    attestedBy: "source_catalog" as const,
  },
  safetyValid: true,
  freshnessValid: true,
  freshnessProvenance: workflowFreshness(
    "2026-06-23T08:02:00.000Z",
    "2026-06-23T08:03:00.000Z",
  ),
  metricsState: "observed" as const,
  metrics: {
    provider: "github_radar" as const,
    snapshotKind: "repository_growth" as const,
    windowStartedAt: new Date("2026-06-22T08:30:00.000Z"),
    windowEndedAt: new Date("2026-06-23T08:30:00.000Z"),
    starsDelta: 25,
    forksDelta: 0,
  },
});

const workflowHackerNewsPromotionFacts = () => ({
  contentKind: "story" as const,
  canonicalIdentity: "url:https://example.com/database-reliability",
  safetyValid: true,
  freshnessValid: true,
  freshnessProvenance: workflowFreshness(
    "2026-06-23T08:04:00.000Z",
    "2026-06-23T08:05:00.000Z",
  ),
  metricsState: "observed" as const,
  metrics: { provider: "hacker_news" as const, points: 50 },
});

class SelectedReaderSummaryEvidenceSelector implements ReaderSummaryEvidenceSelectorPort {
  async select(): ReturnType<ReaderSummaryEvidenceSelectorPort["select"]> {
    return {
      rankingPolicyVersion: "story_ranking_v1",
      personalization: {
        memoryGuidanceStatus: "available",
        memoryGuidanceApplied: true,
        providerPreferenceCount: 1,
        keywordPreferenceCount: 1,
        mutedKeywordCount: 0,
        blockedProviderCount: 0,
        signals: ["memory_guidance_available", "memory_guidance_applied"],
      },
      sourceWindow: {
        windowId: "workspace:readerSummary-workflow-smoke",
        startedAt: new Date("2026-06-23T08:00:00.000Z"),
        endedAt: new Date("2026-06-23T08:30:00.000Z"),
        selectedFeedItemIds: [
          "feed-reddit",
          "feed-github",
          "feed-database",
        ],
        storyClusterIds: ["story:ai-tooling", "story:database-reliability"],
        periodStartedAt: new Date("2026-06-23T00:00:00.000Z"),
        periodEndedAt: new Date("2026-06-30T00:00:00.000Z"),
        ingestionCutoff: new Date("2026-06-23T08:30:00.000Z"),
      },
      clusters: [
        {
          id: "story:ai-tooling",
          storyKey: "url:example.com/ai-tooling",
          representativeFeedItemId: "feed-reddit",
          duplicateFeedItemIds: ["feed-github"],
          interestIds: ["topic-ai", "topic-github"],
          providerKeys: ["reddit", "github"],
          score: 2.4,
          observedAtRange: {
            startedAt: new Date("2026-06-23T08:00:00.000Z"),
            endedAt: new Date("2026-06-23T08:30:00.000Z"),
          },
          whyImportant: ["Clustered 2 similar items"],
        },
        {
          id: "story:database-reliability",
          storyKey: "url:example.com/database-reliability",
          representativeFeedItemId: "feed-database",
          duplicateFeedItemIds: [],
          interestIds: ["topic-database"],
          providerKeys: ["hacker-news"],
          score: 2.1,
          observedAtRange: {
            startedAt: new Date("2026-06-23T08:04:00.000Z"),
            endedAt: new Date("2026-06-23T08:10:00.000Z"),
          },
          whyImportant: ["A distinct reliability signal"],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: "feed-reddit",
          sourceItemId: "source-reddit",
          sourceBindingId: "binding-reddit",
          interestId: "topic-ai",
          providerKey: "reddit",
          providerName: "Reddit",
          canonicalUrl: "https://example.com/ai-tooling",
          title: "AI tooling library is trending",
          bodyPreview: "Developers are discussing a new AI tooling library.",
          publishedAt: new Date("2026-06-23T08:00:00.000Z"),
          observedAt: new Date("2026-06-23T08:01:00.000Z"),
          score: 2.4,
          whyImportant: ["Fresh item in the current monitoring window"],
          contentQuality: workflowContentQuality(),
          promotionFacts: workflowRedditPromotionFacts(),
        },
        {
          feedItemId: "feed-github",
          sourceItemId: "source-github",
          sourceBindingId: "binding-github",
          interestId: "topic-github",
          providerKey: "github",
          providerName: "GitHub Repo Radar",
          canonicalUrl: "https://github.com/example/ai-tooling",
          title: "AI tooling repository gains developer attention",
          bodyPreview: "The repository documents the AI tooling release.",
          publishedAt: new Date("2026-06-23T08:02:00.000Z"),
          observedAt: new Date("2026-06-23T08:03:00.000Z"),
          score: 2.3,
          whyImportant: ["Independent repository evidence for the cluster"],
          contentQuality: workflowContentQuality(),
          promotionFacts: workflowGitHubPromotionFacts(),
        },
        {
          feedItemId: "feed-database",
          sourceItemId: "source-database",
          sourceBindingId: "binding-database",
          interestId: "topic-database",
          providerKey: "hacker-news",
          providerName: "Hacker News",
          canonicalUrl: "https://example.com/database-reliability",
          title: "Database reliability practices gain attention",
          bodyPreview: "Engineers compare practical reliability techniques.",
          publishedAt: new Date("2026-06-23T08:04:00.000Z"),
          observedAt: new Date("2026-06-23T08:05:00.000Z"),
          score: 2.1,
          whyImportant: ["Distinct operational signal in the same window"],
          contentQuality: workflowContentQuality(),
          promotionFacts: workflowHackerNewsPromotionFacts(),
        },
      ],
      approvedSameStoryRelations: [
        {
          canonicalPairId: "feed-github\u0000feed-reddit",
          leftFeedItemId: "feed-reddit",
          rightFeedItemId: "feed-github",
          confidence: 0.92,
          verificationLane: "semantic_primary",
          candidatePolicyVersion: "reader_summary.story_relation.candidate.v1",
          rankingPolicyVersion: "story_ranking_v10",
          featureDigest: "a".repeat(64),
          executionAttestationSha256: "b".repeat(64),
          normalizedOutputSha256: "c".repeat(64),
          selectedOutputSha256: "d".repeat(64),
        },
      ],
      relatedTopicRelations: [],
    };
  }
}

class WorkflowUserSummaryPreferenceReader implements UserSummaryPreferenceReaderPort {
  async findEffectivePreference(): ReturnType<UserSummaryPreferenceReaderPort["findEffectivePreference"]> {
    return {
      tone: "concise",
      maxKeyPoints: 2,
      includeRisks: false,
      includeSourceHighlights: true,
      customInstructions:
        "Prioritize practical agent tooling links and skip low-confidence risks.",
      rulesVersion: "summary.rules.workflow-user-preference.v1",
    };
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId("00000000-0000-4000-8000-000000000101");
  const workspace = workspaceId("00000000-0000-4000-8000-000000000102");
  const queue = new InMemoryQueuePublisher();
  const jobs = new InMemoryReaderSummaryJobRepository();
  const artifacts = new InMemoryReaderSummaryArtifactRepository();
  const policies = new InMemoryReaderSummaryPolicyRepository();
  const events = new InMemorySummaryEventPublisher();
  const metrics = new InMemoryMetricsRecorder();
  const ids = new SequenceIdGenerator();
  const clock = new FixedClock(new Date("2026-06-23T08:31:00.000Z"));
  const runtime = new WorkerRuntime({ serviceName: "intelligence-worker" });
  runtime.onModuleInit();

  const request = await new RequestReaderSummaryUseCase(
    jobs,
    new ReaderSummaryJobQueuePublisherAdapter(queue, metrics),
    new AllowingSummaryQuota(),
    ids,
    clock,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    userId: "readerSummary-workflow-user",
    idempotencyKey: "readerSummary-workflow-smoke",
    correlationId: "readerSummary-workflow-smoke",
    cadence: "weekly",
    period: {
      startedAt: new Date("2026-06-23T00:00:00.000Z"),
      endedAt: new Date("2026-06-30T00:00:00.000Z"),
      timezone: "UTC",
    },
  });

  assert(request.ok, "readerSummary workflow smoke must create a readerSummary job");
  assert(
    queue.all().length === 1,
    `readerSummary request must enqueue one command, got ${queue.all().length}`,
  );

  const loop = new ReaderSummaryJobQueueDrainLoop(
    new InMemorySummaryJobQueueReader(queue),
    new ExecuteReaderSummaryJobCommandHandler(
      new ExecuteReaderSummaryJobUseCase(
        jobs,
        artifacts,
        policies,
        new SelectedReaderSummaryEvidenceSelector(),
        new DeterministicReaderSummaryModelAdapter(),
        new InMemoryReaderSummaryPublication(jobs, artifacts, events),
        ids,
        clock,
        readerSummaryPromotionControl(
          new ReaderSummaryPromotionMetricsRecorder(metrics),
        ),
        undefined,
        new WorkflowUserSummaryPreferenceReader(),
        undefined,
        undefined,
        canonicalGitHubProjectionReader,
        undefined,
        undefined,
        undefined,
      ),
      metrics,
      runtime,
    ),
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
    },
    metrics,
    new FixedClock(new Date("2026-06-23T08:31:30.000Z")),
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown("readerSummary-workflow-smoke-complete");
  await runtime.onApplicationShutdown("readerSummary-workflow-smoke-complete");

  const job = await jobs.findById({
    tenantId: tenant,
    workspaceId: workspace,
    readerSummaryJobId: request.value.readerSummaryJobId,
  });
  const snapshot = job?.toSnapshot();
  const rejectedDebug =
    snapshot?.status === "quality_rejected" &&
    snapshot.readerSummaryId !== undefined
      ? await artifacts.findRejectedDebugById({
          tenantId: tenant,
          workspaceId: workspace,
          readerSummaryId: snapshot.readerSummaryId,
        })
      : null;
  assert(
    snapshot?.status === "completed",
    `expected completed readerSummary job, got ${snapshot?.status}; reasons=${JSON.stringify(rejectedDebug?.reasons ?? [])}`,
  );
  assert(
    typeof snapshot.readerSummaryId === "string",
    "readerSummary job must persist readerSummary artifact id",
  );
  assert(
    queue.all().length === 0,
    `readerSummary queue must drain, got ${queue.all().length}`,
  );
  assert(
    artifacts.all().length === 1,
    `readerSummary workflow must persist one artifact, got ${artifacts.all().length}`,
  );
  const artifact = artifacts.all()[0]?.toSnapshot();
  assert(
    artifact !== undefined,
    "readerSummary workflow must expose the persisted artifact snapshot",
  );
  assert(
    artifact.content !== undefined,
    "readerSummary workflow must persist the reader summary content",
  );
  assert(
    artifact.content.topReads.length > 0,
    "reader summary content must expose top reads",
  );
  assert(
    artifact.content.topReads.length === 2,
    `readerSummary workflow must apply the user max stories preference; got ${artifact.content.topReads.length}`,
  );
  assert(
    artifact.executiveSummary.includes(
      "Prioritize practical agent tooling links",
    ),
    "readerSummary workflow must apply user custom summary instructions",
  );
  assert(
    artifact.risksAndUnknowns.length === 0,
    "readerSummary workflow must apply the user risk preference",
  );
  assert(
    artifact.lineage.rulesVersion.includes(
      "summary.rules.workflow-user-preference.v1",
    ),
    "readerSummary workflow lineage must preserve the user preference rules version",
  );
  assert(
    artifact.citationMap.length > 0,
    "readerSummary artifact must expose citations",
  );
  assert(
    new Set(artifact.content.topReads.map(readerTopReadKey)).size ===
      artifact.content.topReads.length,
    "reader summary top reads must not contain duplicate source links",
  );
  const promotedCards = [
    ...artifact.content.topReads.map((card, slot) => ({
      card,
      placement: "top" as const,
      slot,
    })),
    ...(artifact.content.selectedPosts ?? []).map((card, slot) => ({
      card,
      placement: "additional" as const,
      slot,
    })),
  ];
  assert(
    artifact.promotionAttestations?.length === promotedCards.length &&
      promotedCards.every(({ card, placement, slot }) =>
        artifact.promotionAttestations?.some(
          (attestation) =>
            attestation.candidateId === card.promotionCandidateId &&
            attestation.placement === placement &&
            attestation.slot === slot &&
            JSON.stringify(attestation.citationIds) ===
              JSON.stringify(card.citationIds),
        ),
      ),
    "every visible reader card must retain one exact ordered-citation attestation",
  );
  assert(
    artifact.content.topReads.every(
      (post) => post.providerKey !== "github-trending-page",
    ) &&
      artifact.content.sourceMix.every(
        (source) => source.providerKey !== "github-trending-page",
      ),
    "GitHub Trending must remain outside primary top reads and provider counters",
  );
  assert(
    artifact.content.sourceMix.some(
      (source) => source.providerKey === "reddit",
    ),
    "reader summary source mix must include Reddit evidence",
  );
  assert(
    artifact.content.topReads[0]?.whyNow.includes("admitted provider"),
    "reader summary must explain why the top read matters now",
  );
  assert(
    artifact.userId === "readerSummary-workflow-user",
    "readerSummary workflow must persist the reader user id",
  );
  assert(
    artifact.personalization?.memoryGuidanceApplied === true,
    "readerSummary workflow must persist applied memory guidance metadata",
  );
  assert(
    artifact.personalization?.signals.includes("memory_guidance_applied"),
    "readerSummary workflow must expose memory guidance explanation signals",
  );
  assert(
    events.all().length === 1,
    `readerSummary workflow must publish one reader_summary.ready event, got ${events.all().length}`,
  );
  assert(
    metrics.counterValue("summary_jobs_total", {
      job_type: "readerSummary",
      status: "succeeded",
      worker: "intelligence-worker",
    }) === 1,
    "readerSummary workflow must record succeeded metric",
  );

  console.log("ReaderSummary workflow smoke OK");
}

const readerTopReadKey = (item: ReaderSummaryItem): string =>
  item.canonicalUrl ??
  item.citationIds.join("|") ??
  `${item.providerKey}:${item.title}`;

const canonicalGitHubProjectionReader: ReaderSummaryGitHubProjectionReaderPort =
  {
    async read() {
      return {
        eligibleBindingIds: ["binding-github-trending"],
        items: workflowGitHubTrendingEvidence().map((item, index) => ({
          feedItemId: item.feedItemId,
          sourceItemId: item.sourceItemId,
          sourceBindingId: item.sourceBindingId,
          providerKey: "github-trending-page",
          metadataKind: "github_trending_page_repository",
          scanJobId: "binding-github-trending-scan",
          canonicalUrl: item.canonicalUrl!,
          repositoryFullName: `workflow/repository-${index + 1}`,
          rank: index + 1,
          starsGained: 200 + index + 1,
          window: "daily",
          fetchStartedAt: item.publishedAt,
          checkedAt: new Date("2026-06-23T08:30:00.000Z"),
          publishedAt: item.observedAt,
          observedAt: item.observedAt,
          sourceContentHash: "a".repeat(64),
          sourceProviderContentHash: "b".repeat(64),
        })),
        pageCount: 2,
      };
    },
  };

const workflowGitHubTrendingEvidence = () =>
  Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    return {
      feedItemId: `feed-github-trending-${rank}`,
      sourceItemId: `source-github-trending-${rank}`,
      sourceBindingId: "binding-github-trending",
      interestId: "topic-github",
      providerKey: "github-trending-page",
      providerName: "GitHub Trending",
      canonicalUrl: `https://github.com/workflow/repository-${rank}`,
      title: `workflow/repository-${rank}`,
      bodyPreview: `Repository ${rank} appears in the canonical daily GitHub Trending board.`,
      publishedAt: new Date("2026-06-23T08:29:00.000Z"),
      observedAt: new Date("2026-06-23T08:30:00.000Z"),
      score: 2 - rank / 100,
      whyImportant: ["Canonical daily GitHub Trending repository"],
      readerActionKind: "watch_repository" as const,
      providerMetricLabels: [
        {
          label: "GitHub Trending today",
          value: `#${rank}, +${200 + rank} stars today`,
        },
      ],
    };
  });

class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort["reserveSummaryJob"]> {
    return ok({
      remaining: 59,
      resetAt: "2026-06-23T09:00:00.000Z",
    });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
