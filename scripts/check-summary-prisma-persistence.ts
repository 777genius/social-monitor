import {
  causationId,
  correlationId,
  CryptoIdGenerator,
  eventId,
  FixedClock,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  ReaderSummaryArtifact,
  ReaderSummaryTopicRecommendationDecision,
  SummaryArtifact,
  SummaryFeedback,
  SummaryJob,
  SummaryPolicy,
} from "../libs/summary/domain";
import { emptyReaderSummaryReliabilityReport } from "../libs/summary/domain/entities/reader-summary-reliability";
import { PrismaSummaryArtifactRepository } from "../libs/summary/adapters/persistence/prisma/prisma-summary-artifact.repository";
import type { PrismaSummaryClient } from "../libs/summary/adapters/persistence/prisma/prisma-summary-client";
import { PrismaSummaryEventPublisher } from "../libs/summary/adapters/persistence/prisma/prisma-summary-event.publisher";
import { PrismaSummaryFeedbackRepository } from "../libs/summary/adapters/persistence/prisma/prisma-summary-feedback.repository";
import { PrismaSummaryJobRepository } from "../libs/summary/adapters/persistence/prisma/prisma-summary-job.repository";
import { PrismaSummaryPolicyRepository } from "../libs/summary/adapters/persistence/prisma/prisma-summary-policy.repository";
import { PrismaReaderSummaryTopicRecommendationDecisionRepository } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-topic-recommendation-decision.repository";
import { PrismaReaderSummaryArtifactRepository } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { resolveSummaryPersistenceMode } from "../libs/summary/interfaces/rest/summary-provider-tokens";
import type {
  PrismaReaderSummaryArtifactRecord,
  PrismaReaderSummaryJobRecord,
  PrismaReaderSummaryPolicyRecord,
} from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import type { PrismaReaderSummaryTopicRecommendationDecisionRecord } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-topic-recommendation-decision-records";
import type {
  PrismaSummaryArtifactRecord,
  PrismaSummaryFeedbackRecord,
  PrismaSummaryJobRecord,
  PrismaSummaryOutboxEventRecord,
  PrismaSummaryPolicyRecord,
  PrismaSummaryStatus,
} from "../libs/summary/adapters/persistence/prisma/prisma-summary-records";

const clock = new FixedClock(new Date("2026-06-08T00:00:00.000Z"));
const tenant = tenantId("00000000-0000-7000-8000-000000000401");
const workspace = workspaceId("00000000-0000-7000-8000-000000000402");
const interestId = "00000000-0000-7000-8000-000000000403";

