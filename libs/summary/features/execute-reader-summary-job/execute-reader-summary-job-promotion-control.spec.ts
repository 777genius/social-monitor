import {
  FixedClock,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  interestReaderSummaryScope,
  ReaderSummaryJob,
  type ReaderSummaryPublicationPolicy,
  workspaceReaderSummaryScope,
} from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryGitHubProjectionReaderPort,
} from "../../ports";
import type { BuildReaderSummaryTopicMapUseCase } from "../build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import { ExecuteReaderSummaryJobUseCase } from "./execute-reader-summary-job.use-case";
import {
  makeReaderEvidenceSelection,
  makeRelatedReaderEvidenceSelection,
} from "./execute-reader-summary-job-promotion-fixtures";
import {
  PromotionControlArtifactRepository,
  PromotionControlCapturingModel,
  PromotionControlEventPublisher,
  PromotionControlIdGenerator,
  PromotionControlPolicyRepository,
  PromotionControlPublication,
  PromotionControlPublicationPolicy,
  PromotionControlTrendingModel,
  promotionControlEmptyTopicMapBuilder,
  promotionControlForcedRejection,
  promotionControlPeriod,
  promotionControlDailyPeriod,
  promotionControlRejectingTopicMapBuilder,
  promotionControlZeroGitHubProjectionReader,
} from "./execute-reader-summary-job-promotion-control.spec-support";
import { FakeReaderSummaryJobRepository } from "./execute-reader-summary-job.spec-support";
import {
  NOOP_READER_SUMMARY_PROMOTION_METRICS,
  readerSummaryPromotionControl,
  type ReaderSummaryPromotionAggregateMetrics,
} from "./reader-summary-promotion-control";

