import { maxEvidenceItems } from "./live-multi-provider-summary-config";
import type { ConfiguredInterestReaderPort } from "@social-monitor/relevance/ports";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { InMemoryUserRelevanceProfileRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { type Clock } from "@social-monitor/shared-kernel";
import { ConversationEvidenceContextReader } from "@social-monitor/summary/adapters/evidence/conversation-evidence-context.reader";
import { ConversationReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/conversation-reader-summary-evidence.selector";
import { RelevanceReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { InMemoryReaderSummaryJobQueueAdapter } from "@social-monitor/summary/adapters/messaging/reader-summary-job-queue.adapter";
import { InMemorySummaryEventPublisher } from "@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher";
import { InMemoryReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-publication";
import { InMemoryReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import { ReaderSummaryPromotionMetricsRecorder } from "@social-monitor/summary/adapters/metrics/reader-summary-promotion-metrics.recorder";
import { ReaderSummaryPolicy } from "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { readerSummaryPromotionControl } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { presentReaderSummaryArtifact } from "../../libs/summary/features/shared/reader-summary-artifact-presenter";
import type { ConversationUnitEvidenceRepository, ScanTarget, LiveReaderSummarySmokeResult, LiveProviderKey} from "./live-multi-provider-summary-support";
import { SequenceIdGenerator, AllowingSummaryQuota, unwrap, assert, isSourceInventoryText } from "./live-multi-provider-summary-support";
import { summaryPreferenceForRun } from "./live-multi-provider-summary-sources";
import { maxSummaryKeyPoints, sampledAt, readerSummaryModelMode, allowEmptyTargets } from "./live-multi-provider-summary-config";
import { buildSourceContentQualityReviewer, buildReaderSummaryModel } from "./live-multi-provider-summary-models";

export const runLiveReaderSummarySmoke = async (params: {
  readonly configuredInterests: ConfiguredInterestReaderPort;
  readonly tenant: ReturnType<typeof tenantId>;
  readonly workspace: ReturnType<typeof workspaceId>;
  readonly interestId: string;
  readonly feedItems: FeedItemReadRepositoryPort;
  readonly conversationUnits: ConversationUnitEvidenceRepository;
  readonly feedSnapshots: readonly {
    readonly id: string;
    readonly sourceBindingId: string;
  }[];
  readonly targetBySourceBinding: ReadonlyMap<string, ScanTarget>;
  readonly targets: readonly ScanTarget[];
  readonly clock: Clock;
  readonly metrics: InMemoryMetricsRecorder;
}): Promise<LiveReaderSummarySmokeResult> => {
  const readerSummaryJobs = new InMemoryReaderSummaryJobRepository();
  const readerSummaryArtifacts = new InMemoryReaderSummaryArtifactRepository();
  const readerSummaryPolicies = new InMemoryReaderSummaryPolicyRepository();
  const readerSummaryEvents = new InMemorySummaryEventPublisher();
  const readerSummaryQueue = new InMemoryReaderSummaryJobQueueAdapter();
  const readerSummaryIds = new SequenceIdGenerator(
    "live-multi-provider-readerSummary",
  );
  const scope = { type: "workspace" } as const;
  const summaryPreference = summaryPreferenceForRun();

  await readerSummaryPolicies.save(
    ReaderSummaryPolicy.create({
      id: "readerSummary-policy-live-multi-provider-smoke",
      tenantId: params.tenant,
      workspaceId: params.workspace,
      scope,
      language: "auto",
      format: "executive_brief",
      tone: "analytical",
      maxStories: Math.min(maxSummaryKeyPoints, 10),
      includeRisks: true,
      includeInterestHighlights: true,
      includeRepeatedSignals: true,
      dedupeStrategy: "canonical_url_then_title",
      customInstructions: [
        summaryPreference.customInstructions,
        "Build the reader-facing summary around social/news signals first; treat GitHub repository signals as supporting evidence unless they are cross-confirmed by social/news sources.",
        "Prioritize concrete developer, product, security, release and operator-workflow signals over personal anecdotes; keep health, medical or personal-use stories as follow-up adoption examples unless the topic explicitly asks for healthcare.",
      ].join(" "),
      createdAt: sampledAt,
      updatedAt: sampledAt,
    }),
  );

  const requestReaderSummary = new RequestReaderSummaryUseCase(
    readerSummaryJobs,
    readerSummaryQueue,
    new AllowingSummaryQuota(),
    readerSummaryIds,
    params.clock,
  );
  const request = unwrap(
    await requestReaderSummary.execute({
      tenantId: params.tenant,
      workspaceId: params.workspace,
      scope,
      idempotencyKey: "live-multi-provider-readerSummary-idempotency-key",
      correlationId: "corr-live-multi-provider-readerSummary-smoke",
    }),
    "request live multi-provider readerSummary",
  );

  assert(
    request.created,
    "live multi-provider readerSummary request must create a job",
  );
  assert(
    readerSummaryQueue.all().length === 1,
    "live multi-provider readerSummary request must enqueue one job",
  );

  const rankFeedItems = new RankFeedItemsUseCase(
    params.feedItems,
    new InMemoryUserRelevanceProfileRepository(),
    params.clock,
    undefined,
    undefined,
    undefined,
    buildSourceContentQualityReviewer(),
    undefined,
    params.configuredInterests,
  );
  const evidenceSelector = new ConversationReaderSummaryEvidenceSelector(
    new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      params.feedItems,
      params.clock,
    ),
    new ConversationEvidenceContextReader(
      params.conversationUnits,
      params.conversationUnits,
      params.clock,
    ),
  );
  const executeReaderSummary = new ExecuteReaderSummaryJobUseCase(
    readerSummaryJobs,
    readerSummaryArtifacts,
    readerSummaryPolicies,
    evidenceSelector,
    buildReaderSummaryModel(),
    new InMemoryReaderSummaryPublication(readerSummaryJobs, readerSummaryArtifacts, readerSummaryEvents),
    readerSummaryIds,
    params.clock,
    readerSummaryPromotionControl(new ReaderSummaryPromotionMetricsRecorder(params.metrics)),
  );
  const readerSummary = unwrap(
    await executeReaderSummary.execute({
      tenantId: params.tenant,
      workspaceId: params.workspace,
      readerSummaryJobId: request.readerSummaryJobId,
      maxEvidenceItems,
    }),
    "execute live multi-provider readerSummary",
  );

  assert(
    readerSummary.status === "completed",
    `live multi-provider readerSummary must complete, got ${readerSummary.status}`,
  );
  assert(
    readerSummary.readerSummaryId !== undefined,
    "live multi-provider readerSummary must produce a readerSummary id",
  );

  const artifact = await readerSummaryArtifacts.findById({
    tenantId: params.tenant,
    workspaceId: params.workspace,
    readerSummaryId: readerSummary.readerSummaryId,
  });
  assert(
    artifact !== null,
    "live multi-provider readerSummary artifact must be persisted",
  );

  const artifactSnapshot = artifact.toSnapshot();
  const feedById = new Map(params.feedSnapshots.map((item) => [item.id, item]));
  const selectedProviders = new Set(
    artifactSnapshot.sourceWindow.selectedFeedItemIds
      .map((feedItemId) => feedById.get(feedItemId))
      .map((item) =>
        item === undefined
          ? undefined
          : params.targetBySourceBinding.get(item.sourceBindingId)?.providerKey,
      )
      .filter(
        (providerKey): providerKey is LiveProviderKey =>
          providerKey !== undefined,
      ),
  );
  const citedProviders = new Set(
    artifactSnapshot.citationMap.map((citation) => citation.providerKey),
  );
  const readerBrief = artifactSnapshot.content;
  assert(
    readerBrief !== undefined,
    "live multi-provider readerSummary must include reader summary content",
  );
  const readerSourceMixProviders = new Set(
    readerBrief.sourceMix.map((entry) => entry.providerKey),
  );
  const topReadProviders = new Set(
    readerBrief.topReads.map((item) => item.providerKey),
  );
  const firstTopReadTitle = readerBrief.topReads[0]?.title;

  assert(
    readerBrief.headline.trim().length >= 12,
    `readerSummary reader headline must be non-empty, got ${readerBrief.headline}`,
  );
  assert(
    !isSourceInventoryText(readerBrief.headline),
    `readerSummary reader headline must express the situation instead of listing sources, got ${readerBrief.headline}`,
  );
  assert(
    !isSourceInventoryText(readerBrief.oneLineTakeaway),
    `readerSummary reader takeaway must express the situation instead of listing sources, got ${readerBrief.oneLineTakeaway}`,
  );
  if (readerSummaryModelMode === "deterministic") {
    assert(
      readerBrief.headline.startsWith("Workspace readerSummary:") ||
        readerBrief.headline.startsWith("Source watch across "),
      `readerSummary reader headline must be reader-facing, got ${readerBrief.headline}`,
    );
  }
  assert(
    firstTopReadTitle === undefined ||
      readerBrief.headline !== firstTopReadTitle,
    "readerSummary reader headline must not repeat the first top read title",
  );

  const requiredReaderTargets =
    allowEmptyTargets || readerSummaryModelMode !== "deterministic"
      ? params.targets.filter((target) =>
          selectedProviders.has(target.providerKey),
        )
      : params.targets;
  const requiredProviderCount = new Set(
    requiredReaderTargets.map((target) => target.providerKey),
  ).size;

  assert(
    requiredProviderCount > 0,
    "readerSummary evidence window must include at least one provider",
  );

  for (const target of requiredReaderTargets) {
    assert(
      selectedProviders.has(target.providerKey),
      `readerSummary evidence window must include ${target.providerKey}`,
    );
    if (readerSummaryModelMode === "deterministic") {
      assert(
        citedProviders.has(target.providerKey),
        `readerSummary citation map must include ${target.providerKey}`,
      );
      assert(
        readerSourceMixProviders.has(target.providerKey),
        `readerSummary reader source mix must include ${target.providerKey}`,
      );
    }
  }
  if (!allowEmptyTargets && readerSummaryModelMode !== "deterministic") {
    for (const providerKey of ["x-twitter", "reddit"] as const) {
      const providerWasTargeted = params.targets.some(
        (target) => target.providerKey === providerKey,
      );
      if (!providerWasTargeted) {
        continue;
      }

      assert(
        selectedProviders.has(providerKey),
        `readerSummary evidence window must include ${providerKey}`,
      );
      assert(
        citedProviders.has(providerKey) ||
          readerSourceMixProviders.has(providerKey) ||
          topReadProviders.has(providerKey),
        `readerSummary output must surface ${providerKey}`,
      );
    }
  }
  assert(
    topReadProviders.size >= Math.min(2, requiredProviderCount),
    `readerSummary top reads must include a diverse provider mix, got ${[...topReadProviders].join(", ")}`,
  );
  if (readerSummaryModelMode !== "deterministic") {
    assert(
      citedProviders.size >= Math.min(3, requiredProviderCount),
      `readerSummary citation map must include a diverse provider mix, got ${[...citedProviders].join(", ")}`,
    );
    assert(
      readerSourceMixProviders.size >= Math.min(3, requiredProviderCount),
      `readerSummary source mix must include a diverse provider mix, got ${[...readerSourceMixProviders].join(", ")}`,
    );
  }

  assert(
    readerSummaryEvents
      .all()
      .some((event) => event.eventType === "reader_summary.ready"),
    "live multi-provider readerSummary must publish reader_summary.ready",
  );

  return {
    readerSummaryId: readerSummary.readerSummaryId,
    readerHeadline: readerBrief.headline,
    selectedProviders: [...selectedProviders].sort(),
    citedProviders: [...citedProviders].sort(),
    readerSourceMixProviders: [...readerSourceMixProviders].sort(),
    readerSourceMixCounts: Object.fromEntries(
      readerBrief.sourceMix.map((entry) => [
        entry.providerKey,
        entry.itemCount,
      ]),
    ),
    topReadProviders: [...topReadProviders].sort(),
    topReadCount: readerBrief.topReads.length,
    qualityFlags: artifactSnapshot.qualityFlags,
    frontendArtifact: presentReaderSummaryArtifact(artifact, {
      status: "fresh",
      checkedAt: params.clock.now(),
    }),
  };
};