async function main(): Promise<void> {
  assert(
    resolveSummaryPersistenceMode({}) === "in-memory",
    "summary persistence must default to in-memory",
  );
  assertThrows(
    () => resolveSummaryPersistenceMode({ SUMMARY_PERSISTENCE: "prisma" }),
    "SUMMARY_PERSISTENCE=prisma must require DATABASE_URL",
  );
  assert(
    resolveSummaryPersistenceMode({
      SUMMARY_PERSISTENCE: "prisma",
      DATABASE_URL: "postgresql://example.test/social-monitor",
    }) === "prisma",
    "summary persistence must accept explicit Prisma mode with DATABASE_URL",
  );

  const prisma = new FakePrismaSummaryClient();
  const summaryJobs = new PrismaSummaryJobRepository(prisma);
  const summaryArtifacts = new PrismaSummaryArtifactRepository(prisma);
  const feedbackRepository = new PrismaSummaryFeedbackRepository(prisma);
  const summaryPolicies = new PrismaSummaryPolicyRepository(prisma);
  const summaryEvents = new PrismaSummaryEventPublisher(prisma);
  const topicRecommendationDecisions =
    new PrismaReaderSummaryTopicRecommendationDecisionRepository(
      prisma,
      new CryptoIdGenerator(),
    );
  const readerSummaryArtifacts = new PrismaReaderSummaryArtifactRepository(
    prisma,
  );
  const completedArtifact = makeCompletedArtifact(
    "00000000-0000-7000-8000-000000000501",
  );
  const noSignalArtifact = makeNoSignalArtifact(
    "00000000-0000-7000-8000-000000000502",
  );

  await summaryArtifacts.save(completedArtifact);
  await summaryArtifacts.save(noSignalArtifact);

  const requestedJob = SummaryJob.request({
    id: "00000000-0000-7000-8000-000000000601",
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    idempotencyKey: "summary-job:interest:2026-06-08",
    requestedAt: clock.now(),
  });
  await summaryJobs.save(requestedJob);
  const runningJob = requestedJob.start({
    startedAt: new Date("2026-06-08T00:01:00.000Z"),
  });
  await summaryJobs.save(runningJob);
  const completedJob = runningJob.complete({
    completedAt: new Date("2026-06-08T00:02:00.000Z"),
    summaryId: completedArtifact.toSnapshot().summaryId,
  });
  await summaryJobs.save(completedJob);

  const foundJob = await summaryJobs.findByIdempotencyKey({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: "summary-job:interest:2026-06-08",
  });
  assert(
    foundJob?.toSnapshot().status === "completed",
    "summary job status must round-trip as completed",
  );
  assert(
    foundJob.toSnapshot().summaryId ===
      completedArtifact.toSnapshot().summaryId,
    "completed summary job must keep artifact reference",
  );

  const noSignalJob = SummaryJob.request({
    id: "00000000-0000-7000-8000-000000000602",
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    idempotencyKey: "summary-job:interest:2026-06-08:no-signal",
    requestedAt: clock.now(),
  })
    .start({ startedAt: new Date("2026-06-08T00:03:00.000Z") })
    .markNoSignal({
      completedAt: new Date("2026-06-08T00:04:00.000Z"),
      summaryId: noSignalArtifact.toSnapshot().summaryId,
    });
  await summaryJobs.save(noSignalJob);

  const listed = await summaryArtifacts.list({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    limit: 1,
  });
  assert(
    listed.items.length === 1,
    "summary artifact repository must page first item",
  );
  assert(
    listed.nextCursor !== undefined,
    "summary artifact repository must return cursor when more items exist",
  );
  const secondPage = await summaryArtifacts.list({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    limit: 1,
    cursor: listed.nextCursor,
  });
  assert(
    secondPage.items.length === 1,
    "summary artifact repository must page second item",
  );

  const foundArtifact = await summaryArtifacts.findById({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: completedArtifact.toSnapshot().summaryId,
  });
  assert(
    foundArtifact !== null,
    "summary artifact findById must return saved artifact",
  );
  const foundSnapshot = foundArtifact.toSnapshot();
  assert(
    foundSnapshot.executiveSummary === "Durable summary body",
    "summary artifact text must rehydrate",
  );
  assert(
    foundSnapshot.sourceWindow.startedAt.toISOString() ===
      "2026-06-08T00:00:00.000Z",
    "summary artifact source window start must rehydrate as Date",
  );

  const feedback = SummaryFeedback.record({
    id: "00000000-0000-7000-8000-000000000701",
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: completedArtifact.toSnapshot().summaryId,
    interestId,
    idempotencyKey: "feedback:summary:durable",
    submittedBy: "beta-user@example.test",
    rating: 2,
    category: "bad_citation",
    comment: "The cited item does not support the claim.",
    evidence: {
      summaryId: completedArtifact.toSnapshot().summaryId,
      interestId,
      citationId: "citation-1",
      feedItemId: "feed-1",
      sourceItemId: "source-1",
      providerKey: "rss",
    },
    triageOwner: "summary-owner",
    eligibleForEvalFixture: true,
    createdAt: clock.now(),
  });
  await feedbackRepository.save(feedback);

  const foundFeedback = await feedbackRepository.findByIdempotencyKey({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: "feedback:summary:durable",
  });
  assert(
    foundFeedback?.toSnapshot().category === "bad_citation",
    "summary feedback category must round-trip",
  );
  assert(
    foundFeedback.toSnapshot().evidence.citationId === "citation-1",
    "summary feedback evidence must round-trip",
  );
  assert(
    foundFeedback.toSnapshot().evidence.providerKey === "rss",
    "summary feedback provider key evidence must round-trip",
  );

  const listedFeedback = await feedbackRepository.list({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: completedArtifact.toSnapshot().summaryId,
    limit: 1,
  });
  assert(
    listedFeedback.items.length === 1,
    "summary feedback repository must list saved feedback",
  );
  assert(
    listedFeedback.items[0]?.toSnapshot().id === feedback.toSnapshot().id,
    "summary feedback repository list must preserve feedback identity",
  );

  const policy = SummaryPolicy.create({
    id: "00000000-0000-7000-8000-000000000801",
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    language: "ru",
    format: "bullet_digest",
    tone: "analytical",
    maxKeyPoints: 7,
    includeRisks: true,
    includeSourceHighlights: false,
    customInstructions: "Focus on launch and pricing signals.",
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  await summaryPolicies.save(policy);
  const foundPolicy = await summaryPolicies.findByInterest({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
  });
  assert(
    foundPolicy?.toSnapshot().language === "ru",
    "summary policy language must round-trip",
  );
  assert(
    foundPolicy.toSnapshot().customInstructions ===
      "Focus on launch and pricing signals.",
    "summary policy custom instructions must round-trip",
  );

  await summaryEvents.publish({
    eventId: eventId("00000000-0000-7000-8000-000000000901"),
    eventType: "summary.ready",
    schemaVersion: 1,
    occurredAt: clock.now(),
    tenantId: tenant,
    workspaceId: workspace,
    correlationId: correlationId("summary-prisma-outbox-smoke"),
    causationId: causationId("summary-job:interest:2026-06-08"),
    payload: {
      summaryId: completedArtifact.toSnapshot().summaryId,
      interestId,
      summaryJobId: completedJob.toSnapshot().id,
    },
  });

  const outboxRecord = prisma.outboxEvents.get(
    "00000000-0000-7000-8000-000000000901",
  );
  assert(
    outboxRecord?.eventType === "summary.ready",
    "summary event publisher must persist event type",
  );
  assert(
    outboxRecord.status === "PENDING",
    "summary outbox event must start pending",
  );
  assert(
    outboxRecord.tenantId === tenant,
    "summary outbox event must preserve tenant scope",
  );
  assert(
    outboxRecord.workspaceId === workspace,
    "summary outbox event must preserve workspace scope",
  );

  await topicRecommendationDecisions.save(
    ReaderSummaryTopicRecommendationDecision.record({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:cybersecurity",
      topicLabel: "cybersecurity",
      status: "accepted",
      decidedBy: "admin-demo",
      note: "promote after stable signal",
      decidedAt: clock.now(),
    }),
  );
  const decisions = await topicRecommendationDecisions.listByRecommendationIds({
    tenantId: tenant,
    workspaceId: workspace,
    recommendationIds: ["topic-rec:14:cybersecurity"],
  });
  assert(
    decisions.length === 1 && decisions[0]?.toSnapshot().status === "accepted",
    "reader summary topic recommendation decision must round-trip",
  );

  await readerSummaryArtifacts.save(
    makeReaderSummaryArtifact("00000000-0000-7000-8000-000000000b01", {
      headline: "Older reader summary",
    }),
  );
  await readerSummaryArtifacts.save(
    makeReaderSummaryArtifact("00000000-0000-7000-8000-000000000b02", {
      headline: "Latest reader summary",
    }),
  );

  const visibleReaderSummaries = await readerSummaryArtifacts.list({
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    cadence: "daily",
    periodStartedAt: new Date("2026-06-08T00:00:00.000Z"),
    periodEndedAt: new Date("2026-06-09T00:00:00.000Z"),
    timezone: "UTC",
    limit: 10,
  });
  assert(
    visibleReaderSummaries.items.length === 1 &&
      visibleReaderSummaries.items[0]?.toSnapshot().readerSummaryId ===
        "00000000-0000-7000-8000-000000000b02",
    "reader summary artifact save must supersede older visible same-period artifacts",
  );
  assert(
    prisma.readerSummaryArtifactStatus(
      "00000000-0000-7000-8000-000000000b01",
    ) === "SUPERSEDED",
    "superseded reader summary artifact must use SUPERSEDED status",
  );

  console.log("Summary Prisma persistence smoke OK");
}

const makeCompletedArtifact = (summaryId: string): SummaryArtifact =>
  SummaryArtifact.create({
    schemaVersion: "summary.artifact.v1",
    summaryId,
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    sourceWindow: {
      windowId: "window-1",
      startedAt: new Date("2026-06-08T00:00:00.000Z"),
      endedAt: new Date("2026-06-08T01:00:00.000Z"),
      selectedFeedItemIds: ["feed-1"],
    },
    headline: "Durable summary",
    executiveSummary: "Durable summary body",
    keyPoints: [
      {
        claim: "Durable summary claim",
        citationIds: ["citation-1"],
      },
    ],
    risksAndUnknowns: [
      {
        description: "Limited beta evidence",
        citationIds: ["citation-1"],
      },
    ],
    sourceHighlights: ["Durable source highlight"],
    citationMap: [
      {
        citationId: "citation-1",
        feedItemId: "feed-1",
        sourceItemId: "source-1",
        providerKey: "rss",
        field: "bodyPreview",
      },
    ],
    qualityFlags: [],
    confidence: {
      level: "high",
      score: 0.91,
      rationale: "Single controlled fixture with direct citation",
    },
    lineage: {
      promptVersion: "summary.prompt.v1",
      schemaVersion: "summary.artifact.v1",
      modelVersion: "deterministic-local.v1",
      providerVersion: "local",
      rulesVersion: "summary.rules.v1",
      evalDatasetVersion: "summary.eval.v1",
    },
    usage: {
      inputTokens: 120,
      outputTokens: 40,
      estimatedCostUsd: 0,
    },
  });

const makeNoSignalArtifact = (summaryId: string): SummaryArtifact =>
  SummaryArtifact.create({
    schemaVersion: "summary.artifact.v1",
    summaryId,
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    sourceWindow: {
      windowId: "window-2",
      startedAt: new Date("2026-06-08T02:00:00.000Z"),
      endedAt: new Date("2026-06-08T03:00:00.000Z"),
      selectedFeedItemIds: [],
    },
    headline: "No reliable signal",
    executiveSummary: "No reliable signal in the selected source window.",
    keyPoints: [],
    risksAndUnknowns: [
      {
        description: "No evidence was selected",
        reason: "insufficient_evidence",
      },
    ],
    sourceHighlights: [],
    citationMap: [],
    qualityFlags: ["no_signal"],
    confidence: {
      level: "none",
      score: 0,
      rationale: "No selected evidence",
    },
    lineage: {
      promptVersion: "summary.prompt.v1",
      schemaVersion: "summary.artifact.v1",
      modelVersion: "deterministic-local.v1",
      providerVersion: "local",
      rulesVersion: "summary.rules.v1",
      evalDatasetVersion: "summary.eval.v1",
    },
    usage: {
      inputTokens: 12,
      outputTokens: 12,
      estimatedCostUsd: 0,
    },
    noSignalReason: "No selected evidence",
  });

const makeReaderSummaryArtifact = (
  readerSummaryId: string,
  overrides: { readonly headline: string },
): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt: new Date("2026-06-08T00:00:00.000Z"),
      endedAt: new Date("2026-06-09T00:00:00.000Z"),
      timezone: "UTC",
      periodKey:
        "daily:2026-06-08T00:00:00.000Z:2026-06-09T00:00:00.000Z:UTC",
    },
    sourceWindow: {
      windowId: "reader-window-1",
      startedAt: new Date("2026-06-08T08:00:00.000Z"),
      endedAt: new Date("2026-06-08T09:00:00.000Z"),
      selectedFeedItemIds: ["reader-feed-1"],
      storyClusterIds: ["reader-story-1"],
    },
    storyClusters: [
      {
        id: "reader-story-1",
        storyKey: "url:example.test/reader-summary",
        representativeFeedItemId: "reader-feed-1",
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai"],
        providerKeys: ["rss"],
        score: 1.2,
        observedAtRange: {
          startedAt: new Date("2026-06-08T08:00:00.000Z"),
          endedAt: new Date("2026-06-08T09:00:00.000Z"),
        },
        whyImportant: ["Relevant source item."],
      },
    ],
    contextArtifacts: [],
    headline: overrides.headline,
    executiveSummary: "Reader summary body",
    content: {
      headline: overrides.headline,
      oneLineTakeaway: "Reader takeaway",
      bullets: ["Reader bullet"],
      mainTopics: ["AI"],
      qualityState: {
        status: "ready",
        flags: [],
        warnings: [],
        isSingleSource: true,
      },
      interestSections: [],
      sourceMix: [
        {
          providerKey: "rss",
          itemCount: 1,
          citationCount: 1,
          storyClusterCount: 1,
          crossSourceClusterCount: 0,
          singleSourceOnly: true,
          interestIds: ["interest-ai"],
        },
      ],
      topReads: [readerSummaryTopRead()],
      selectedPosts: [readerSummaryTopRead()],
      claimBoard: [],
      reliabilityReport: emptyReaderSummaryReliabilityReport(),
      trendDelta: {
        newSignals: ["1 RSS item selected"],
        growingSignals: [],
        repeatedSignals: [],
        fadingSignals: [],
      },
      risks: [],
      openQuestions: ["Is there confirming source evidence?"],
      nextActions: [],
    },
    topStories: [
      {
        storyClusterId: "reader-story-1",
        title: "Reader source signal",
        summary: "A cited source item is relevant.",
        interestIds: ["interest-ai"],
        providerKeys: ["rss"],
        citationIds: ["reader-citation-1"],
      },
    ],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [
      {
        citationId: "reader-citation-1",
        feedItemId: "reader-feed-1",
        sourceItemId: "reader-source-1",
        providerKey: "rss",
        field: "bodyPreview",
        canonicalUrl: "https://example.test/reader-summary",
      },
    ],
    qualityFlags: [],
    confidence: {
      level: "high",
      score: 0.9,
      rationale: "Durable reader summary smoke fixture",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "deterministic-local.v1",
      providerVersion: "local",
      rulesVersion: "reader-summary.rules.v1",
      evalDatasetVersion: "reader-summary.eval.v1",
    },
    usage: {
      inputTokens: 100,
      outputTokens: 40,
      estimatedCostUsd: 0,
    },
  });