describe("ExecuteReaderSummaryJobUseCase promotion controls", () => {
  it.each([true, false])(
    "publishes an enabled daily job with a valid Trends appendix (primary=%s)",
    async (withPrimary) => {
      const scenario = await arrangePromotionControlScenario(
        `reader-job-daily-trends-${withPrimary}`,
        new PromotionControlTrendingModel(),
        workspaceReaderSummaryScope(),
        promotionControlDailyPeriod,
      );
      const result = await executePromotionControlScenario({
        ...scenario,
        selectEvidence: async () => dailyTrendingSelection(withPrimary),
        githubProjectionReader: dailyTrendingProjectionReader(),
        promotionControl: readerSummaryPromotionControl(
          NOOP_READER_SUMMARY_PROMOTION_METRICS,
        ),
      });
      expect(scenario.artifacts.decisions()[0]).toMatchObject({
        status: "published",
      });
      expect(result).toMatchObject({
        ok: true,
        value: { status: withPrimary ? "completed" : "no_signal" },
      });
      const published = scenario.artifacts.all()[0]?.toSnapshot();
      if (withPrimary) {
        expect(published?.content?.narrativeSections).toContainEqual(
          expect.objectContaining({
            id: "github-trending",
            citationIds: [
              "github-citation-1",
              "github-citation-2",
              "github-citation-3",
            ],
          }),
        );
      } else {
        expect(published?.citationMap).toEqual([]);
        expect(published?.content?.narrativeSections).toEqual([]);
        expect(published?.content?.selectedPosts).toEqual([]);
      }
      expect(scenario.artifacts.decisions()[0]?.status).toBe("published");
    },
  );
  it("keeps the complete promotion metric sequence invariant for zero versus N supplemental GitHub entries", async () => {
    const recordSequence = async (supplementalCount: number) => {
      const scenario = await arrangePromotionControlScenario(
        `reader-job-telemetry-${supplementalCount}`,
      );
      const records: ReaderSummaryPromotionAggregateMetrics[] = [];
      await executePromotionControlScenario({
        ...scenario,
        selectEvidence: async () =>
          promotionSelectionWithSupplementalCount(supplementalCount),
        topicMapBuilder: promotionControlEmptyTopicMapBuilder(),
        githubProjectionReader: promotionControlZeroGitHubProjectionReader(),
        promotionControl: readerSummaryPromotionControl({
          record: (value) => records.push(value),
        }),
      });
      return records;
    };

    const withoutSupplemental = await recordSequence(0);
    const withSupplemental = await recordSequence(5);

    expect(withSupplemental).toEqual(withoutSupplemental);
    expect(withoutSupplemental.map(({ lifecycle }) => lifecycle)).toEqual([
      "evaluated",
      "delivered",
    ]);
  });

  it("deep-sanitizes admitted typed evidence before model input", async () => {
    const generatedContent = {
      topReads: [{ title: "Untrusted model top read" }],
      narrativeSections: [
        {
          id: "lead",
          kind: "lead",
          title: "Overview",
          text: "Runtime regression discussion is the main signal.",
          citationIds: ["c1"],
          storyClusterId: "cluster-1",
        },
      ],
    } as unknown as ProviderReaderSummaryAttempt["draft"]["content"];
    const evidence = makeRelatedReaderEvidenceSelection();
    Object.assign(evidence.selectedEvidence[0]!, {
      unknownRuntimeMarker: "must-not-reach-model",
      relation: { kind: "runtime-only", injected: true },
    });
    const scenario = await arrangePromotionControlScenario(
      "reader-job-model-content",
      new PromotionControlCapturingModel(generatedContent),
    );

    const result = await executePromotionControlScenario({
      ...scenario,
      selectEvidence: async () => evidence,
      topicMapBuilder: promotionControlEmptyTopicMapBuilder(),
      githubProjectionReader: promotionControlZeroGitHubProjectionReader(),
      promotionControl: readerSummaryPromotionControl(
        NOOP_READER_SUMMARY_PROMOTION_METRICS,
      ),
    });

    expect(result.ok).toBe(true);
    const snapshot = scenario.artifacts.all()[0]?.toSnapshot();
    expect(snapshot?.content?.topReads[0]).toMatchObject({
      title: "Runtime regression discussion",
      providerKey: "reddit",
      citationIds: ["c1"],
      providerMetrics: [{ label: "Score", value: "50" }],
    });
    expect(snapshot?.content?.selectedPosts).toEqual([]);
    expect(JSON.stringify(snapshot?.content?.selectedPosts)).not.toContain(
      "github-trending-1",
    );
    expect(scenario.model.generatedEvidenceIds()).toEqual([["feed-1"]]);
    const modelEvidence = scenario.model.generatedEvidencePayloads()[0];
    expect(modelEvidence).not.toContain("feed-related");
    expect(modelEvidence).not.toContain("relation:related-topic");
    expect(modelEvidence).not.toContain("must-not-reach-model");
    expect(modelEvidence).not.toContain("runtime-only");
    expect(scenario.model.generatedContextArtifactCounts()).toEqual([0]);
    expect(snapshot?.content?.narrativeSections).toEqual(
      generatedContent!.narrativeSections,
    );
    expect(JSON.stringify(snapshot)).not.toContain(
      "Related topic should stay contextual",
    );
  });

  it("rejects unsafe top reads before publishing generated content", async () => {
    const scenario = await arrangePromotionControlScenario(
      "reader-job-rejected",
      new PromotionControlCapturingModel(),
      interestReaderSummaryScope("interest-reader-ai"),
    );

    const result = await executePromotionControlScenario({
      ...scenario,
      selectEvidence: async () =>
        makeReaderEvidenceSelection({
          firstContentQuality: {
            qualityScore: 0.2,
            interestRelevanceScore: 0.4,
            engagementIntegrityScore: 0.4,
            eligibleForSummary: true,
            eligibleForTopRead: false,
            needsLlmReview: true,
            decision: "downrank",
            flags: ["rumor_only"],
            reason: "Rumor-only evidence is not safe as a top read.",
          },
        }),
      topicMapBuilder: promotionControlRejectingTopicMapBuilder(),
      githubProjectionReader: promotionControlZeroGitHubProjectionReader(),
      promotionControl: readerSummaryPromotionControl(
        NOOP_READER_SUMMARY_PROMOTION_METRICS,
      ),
    });

    expect(result).toEqual({
      ok: true,
      value: {
        readerSummaryJobId: "reader-job-rejected",
        status: "no_signal",
        readerSummaryId: "reader-summary-id-1",
      },
    });
    expect(scenario.artifacts.all()).toHaveLength(2);
    expect(
      scenario.artifacts.all()[0]?.toSnapshot().promotionAttestations,
    ).toEqual([]);
    expect(scenario.artifacts.decisions()[0]).toMatchObject({
      status: "published",
    });
    expect(scenario.artifacts.all()[0]?.toSnapshot().confidence).toMatchObject({
      level: "none",
      score: 0,
    });
    expect(
      (
        await scenario.jobs.findById({
          tenantId: scenario.tenant,
          workspaceId: scenario.workspace,
          readerSummaryJobId: scenario.jobId,
        })
      )?.toSnapshot(),
    ).toMatchObject({
      status: "no_signal",
      readerSummaryId: "reader-summary-id-1",
    });
    expect(scenario.events.all()).toHaveLength(1);
    expect(scenario.events.all()[0]?.payload).toMatchObject({
      status: "no_signal",
    });
  });

  it("calibrates admitted-lead confidence before preflight rejection", async () => {
    const scenario = await arrangePromotionControlScenario(
      "reader-job-calibrated-rejection",
      new PromotionControlCapturingModel(),
      interestReaderSummaryScope("interest-reader-ai"),
    );
    const publicationPolicy = new PromotionControlPublicationPolicy(
      promotionControlForcedRejection(),
    );

    const result = await executePromotionControlScenario({
      ...scenario,
      topicMapBuilder: promotionControlRejectingTopicMapBuilder(),
      githubProjectionReader: promotionControlZeroGitHubProjectionReader(),
      publicationPolicy,
      promotionControl: readerSummaryPromotionControl(
        NOOP_READER_SUMMARY_PROMOTION_METRICS,
      ),
    });

    expect(result).toMatchObject({
      ok: true,
      value: { status: "quality_rejected" },
    });
    expect(publicationPolicy.confidences).toEqual([
      expect.objectContaining({ level: "low", score: 0.42 }),
      expect.objectContaining({ level: "low", score: 0.42 }),
    ]);
    expect(scenario.artifacts.all()[0]?.toSnapshot().confidence).toEqual(
      publicationPolicy.confidences[1],
    );
  });
});

