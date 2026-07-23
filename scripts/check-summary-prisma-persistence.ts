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
  ReaderSummaryJob,
  ReaderSummaryTopicRecommendationDecision,
  readerSummaryGitHubProjectionCollectionGraceMs,
  readerSummaryGitHubProjectionCollectionWarningThresholdMs,
  SummaryArtifact,
  SummaryFeedback,
  SummaryJob,
  SummaryPolicy,
} from "../libs/summary/domain";
import { emptyReaderSummaryReliabilityReport } from "../libs/summary/domain/entities/reader-summary-reliability";
import { PrismaSummaryArtifactRepository } from "../libs/summary/adapters/persistence/prisma/prisma-summary-artifact.repository";
import { PrismaSummaryEventPublisher } from "../libs/summary/adapters/persistence/prisma/prisma-summary-event.publisher";
import { PrismaSummaryFeedbackRepository } from "../libs/summary/adapters/persistence/prisma/prisma-summary-feedback.repository";
import { PrismaSummaryJobRepository } from "../libs/summary/adapters/persistence/prisma/prisma-summary-job.repository";
import { PrismaSummaryPolicyRepository } from "../libs/summary/adapters/persistence/prisma/prisma-summary-policy.repository";
import { PrismaReaderSummaryTopicRecommendationDecisionRepository } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-topic-recommendation-decision.repository";
import { PrismaReaderSummaryArtifactRepository } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaReaderSummaryJobRepository } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { resolveSummaryPersistenceMode } from "../libs/summary/interfaces/rest/summary-provider-tokens";
import { FakePrismaSummaryClient } from "./lib/fake-prisma-summary-client";

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
  const readerSummaryJobs = new PrismaReaderSummaryJobRepository(prisma);
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
    verifiedGitHubProjectionOptions(),
  );
  await readerSummaryArtifacts.save(
    makeReaderSummaryArtifact("00000000-0000-7000-8000-000000000b02", {
      headline: "Latest reader summary",
    }),
    verifiedGitHubProjectionOptions(),
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
    visibleReaderSummaries.items.length === 0,
    "reader summary artifact candidates must remain hidden before exact publication",
  );
  assert(
    prisma.readerSummaryArtifactStatus(
      "00000000-0000-7000-8000-000000000b01",
    ) === "RUNNING" &&
      prisma.readerSummaryArtifactStatus(
        "00000000-0000-7000-8000-000000000b02",
      ) === "RUNNING",
    "reader summary artifact saves must persist only hidden candidates",
  );

  await readerSummaryArtifacts.save(
    makeReaderSummaryArtifact("00000000-0000-7000-8000-000000000b03", {
      headline: "Rejected reader summary",
    }),
    {
      ...verifiedGitHubProjectionOptions(),
      publicationDecision: {
        status: "rejected",
        qualityPassed: false,
        canonicalScore: 0.2,
        shadow: {
          mode: "shadow",
          policyVersion: "reader_summary_publication_shadow_v1",
          riskScore: 0.7,
          signals: [
            {
              code: "single_source",
              score: 0.7,
              reason: "Selected evidence comes from a single provider family.",
            },
          ],
        },
        reasonCodes: ["top_read_ineligible_source"],
        reasons: ["Top read references ineligible evidence."],
        findings: [
          {
            code: "top_read_ineligible_source",
            reason: "Top read references ineligible evidence.",
            topReadTitle: "Rejected reader summary",
            citationId: "reader-citation-1",
            feedItemId: "reader-feed-1",
            sourceItemId: "reader-source-1",
            providerKey: "rss",
            canonicalUrl: "https://example.test/reader-summary",
          },
        ],
      },
    },
  );
  const visibleAfterRejected = await readerSummaryArtifacts.list({
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
    visibleAfterRejected.items.length === 0,
    "rejected reader summary artifact must not expose hidden candidates",
  );
  assert(
    prisma.readerSummaryArtifactStatus(
      "00000000-0000-7000-8000-000000000b03",
    ) === "REJECTED",
    "rejected reader summary artifact must use REJECTED status",
  );
  const rejectedById = await readerSummaryArtifacts.findById({
    tenantId: tenant,
    workspaceId: workspace,
    readerSummaryId: "00000000-0000-7000-8000-000000000b03",
  });
  assert(
    rejectedById === null,
    "rejected reader summary artifact must not be readable through user-facing findById",
  );
  const rejectedDebug = await readerSummaryArtifacts.findRejectedDebugById({
    tenantId: tenant,
    workspaceId: workspace,
    readerSummaryId: "00000000-0000-7000-8000-000000000b03",
  });
  assert(
    rejectedDebug?.reasonCodes.includes("top_read_ineligible_source") === true,
    "rejected reader summary debug view must expose rejection reason codes",
  );
  assert(
    rejectedDebug?.violations.some(
      (violation) =>
        violation.code === "top_read_ineligible_source" &&
        violation.citationId === "reader-citation-1",
    ) === true,
    "rejected reader summary debug view must expose structured rejection violations",
  );
  await readerSummaryArtifacts.save(
    makeReaderSummaryArtifactWithoutContent(
      "00000000-0000-7000-8000-000000000b04",
      {
        headline: "Rejected reader summary without content",
      },
    ),
    {
      ...verifiedGitHubProjectionOptions(),
      publicationDecision: {
        status: "rejected",
        qualityPassed: false,
        canonicalScore: 0.2,
        shadow: {
          mode: "shadow",
          policyVersion: "reader_summary_publication_shadow_v1",
          riskScore: 0,
          signals: [],
        },
        reasonCodes: ["top_read_ineligible_source"],
        reasons: ["Top read references ineligible evidence."],
        findings: [
          {
            code: "top_read_ineligible_source",
            reason: "Top read references ineligible evidence.",
            topReadTitle: "Reader source signal",
            citationId: "reader-citation-1",
            feedItemId: "reader-feed-1",
          },
        ],
      },
    },
  );
  const rejectedDebugWithoutContent =
    await readerSummaryArtifacts.findRejectedDebugById({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryId: "00000000-0000-7000-8000-000000000b04",
    });
  assert(
    rejectedDebugWithoutContent?.topReads[0]?.title ===
      "Reader source signal" &&
      rejectedDebugWithoutContent.topReads[0]?.canonicalUrl ===
        "https://example.test/reader-summary",
    "rejected reader summary debug view must fallback to topStories when content is absent",
  );

  const qualityRejectedReaderSummaryJob = ReaderSummaryJob.request({
    id: "00000000-0000-7000-8000-000000000c01",
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period: makeReaderSummaryArtifact(
      "00000000-0000-7000-8000-000000000c02",
      { headline: "Reader summary job period source" },
    ).toSnapshot().period,
    idempotencyKey: "reader-summary-job:quality-rejected",
    requestedAt: clock.now(),
  })
    .start({ startedAt: new Date("2026-06-08T00:05:00.000Z") })
    .rejectForQuality({
      rejectedAt: new Date("2026-06-08T00:06:00.000Z"),
      readerSummaryId: "00000000-0000-7000-8000-000000000b03",
      failureReason: "Reader summary artifact failed pre-publish quality gate.",
    });
  await readerSummaryJobs.save(qualityRejectedReaderSummaryJob);
  assert(
    prisma.readerSummaryJobStatus(
      "00000000-0000-7000-8000-000000000c01",
    ) === "REJECTED",
    "quality rejected reader summary job must persist as REJECTED",
  );
  const retryClaim = await readerSummaryJobs.claimForExecution({
    tenantId: tenant,
    workspaceId: workspace,
    readerSummaryJobId: "00000000-0000-7000-8000-000000000c01",
    requestedAt: new Date("2026-06-08T00:07:00.000Z"),
    startedAt: new Date("2026-06-08T00:07:00.000Z"),
  });
  assert(
    retryClaim === null,
    "quality rejected reader summary job must not be retry-claimable",
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
      selectedPosts: [
        readerSummaryTopRead(),
        ...readerSummaryGitHubSelectedPosts(),
      ],
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
      ...readerSummaryGitHubCitations(),
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

const verifiedGitHubProjectionOptions = () => {
  const projectionCheckedAt = new Date("2026-06-08T12:00:00.000Z");
  return {
    githubProjectionAudit: {
      schemaVersion: "reader_summary.github_projection.v1" as const,
      status: "verified" as const,
      requestedUtcDay: "2026-06-08",
      pageCount: 1,
      scannedItemCount: 10,
      eligibleBindingIds: ["github-reader-summary-smoke-binding"],
      observedThrough: projectionCheckedAt.toISOString(),
      projectionCheckedAt: projectionCheckedAt.toISOString(),
      telemetry: {
        github_projection_collection_delay_ms: 0,
        collectionGraceMs: readerSummaryGitHubProjectionCollectionGraceMs,
        warningThresholdMs:
          readerSummaryGitHubProjectionCollectionWarningThresholdMs,
        qualitySignal: "within_grace" as const,
      },
      bindings: readerSummaryGitHubCitations().map((citation, index) => ({
        selectedPostIndex: index,
        rank: index + 1,
        citationId: citation.citationId,
        feedItemId: citation.feedItemId,
        sourceItemId: citation.sourceItemId,
        sourceBindingId: "github-reader-summary-smoke-binding",
        providerKey: "github-trending-page",
        metadataKind: "github_trending_page_repository",
        scanJobId: "github-reader-summary-smoke-scan",
        repositoryIdentity: `smoke/repository-${index + 1}`,
        canonicalUrl: citation.canonicalUrl,
        starsGained: 200 + index + 1,
        fetchStartedAt: projectionCheckedAt.toISOString(),
        publishedAt: projectionCheckedAt.toISOString(),
        checkedAt: projectionCheckedAt.toISOString(),
        observedAt: projectionCheckedAt.toISOString(),
        sourceContentHash: "a".repeat(64),
        sourceProviderContentHash: "b".repeat(64),
      })),
      violationCodes: [],
      reasons: [],
    },
  };
};

const readerSummaryGitHubCitations = () =>
  Array.from({ length: 10 }, (_, index) => ({
    citationId: `github-reader-summary-smoke-citation-${index + 1}`,
    feedItemId: `github-reader-summary-smoke-feed-${index + 1}`,
    sourceItemId: `github-reader-summary-smoke-source-${index + 1}`,
    providerKey: "github-trending-page",
    field: "canonicalUrl" as const,
    canonicalUrl: `https://github.com/smoke/repository-${index + 1}`,
  }));

const readerSummaryGitHubSelectedPosts = () =>
  readerSummaryGitHubCitations().map((citation, index) => ({
    storyClusterId: `github-reader-summary-smoke-cluster-${index + 1}`,
    title: `smoke/repository-${index + 1}`,
    providerKey: "github-trending-page",
    providerName: "GitHub Trending",
    primaryActionKind: "watch_repository" as const,
    reason: "The repository is present on the canonical daily board.",
    matchedInterestIds: ["interest-ai"],
    matchedRules: ["github-trending"],
    signalScore: 0,
    confidence: {
      level: "medium" as const,
      score: 0.7,
      rationale: "The canonical board was durably verified.",
    },
    confirmedProviderKeys: ["github-trending-page"],
    providerMetrics: [
      {
        label: "GitHub Trending today",
        value: `#${index + 1}, +${200 + index + 1} stars today`,
      },
    ],
    whyImportant: ["The repository has visible daily momentum."],
    whyNow: "It appears in today's GitHub Trending board.",
    canonicalUrl: citation.canonicalUrl,
    citationIds: [citation.citationId],
    previewMedia: undefined,
  }));

const makeReaderSummaryArtifactWithoutContent = (
  readerSummaryId: string,
  overrides: { readonly headline: string },
): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    ...makeReaderSummaryArtifact(readerSummaryId, overrides).toSnapshot(),
    content: undefined,
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