const readerSummaryTopRead = () => ({
  storyClusterId: "reader-story-1",
  title: "Reader source signal",
  providerKey: "rss",
  providerName: "RSS",
  primaryActionKind: "read_source" as const,
  reason: "It is relevant to the monitored topic.",
  matchedInterestIds: ["interest-ai"],
  matchedRules: ["ai"],
  signalScore: 1.2,
  confidence: {
    level: "medium" as const,
    score: 0.64,
    rationale: "The source item is cited.",
  },
  confirmedProviderKeys: ["rss"],
  providerMetrics: [],
  whyImportant: ["Relevant source item."],
  whyNow: "It appeared in the current summary window.",
  canonicalUrl: "https://example.test/reader-summary",
  citationIds: ["reader-citation-1"],
  previewMedia: undefined,
});

class FakePrismaSummaryClient implements PrismaSummaryClient {
  private readonly jobs = new Map<string, PrismaSummaryJobRecord>();
  private readonly artifacts = new Map<string, PrismaSummaryArtifactRecord>();
  private readonly feedback = new Map<string, PrismaSummaryFeedbackRecord>();
  private readonly policies = new Map<string, PrismaSummaryPolicyRecord>();
  private readonly readerSummaryJobs = new Map<
    string,
    PrismaReaderSummaryJobRecord
  >();
  private readonly readerSummaryArtifacts = new Map<
    string,
    PrismaReaderSummaryArtifactRecord
  >();
  private readonly readerSummaryPolicies = new Map<
    string,
    PrismaReaderSummaryPolicyRecord
  >();
  private readonly readerSummaryTopicRecommendationDecisions = new Map<
    string,
    PrismaReaderSummaryTopicRecommendationDecisionRecord
  >();
  readonly outboxEvents = new Map<string, PrismaSummaryOutboxEventRecord>();