const dailyTrendingSelection = (withPrimary: boolean) => {
  const base = makeReaderEvidenceSelection({
    ...(withPrimary
      ? {}
      : {
          firstContentQuality: {
            qualityScore: 0.2,
            interestRelevanceScore: 0.2,
            engagementIntegrityScore: 0.2,
            eligibleForSummary: false,
            eligibleForTopRead: false,
            needsLlmReview: false,
            decision: "reject",
            flags: ["low_quality"],
            reason: "No primary signal",
          },
        }),
  });
  const primary = base.selectedEvidence[0]!;
  const primaryCluster = base.clusters[0]!;
  const template = base.selectedEvidence[1]!;
  const trends = Array.from({ length: 10 }, (_, index) => ({
    ...template,
    feedItemId: `github-feed-${index + 1}`,
    sourceItemId: `github-source-${index + 1}`,
    sourceBindingId: "github-binding-daily",
    canonicalUrl: `https://github.com/owner/repo-${index + 1}`,
    providerMetricLabels: [
      {
        label: "GitHub Trending today",
        value: `#${index + 1} · +${index < 3 ? 1_101 : 100 + index} stars today`,
      },
    ],
  }));
  const trendClusters = trends.map((item, index) => ({
    ...base.clusters[1]!,
    id: `github-cluster-${index + 1}`,
    representativeFeedItemId: item.feedItemId,
  }));
  return {
    ...base,
    sourceWindow: {
      ...base.sourceWindow,
      selectedFeedItemIds: [
        primary.feedItemId,
        ...trends.map((item) => item.feedItemId),
      ],
      storyClusterIds: [
        primaryCluster.id,
        ...trendClusters.map((item) => item.id),
      ],
    },
    clusters: [primaryCluster, ...trendClusters],
    selectedEvidence: [primary, ...trends],
  };
};

const dailyTrendingProjectionReader =
  (): ReaderSummaryGitHubProjectionReaderPort => ({
    async read() {
      const checkedAt = new Date("2026-06-26T07:20:00.000Z");
      return {
        eligibleBindingIds: ["github-binding-daily"],
        pageCount: 1,
        items: Array.from({ length: 10 }, (_, index) => ({
          feedItemId: `github-feed-${index + 1}`,
          sourceItemId: `github-source-${index + 1}`,
          sourceBindingId: "github-binding-daily",
          providerKey: "github-trending-page",
          metadataKind: "github_trending_page_repository",
          scanJobId: "github-scan-daily",
          canonicalUrl: `https://github.com/owner/repo-${index + 1}`,
          repositoryFullName: `owner/repo-${index + 1}`,
          rank: index + 1,
          starsGained: index < 3 ? 1_101 : 100 + index,
          window: "daily",
          fetchStartedAt: new Date("2026-06-26T07:19:00.000Z"),
          checkedAt,
          publishedAt: checkedAt,
          observedAt: new Date("2026-06-26T07:30:00.000Z"),
          sourceContentHash: "a".repeat(64),
          sourceProviderContentHash: "b".repeat(64),
        })),
      };
    },
  });