  readerSummaryArtifactStatus(id: string): PrismaSummaryStatus | undefined {
    return this.readerSummaryArtifacts.get(id)?.status;
  }

  readonly $queryRaw: PrismaSummaryClient["$queryRaw"] = async () => {
    throw new Error(
      "FakePrismaSummaryClient.$queryRaw is not implemented for this smoke",
    );
  };

  readonly conversationUnit: PrismaSummaryClient["conversationUnit"] = {
    upsert: async (args) => {
      void args;
      throw new Error(
        "FakePrismaSummaryClient.conversationUnit.upsert is not implemented for this smoke",
      );
    },
    findMany: async (args) => {
      void args;
      return [];
    },
  };

  readonly conversationSignalBaselineSample: PrismaSummaryClient["conversationSignalBaselineSample"] =
    {
      upsert: async (args) => {
        void args;
        throw new Error(
          "FakePrismaSummaryClient.conversationSignalBaselineSample.upsert is not implemented for this smoke",
        );
      },
      findMany: async (args) => {
        void args;
        return [];
      },
    };

  readonly summaryJob: PrismaSummaryClient["summaryJob"] = {
    upsert: async (args) => {
      const existing = this.jobs.get(args.where.id);
      const record: PrismaSummaryJobRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        interestId: existing?.interestId ?? args.create.interestId,
        userId:
          args.update.userId ?? existing?.userId ?? args.create.userId ?? null,
        subscriptionId:
          args.update.subscriptionId ??
          existing?.subscriptionId ??
          args.create.subscriptionId ??
          null,
        status: args.update.status,
        idempotencyKey: args.update.idempotencyKey,
        requestedAt: args.update.requestedAt,
        startedAt: args.update.startedAt ?? null,
        completedAt: args.update.completedAt ?? null,
        failedAt: args.update.failedAt ?? null,
        summaryArtifactId: args.update.summaryArtifactId ?? null,
        failureReason: args.update.failureReason ?? null,
        createdAt: existing?.createdAt ?? clock.now(),
        updatedAt: clock.now(),
      };
      this.jobs.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.jobs.values()].find(
        (record) =>
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          (args.where.id === undefined || record.id === args.where.id) &&
          (args.where.idempotencyKey === undefined ||
            record.idempotencyKey === args.where.idempotencyKey),
      ) ?? null,
    findMany: async (args) =>
      [...this.jobs.values()]
        .filter(
          (record) =>
            record.status === args.where.status &&
            (args.where.tenantId === undefined ||
              record.tenantId === args.where.tenantId) &&
            (args.where.workspaceId === undefined ||
              record.workspaceId === args.where.workspaceId),
        )
        .sort((left, right) => {
          const requestedDiff =
            left.requestedAt.getTime() - right.requestedAt.getTime();

          return requestedDiff === 0
            ? left.id.localeCompare(right.id)
            : requestedDiff;
        })
        .slice(0, args.take),
  };

  readonly summaryArtifact: PrismaSummaryClient["summaryArtifact"] = {
    upsert: async (args) => {
      const existing = this.artifacts.get(args.where.id);
      const record: PrismaSummaryArtifactRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        interestId: existing?.interestId ?? args.create.interestId,
        userId:
          args.update.userId ?? existing?.userId ?? args.create.userId ?? null,
        subscriptionId:
          args.update.subscriptionId ??
          existing?.subscriptionId ??
          args.create.subscriptionId ??
          null,
        schemaVersion: existing?.schemaVersion ?? args.create.schemaVersion,
        status: args.update.status,
        modelVersion: args.update.modelVersion,
        promptVersion: args.update.promptVersion,
        headline: args.update.headline,
        summaryText: args.update.summaryText,
        artifactPayload: args.update.artifactPayload,
        citations: args.update.citations,
        qualitySignals: args.update.qualitySignals,
        createdAt: existing?.createdAt ?? clock.now(),
        updatedAt: clock.now(),
      };
      this.artifacts.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.artifacts.values()].find(
        (record) =>
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.id === args.where.id,
      ) ?? null,
    findMany: async (args) =>
      this.filterArtifacts(args.where)
        .sort(compareArtifacts)
        .slice(args.skip, args.skip + args.take),
    count: async (args) => this.filterArtifacts(args.where).length,
  };

  readonly summaryFeedback: PrismaSummaryClient["summaryFeedback"] = {
    upsert: async (args) => {
      const key = `${args.where.tenantId_idempotencyKey.tenantId}:${args.where.tenantId_idempotencyKey.idempotencyKey}`;
      const existing = this.feedback.get(key);
      const record: PrismaSummaryFeedbackRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        summaryArtifactId:
          existing?.summaryArtifactId ?? args.create.summaryArtifactId,
        interestId: existing?.interestId ?? args.create.interestId,
        idempotencyKey: existing?.idempotencyKey ?? args.create.idempotencyKey,
        submittedBy: args.update.submittedBy,
        rating: args.update.rating,
        category: args.update.category,
        triageOwner: args.update.triageOwner,
        eligibleForEvalFixture: args.update.eligibleForEvalFixture,
        note: args.update.note,
        evidence: args.update.evidence,
        createdAt: existing?.createdAt ?? args.create.createdAt,
      };
      this.feedback.set(key, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.feedback.values()].find(
        (record) =>
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.idempotencyKey === args.where.idempotencyKey,
      ) ?? null,
    findMany: async (args) =>
      this.filterFeedback(args.where)
        .sort(compareFeedback)
        .slice(args.skip, args.skip + args.take),
    count: async (args) => this.filterFeedback(args.where).length,
  };

  readonly summaryPolicy: PrismaSummaryClient["summaryPolicy"] = {
    upsert: async (args) => {
      const key = [
        args.where.tenantId_workspaceId_interestId.tenantId,
        args.where.tenantId_workspaceId_interestId.workspaceId,
        args.where.tenantId_workspaceId_interestId.interestId,
      ].join(":");
      const existing = this.policies.get(key);
      const record: PrismaSummaryPolicyRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        interestId: existing?.interestId ?? args.create.interestId,
        language: args.update.language,
        format: args.update.format,
        tone: args.update.tone,
        maxKeyPoints: args.update.maxKeyPoints,
        includeRisks: args.update.includeRisks,
        includeSourceHighlights: args.update.includeSourceHighlights,
        customInstructions: args.update.customInstructions,
        rulesVersion: args.update.rulesVersion,
        createdAt: existing?.createdAt ?? args.create.createdAt,
        updatedAt: args.update.updatedAt,
      };
      this.policies.set(key, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.policies.values()].find(
        (record) =>
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.interestId === args.where.interestId,
      ) ?? null,
  };

  readonly readerSummaryJob: PrismaSummaryClient["readerSummaryJob"] = {
    upsert: async (args) => {
      const existing = this.readerSummaryJobs.get(args.where.id);
      const record: PrismaReaderSummaryJobRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        scopeType: args.update.scopeType,
        scopeKey: args.update.scopeKey,
        interestId:
          args.update.interestId ??
          existing?.interestId ??
          args.create.interestId ??
          null,
        cadence: args.update.cadence,
        periodStartedAt: args.update.periodStartedAt,
        periodEndedAt: args.update.periodEndedAt,
        periodTimezone: args.update.periodTimezone,
        periodKey: args.update.periodKey,
        userId:
          args.update.userId ?? existing?.userId ?? args.create.userId ?? null,
        subscriptionId:
          args.update.subscriptionId ??
          existing?.subscriptionId ??
          args.create.subscriptionId ??
          null,
        status: args.update.status,
        idempotencyKey: args.update.idempotencyKey,
        requestedAt: args.update.requestedAt,
        startedAt: args.update.startedAt ?? null,
        completedAt: args.update.completedAt ?? null,
        failedAt: args.update.failedAt ?? null,
        readerSummaryArtifactId: args.update.readerSummaryArtifactId ?? null,
        failureReason: args.update.failureReason ?? null,
        createdAt: existing?.createdAt ?? clock.now(),
        updatedAt: clock.now(),
      };
      this.readerSummaryJobs.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.readerSummaryJobs.values()].find(
        (record) =>
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          (args.where.id === undefined || record.id === args.where.id) &&
          (args.where.idempotencyKey === undefined ||
            record.idempotencyKey === args.where.idempotencyKey) &&
          readerSummaryJobStatusMatches(record.status, args.where.status),
      ) ?? null,
    updateMany: async (args) => {
      const record = this.readerSummaryJobs.get(args.where.id);
      if (
        record === undefined ||
        record.tenantId !== args.where.tenantId ||
        record.workspaceId !== args.where.workspaceId ||
        record.status !== args.where.status
      ) {
        return { count: 0 };
      }

      this.readerSummaryJobs.set(record.id, {
        ...record,
        ...args.data,
        updatedAt: clock.now(),
      });

      return { count: 1 };
    },
    findMany: async (args) =>
      [...this.readerSummaryJobs.values()]
        .filter(
          (record) =>
            record.status === args.where.status &&
            (args.where.tenantId === undefined ||
              record.tenantId === args.where.tenantId) &&
            (args.where.workspaceId === undefined ||
              record.workspaceId === args.where.workspaceId),
        )
        .sort((left, right) => {
          const requestedDiff =
            left.requestedAt.getTime() - right.requestedAt.getTime();

          return requestedDiff === 0
            ? left.id.localeCompare(right.id)
            : requestedDiff;
        })
        .slice(0, args.take),
  };

  readonly readerSummaryArtifact: PrismaSummaryClient["readerSummaryArtifact"] =
    {
      upsert: async (args) => {
        const existing = this.readerSummaryArtifacts.get(args.where.id);
        const record: PrismaReaderSummaryArtifactRecord = {
          id: existing?.id ?? args.create.id,
          tenantId: existing?.tenantId ?? args.create.tenantId,
          workspaceId: existing?.workspaceId ?? args.create.workspaceId,
          scopeType: args.update.scopeType,
          scopeKey: args.update.scopeKey,
          interestId:
            args.update.interestId ??
            existing?.interestId ??
            args.create.interestId ??
            null,
          cadence: args.update.cadence,
          periodStartedAt: args.update.periodStartedAt,
          periodEndedAt: args.update.periodEndedAt,
          periodTimezone: args.update.periodTimezone,
          periodKey: args.update.periodKey,
          userId:
            args.update.userId ??
            existing?.userId ??
            args.create.userId ??
            null,
          subscriptionId:
            args.update.subscriptionId ??
            existing?.subscriptionId ??
            args.create.subscriptionId ??
            null,
          schemaVersion: existing?.schemaVersion ?? args.create.schemaVersion,
          status: args.update.status,
          modelVersion: args.update.modelVersion,
          promptVersion: args.update.promptVersion,
          headline: args.update.headline,
          summaryText: args.update.summaryText,
          artifactPayload: args.update.artifactPayload,
          citations: args.update.citations,
          qualitySignals: args.update.qualitySignals,
          createdAt: existing?.createdAt ?? clock.now(),
          updatedAt: clock.now(),
        };
        this.readerSummaryArtifacts.set(record.id, record);

        return record;
      },
      updateMany: async (args) => {
        let count = 0;
        for (const record of this.filterReaderSummaryArtifacts(args.where)) {
          const updated: PrismaReaderSummaryArtifactRecord = {
            ...record,
            status: args.data.status,
            updatedAt: clock.now(),
          };
          this.readerSummaryArtifacts.set(record.id, updated);
          count += 1;
        }

        return { count };
      },
      findFirst: async (args) =>
        [...this.readerSummaryArtifacts.values()].find(
          (record) =>
            record.tenantId === args.where.tenantId &&
            record.workspaceId === args.where.workspaceId &&
            record.id === args.where.id,
        ) ?? null,
      findMany: async (args) =>
        this.filterReaderSummaryArtifacts(args.where)
          .sort(compareReaderSummaryArtifacts)
          .slice(args.skip, args.skip + args.take),
      count: async (args) =>
        this.filterReaderSummaryArtifacts(args.where).length,
    };

  readonly readerSummaryPolicy: PrismaSummaryClient["readerSummaryPolicy"] = {
    upsert: async (args) => {
      const key = [
        args.where.tenantId_workspaceId_scopeKey.tenantId,
        args.where.tenantId_workspaceId_scopeKey.workspaceId,
        args.where.tenantId_workspaceId_scopeKey.scopeKey,
      ].join(":");
      const existing = this.readerSummaryPolicies.get(key);
      const record: PrismaReaderSummaryPolicyRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        scopeType: args.update.scopeType,
        scopeKey: args.update.scopeKey,
        interestId:
          args.update.interestId ??
          existing?.interestId ??
          args.create.interestId ??
          null,
        language: args.update.language,
        format: args.update.format,
        tone: args.update.tone,
        maxStories: args.update.maxStories,
        includeRisks: args.update.includeRisks,
        includeInterestHighlights: args.update.includeInterestHighlights,
        includeRepeatedSignals: args.update.includeRepeatedSignals,
        dedupeStrategy: args.update.dedupeStrategy,
        customInstructions: args.update.customInstructions,
        rulesVersion: args.update.rulesVersion,
        scheduleEnabled: args.update.scheduleEnabled,
        scheduleTimezone: args.update.scheduleTimezone,
        scheduleCadences: args.update.scheduleCadences,
        createdAt: existing?.createdAt ?? args.create.createdAt,
        updatedAt: args.update.updatedAt,
      };
      this.readerSummaryPolicies.set(key, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.readerSummaryPolicies.values()].find(
        (record) =>
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.scopeKey === args.where.scopeKey,
      ) ?? null,
    findMany: async (args) =>
      [...this.readerSummaryPolicies.values()]
        .filter(
          (record) =>
            record.scheduleEnabled === args.where.scheduleEnabled &&
            (args.where.tenantId === undefined ||
              record.tenantId === args.where.tenantId) &&
            (args.where.workspaceId === undefined ||
              record.workspaceId === args.where.workspaceId),
        )
        .sort((left, right) => {
          const updatedAtDiff =
            right.updatedAt.getTime() - left.updatedAt.getTime();

          return updatedAtDiff === 0
            ? right.id.localeCompare(left.id)
            : updatedAtDiff;
        })
        .slice(0, args.take),
  };

  readonly readerSummaryTopicRecommendationDecision: PrismaSummaryClient["readerSummaryTopicRecommendationDecision"] =
    {
      upsert: async (args) => {
        const key = [
          args.where.tenantId_workspaceId_recommendationId.tenantId,
          args.where.tenantId_workspaceId_recommendationId.workspaceId,
          args.where.tenantId_workspaceId_recommendationId.recommendationId,
        ].join(":");
        const existing =
          this.readerSummaryTopicRecommendationDecisions.get(key);
        const record: PrismaReaderSummaryTopicRecommendationDecisionRecord = {
          id: existing?.id ?? args.create.id,
          tenantId: existing?.tenantId ?? args.create.tenantId,
          workspaceId: existing?.workspaceId ?? args.create.workspaceId,
          recommendationId:
            existing?.recommendationId ?? args.create.recommendationId,
          topicLabel: args.update.topicLabel,
          status: args.update.status,
          decidedBy: args.update.decidedBy,
          note: args.update.note,
          decidedAt: args.update.decidedAt,
          application: args.update.application,
          createdAt: existing?.createdAt ?? clock.now(),
          updatedAt: clock.now(),
        };
        this.readerSummaryTopicRecommendationDecisions.set(key, record);

        return record;
      },
      findMany: async (args) =>
        [...this.readerSummaryTopicRecommendationDecisions.values()].filter(
          (record) =>
            record.tenantId === args.where.tenantId &&
            record.workspaceId === args.where.workspaceId &&
            args.where.recommendationId.in.includes(record.recommendationId),
        ),
      findUnique: async (args) =>
        this.readerSummaryTopicRecommendationDecisions.get(
          [
            args.where.tenantId_workspaceId_recommendationId.tenantId,
            args.where.tenantId_workspaceId_recommendationId.workspaceId,
            args.where.tenantId_workspaceId_recommendationId.recommendationId,
          ].join(":"),
        ) ?? null,
      deleteMany: async (args) => {
        const key = [
          args.where.tenantId,
          args.where.workspaceId,
          args.where.recommendationId,
        ].join(":");
        const deleted = this.readerSummaryTopicRecommendationDecisions.delete(key);

        return { count: deleted ? 1 : 0 };
      },
    };

  readonly outboxEvent: PrismaSummaryClient["outboxEvent"] = {
    create: async (args) => {
      const record: PrismaSummaryOutboxEventRecord = {
        id: args.data.id,
        tenantId: args.data.tenantId ?? null,
        workspaceId: args.data.workspaceId ?? null,
        eventType: args.data.eventType,
        schemaVersion: args.data.schemaVersion,
        payload: args.data.payload,
        status: "PENDING",
        correlationId: args.data.correlationId,
        causationId: args.data.causationId ?? null,
        createdAt: clock.now(),
        publishedAt: null,
      };
      this.outboxEvents.set(record.id, record);

      return record;
    },
  };

  private filterArtifacts(where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly interestId?: string;
    readonly status?: { readonly in: readonly PrismaSummaryStatus[] };
  }): PrismaSummaryArtifactRecord[] {
    return [...this.artifacts.values()].filter(
      (record) =>
        record.tenantId === where.tenantId &&
        record.workspaceId === where.workspaceId &&
        (where.interestId === undefined ||
          record.interestId === where.interestId) &&
        (where.status === undefined || where.status.in.includes(record.status)),
    );
  }

  private filterFeedback(where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly summaryArtifactId?: string;
    readonly createdAt?: {
      readonly gte?: Date;
      readonly lte?: Date;
    };
  }): PrismaSummaryFeedbackRecord[] {
    return [...this.feedback.values()].filter(
      (record) =>
        record.tenantId === where.tenantId &&
        record.workspaceId === where.workspaceId &&
        (where.summaryArtifactId === undefined ||
          record.summaryArtifactId === where.summaryArtifactId) &&
        (where.createdAt?.gte === undefined ||
          record.createdAt.getTime() >= where.createdAt.gte.getTime()) &&
        (where.createdAt?.lte === undefined ||
          record.createdAt.getTime() <= where.createdAt.lte.getTime()),
    );
  }

  private filterReaderSummaryArtifacts(where: {
    readonly id?: { readonly not: string };
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly scopeKey?: string;
    readonly cadence?: string;
    readonly periodStartedAt?:
      | Date
      | {
          readonly equals?: Date;
          readonly gte?: Date;
          readonly lt?: Date;
        };
    readonly periodEndedAt?: Date;
    readonly periodTimezone?: string;
    readonly status?: { readonly in: readonly PrismaSummaryStatus[] };
  }): PrismaReaderSummaryArtifactRecord[] {
    return [...this.readerSummaryArtifacts.values()].filter(
      (record) =>
        record.tenantId === where.tenantId &&
        record.workspaceId === where.workspaceId &&
        (where.id?.not === undefined || record.id !== where.id.not) &&
        (where.scopeKey === undefined || record.scopeKey === where.scopeKey) &&
        (where.cadence === undefined || record.cadence === where.cadence) &&
        readerSummaryPeriodStartedAtMatches(
          record.periodStartedAt,
          where.periodStartedAt,
        ) &&
        (where.periodEndedAt === undefined ||
          record.periodEndedAt.getTime() === where.periodEndedAt.getTime()) &&
        (where.periodTimezone === undefined ||
          record.periodTimezone === where.periodTimezone) &&
        (where.status === undefined || where.status.in.includes(record.status)),
    );
  }
}