type PromotionControl = ReturnType<typeof readerSummaryPromotionControl>;

interface PromotionControlScenario {
  readonly tenant: ReturnType<typeof tenantId>;
  readonly workspace: ReturnType<typeof workspaceId>;
  readonly jobId: string;
  readonly jobs: FakeReaderSummaryJobRepository;
  readonly artifacts: PromotionControlArtifactRepository;
  readonly events: PromotionControlEventPublisher;
  readonly model: PromotionControlCapturingModel;
}

const arrangePromotionControlScenario = async (
  jobId: string,
  model = new PromotionControlCapturingModel(),
  scope = workspaceReaderSummaryScope(),
  period = promotionControlPeriod,
): Promise<PromotionControlScenario> => {
  const tenant = tenantId(`tenant-${jobId}`);
  const workspace = workspaceId(`workspace-${jobId}`);
  const jobs = new FakeReaderSummaryJobRepository();
  await jobs.save(
    ReaderSummaryJob.request({
      id: jobId,
      tenantId: tenant,
      workspaceId: workspace,
      scope,
      period,
      idempotencyKey: `${jobId}-key`,
      requestedAt: new Date("2026-06-26T08:00:00.000Z"),
    }),
  );
  return {
    tenant,
    workspace,
    jobId,
    jobs,
    artifacts: new PromotionControlArtifactRepository(),
    events: new PromotionControlEventPublisher(),
    model,
  };
};

const executePromotionControlScenario = async (
  scenario: PromotionControlScenario & {
    readonly promotionControl: PromotionControl;
    readonly selectEvidence?: () => Promise<
      ReturnType<typeof makeReaderEvidenceSelection>
    >;
    readonly topicMapBuilder?: BuildReaderSummaryTopicMapUseCase;
    readonly githubProjectionReader?: ReaderSummaryGitHubProjectionReaderPort;
    readonly publicationPolicy?: ReaderSummaryPublicationPolicy;
  },
) =>
  new ExecuteReaderSummaryJobUseCase(
    scenario.jobs,
    scenario.artifacts,
    new PromotionControlPolicyRepository(),
    {
      select:
        scenario.selectEvidence ?? (async () => makeReaderEvidenceSelection()),
    },
    scenario.model,
    new PromotionControlPublication(
      scenario.jobs,
      scenario.artifacts,
      scenario.events,
    ),
    new PromotionControlIdGenerator(),
    new FixedClock(new Date("2026-06-26T08:05:00.000Z")),
    scenario.promotionControl,
    undefined,
    undefined,
    scenario.topicMapBuilder,
    scenario.publicationPolicy,
    scenario.githubProjectionReader,
    undefined,
    undefined,
    undefined,
  ).execute({
    tenantId: scenario.tenant,
    workspaceId: scenario.workspace,
    readerSummaryJobId: scenario.jobId,
  });

const promotionSelectionWithSupplementalCount = (count: number) => {
  const base = makeReaderEvidenceSelection();
  const primary = base.selectedEvidence[0]!;
  const primaryCluster = base.clusters[0]!;
  const supplementalTemplate = base.selectedEvidence[1]!;
  const supplementalClusterTemplate = base.clusters[1]!;
  const supplemental = Array.from({ length: count }, (_, index) => ({
    ...supplementalTemplate,
    feedItemId: `feed-github-supplemental-${index}`,
    sourceItemId: `github-trending-${index}`,
    canonicalUrl: `https://github.com/example/project-${index}`,
  }));
  const supplementalClusters = supplemental.map((item, index) => ({
    ...supplementalClusterTemplate,
    id: `cluster-github-supplemental-${index}`,
    representativeFeedItemId: item.feedItemId,
  }));
  return {
    ...base,
    sourceWindow: {
      ...base.sourceWindow,
      selectedFeedItemIds: [
        primary.feedItemId,
        ...supplemental.map(({ feedItemId }) => feedItemId),
      ],
      storyClusterIds: [
        primaryCluster.id,
        ...supplementalClusters.map(({ id }) => id),
      ],
    },
    selectedEvidence: [primary, ...supplemental],
    clusters: [primaryCluster, ...supplementalClusters],
  };
};