const compareArtifacts = (
  left: PrismaSummaryArtifactRecord,
  right: PrismaSummaryArtifactRecord,
): number => {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

const compareFeedback = (
  left: PrismaSummaryFeedbackRecord,
  right: PrismaSummaryFeedbackRecord,
): number => {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

const compareReaderSummaryArtifacts = (
  left: PrismaReaderSummaryArtifactRecord,
  right: PrismaReaderSummaryArtifactRecord,
): number => {
  const periodDiff =
    right.periodStartedAt.getTime() - left.periodStartedAt.getTime();

  if (periodDiff !== 0) {
    return periodDiff;
  }

  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();
  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

const readerSummaryPeriodStartedAtMatches = (
  recordValue: Date,
  filter:
    | Date
    | {
        readonly equals?: Date;
        readonly gte?: Date;
        readonly lt?: Date;
      }
    | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }

  if (filter instanceof Date) {
    return recordValue.getTime() === filter.getTime();
  }

  return (
    (filter.equals === undefined ||
      recordValue.getTime() === filter.equals.getTime()) &&
    (filter.gte === undefined ||
      recordValue.getTime() >= filter.gte.getTime()) &&
    (filter.lt === undefined || recordValue.getTime() < filter.lt.getTime())
  );
};

const readerSummaryJobStatusMatches = (
  recordStatus: PrismaSummaryStatus,
  filter:
    | PrismaSummaryStatus
    | { readonly in: readonly PrismaSummaryStatus[] }
    | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if (typeof filter === "string") {
    return recordStatus === filter;
  }

  return filter.in.includes(recordStatus);
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const assertThrows = (operation: () => unknown, message: string): void => {
  try {
    operation();
  } catch {
    return;
  }

  throw new Error(message);
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
