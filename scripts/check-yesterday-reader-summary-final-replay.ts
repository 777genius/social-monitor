import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { defaultPostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import { PrismaFeedConnection } from "../libs/feed/adapters/persistence/prisma/prisma-feed-connection";
import { PrismaFeedItemReadRepository } from "../libs/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { InMemoryUserRelevanceProfileRepository } from "../libs/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "../libs/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { RelevanceReaderSummaryEvidenceSelector } from "../libs/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { ReaderSummaryPromotionMetricsRecorder } from "../libs/summary/adapters/metrics/reader-summary-promotion-metrics.recorder";
import { StoryRankingMetricsRecorder } from "../libs/summary/adapters/metrics/story-ranking-metrics.recorder";
import { InMemorySummaryEventPublisher } from "../libs/summary/adapters/messaging/in-memory-summary-event-publisher";
import { DeterministicReaderSummaryModelAdapter } from "../libs/summary/adapters/model/deterministic-reader-summary-model.adapter";
import { InMemoryReaderSummaryArtifactRepository } from "../libs/summary/adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "../libs/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPublication } from "../libs/summary/adapters/persistence/in-memory-reader-summary-publication";
import { InMemoryReaderSummaryPolicyRepository } from "../libs/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import {
  buildReaderSummaryPeriod,
  ReaderSummaryPolicy,
  type ReaderSummaryContent,
} from "../libs/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "../libs/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { readerSummaryPromotionControl } from "../libs/summary/features/execute-reader-summary-job/reader-summary-promotion-control";
import { RequestReaderSummaryUseCase } from "../libs/summary/features/request-reader-summary/request-reader-summary.use-case";
import {
  presentReaderSummaryArtifact,
  type ReaderSummaryContentView,
} from "../libs/summary/features/shared/reader-summary-artifact-presenter";
import type {
  EnqueueReaderSummaryJobCommand,
  ReaderSummaryJobQueuePort,
  SummaryQuotaPort,
} from "../libs/summary/ports";
import {
  collectionDateOptionOrDefault,
  type CollectionIntegrityStatus,
  fingerprint,
  message,
  nextDate,
  normalizeLineEndings,
  noRawSecretFragments,
  readCollectionIntegrityStatus,
  readDominantFeedScope,
  roundMetric,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import {
  FixedClock,
  type IdGenerator,
  ok,
} from "@social-monitor/shared-kernel";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";

type ProviderCount = {
  readonly providerKey: string;
  readonly count: number;
};

type Report = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "yesterday-reader-summary-final-replay-v1";
  readonly collectionDate: string;
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly replayTarget: "workspace-reader-summary-final-text";
    readonly modelProvider: "deterministic-local";
    readonly rawPostTextPersistedInReport: false;
    readonly finalSummaryTextPersistedInReport: false;
  };
  readonly inputs: {
    readonly period: {
      readonly startedAt: string;
      readonly endedAt: string;
      readonly timezone: "UTC";
    };
    readonly maxEvidenceItems: number;
    readonly maxStories: number;
  };
  readonly collectionIntegrity: CollectionIntegrityStatus;
  readonly replay: {
    readonly tenantFingerprint: string;
    readonly workspaceFingerprint: string;
    readonly readerSummaryIdFingerprint?: string;
    readonly requestStatus: string;
    readonly executionStatus: string;
    readonly queuedCommandCount: number;
    readonly publishedEventCount: number;
    readonly selectedFeedItemCount: number;
    readonly storyClusterCount: number;
    readonly topReadCount: number;
    readonly citationCount: number;
    readonly providerCount: number;
    readonly sourceMixProviderCounts: readonly ProviderCount[];
    readonly topReadProviderCounts: readonly ProviderCount[];
    readonly primarySourceMixCounts: Record<string, number>;
    readonly primaryTopReadCounts: Record<string, number>;
    readonly citedTopReadCount: number;
    readonly canonicalUrlTopReadCount: number;
    readonly citationCanonicalUrlCount: number;
    readonly minTopReadSignalScore: number;
    readonly averageTopReadSignalScore: number;
    readonly mediumOrHighConfidenceTopReadCount: number;
    readonly lowConfidenceTopReadCount: number;
  };
  readonly finalText: {
    readonly textFingerprint: string;
    readonly headlineChars: number;
    readonly oneLineTakeawayChars: number;
    readonly bulletCount: number;
    readonly openQuestionCount: number;
    readonly nextActionCount: number;
    readonly riskCount: number;
    readonly averageTopReadTitleChars: number;
    readonly averageTopReadReasonChars: number;
    readonly averageTopReadWhyNowChars: number;
    readonly technicalLeakCount: number;
  };
  readonly qualityState: {
    readonly status: ReaderSummaryContent["qualityState"]["status"];
    readonly flagCount: number;
    readonly warningCount: number;
    readonly isSingleSource: boolean;
    readonly confidenceLevel: "none" | "low" | "medium" | "high";
    readonly confidenceScore: number;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

const { collectionDate } = collectionDateOptionOrDefault("2026-07-03");
const update = process.argv.includes("--update");
const allowDirtyCollection = process.argv.includes("--allow-dirty-collection");
const outputPath = "ops/evals/yesterday-reader-summary-final-replay.v1.json";
const maxEvidenceItems = 40;
const maxStories = 10;
const primarySources = ["reddit", "x-twitter"];
const localDatabaseUrl = yesterdaySocialQualityDatabaseUrl();
const clock = new FixedClock(new Date(`${collectionDate}T23:59:59.000Z`));
const technicalLeakFragments = [
  "feeditemid",
  "sourceitemid",
  "source-binding",
  "bodypreview",
  "story signal score",
  "base signal",
  "citation references",
  "undefined",
  "null",
];

void main();

async function main(): Promise<void> {
  const report = await tryBuildReport();

  if (report === undefined) {
    if (update) {
      throw new Error(
        "Local yesterday social data source is unavailable; cannot update final replay report.",
      );
    }
    validateExistingReport();
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Yesterday reader summary final replay gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:yesterday-reader-summary-final-replay -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:yesterday-reader-summary-final-replay -- --update`,
    );
  }

  console.log(
    `Yesterday reader summary final replay OK (${collectionDate}, workspace scope)`,
  );
}

async function tryBuildReport(): Promise<Report | undefined> {
  const scope = await readDominantFeedScope({
    databaseUrl: localDatabaseUrl,
    collectionDate,
  }).catch((error: unknown) => {
    console.warn(
      `Reader summary final replay scope unavailable: ${message(error)}`,
    );
    return undefined;
  });

  if (scope === undefined) {
    return undefined;
  }

  const connection = await PrismaFeedConnection.create(
    defaultPostgresRuntimePoolConfig(localDatabaseUrl, "admin-tool"),
  );

  try {
    const feedItems = new PrismaFeedItemReadRepository(connection);
    const jobs = new InMemoryReaderSummaryJobRepository();
    const artifacts = new InMemoryReaderSummaryArtifactRepository();
    const policies = new InMemoryReaderSummaryPolicyRepository();
    const queue = new CapturingReaderSummaryJobQueue();
    const events = new InMemorySummaryEventPublisher();
    const ids = new SequenceIdGenerator("reader-summary-final-replay");
    const period = buildReaderSummaryPeriod({
      cadence: "daily",
      startedAt: new Date(`${collectionDate}T00:00:00.000Z`),
      endedAt: new Date(nextDate(collectionDate)),
      timezone: "UTC",
    });

    await policies.save(
      ReaderSummaryPolicy.create({
        id: "reader-summary-final-replay-policy",
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        scope: { type: "workspace" },
        language: "auto",
        format: "executive_brief",
        tone: "analytical",
        maxStories,
        includeRisks: true,
        includeInterestHighlights: true,
        includeRepeatedSignals: true,
        dedupeStrategy: "canonical_url_then_title",
        customInstructions:
          "Build a concise reader-facing summary from cited evidence. Keep claims grounded and separate useful reads, risks and follow-up actions.",
        createdAt: clock.now(),
        updatedAt: clock.now(),
      }),
    );

    const request = await new RequestReaderSummaryUseCase(
      jobs,
      queue,
      new AllowingSummaryQuota(),
      ids,
      clock,
    ).execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      scope: { type: "workspace" },
      cadence: "daily",
      period,
      idempotencyKey: `yesterday-reader-summary-final-replay:${collectionDate}`,
      correlationId: `yesterday-reader-summary-final-replay:${collectionDate}`,
    });

    if (!request.ok) {
      throw request.error;
    }

    const rankFeedItems = new RankFeedItemsUseCase(
      feedItems,
      new InMemoryUserRelevanceProfileRepository(),
      clock,
    );
    const metrics = new InMemoryMetricsRecorder();
    const evidenceSelector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      feedItems,
      clock,
      new StoryRankingMetricsRecorder(metrics),
    );
    const execution = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      policies,
      evidenceSelector,
      new DeterministicReaderSummaryModelAdapter(),
      new InMemoryReaderSummaryPublication(jobs, artifacts, events),
      ids,
      clock,
      readerSummaryPromotionControl(
        new ReaderSummaryPromotionMetricsRecorder(metrics),
      ),
    ).execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      readerSummaryJobId: request.value.readerSummaryJobId,
      maxEvidenceItems,
    });

    if (!execution.ok) {
      throw execution.error;
    }
    if (execution.value.readerSummaryId === undefined) {
      throw new Error(
        "Reader summary final replay did not produce artifact id",
      );
    }

    const artifact = await artifacts.findById({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      readerSummaryId: execution.value.readerSummaryId,
    });
    if (artifact === null) {
      throw new Error("Reader summary final replay artifact was not persisted");
    }

    const view = presentReaderSummaryArtifact(artifact, {
      status: "fresh",
      checkedAt: clock.now(),
    });
    const content = view.content;
    const sourceMixProviderCounts = view.content.sourceMix.map((source) => ({
      providerKey: source.providerKey,
      count: source.itemCount,
    }));
    const topReadProviderCounts = countBy(
      content.topReads,
      (item) => item.providerKey,
    );
    const sourceMixCounts = Object.fromEntries(
      sourceMixProviderCounts.map((item) => [item.providerKey, item.count]),
    );
    const primarySourceMixCounts = Object.fromEntries(
      primarySources.map((source) => [source, sourceMixCounts[source] ?? 0]),
    );
    const topReadProviderCountMap = Object.fromEntries(
      topReadProviderCounts.map((item) => [item.providerKey, item.count]),
    );
    const primaryTopReadCounts = Object.fromEntries(
      primarySources.map((source) => [
        source,
        topReadProviderCountMap[source] ?? 0,
      ]),
    );
    const citationIds = new Set(view.citations.map((item) => item.citationId));
    const citedTopReadCount = content.topReads.filter(
      (item) =>
        item.citationIds.length > 0 &&
        item.citationIds.every((citationId) => citationIds.has(citationId)),
    ).length;
    const canonicalUrlTopReadCount = content.topReads.filter((item) =>
      /^https?:\/\//i.test(item.canonicalUrl ?? ""),
    ).length;
    const citationCanonicalUrlCount = view.citations.filter((item) =>
      /^https?:\/\//i.test(item.canonicalUrl ?? ""),
    ).length;
    const userFacingText = collectUserFacingText(content);
    const finalText = {
      textFingerprint: fingerprint(userFacingText.join("\n")),
      headlineChars: content.headline.trim().length,
      oneLineTakeawayChars: content.oneLineTakeaway.trim().length,
      bulletCount: content.bullets.length,
      openQuestionCount: content.openQuestions.length,
      nextActionCount: content.nextActions.length,
      riskCount: content.risks.length,
      averageTopReadTitleChars: roundMetric(
        average(content.topReads.map((item) => item.title.trim().length)),
      ),
      averageTopReadReasonChars: roundMetric(
        average(content.topReads.map((item) => item.reason.trim().length)),
      ),
      averageTopReadWhyNowChars: roundMetric(
        average(content.topReads.map((item) => item.whyNow.trim().length)),
      ),
      technicalLeakCount: countTechnicalLeaks(userFacingText),
    };
    const qualityState = {
      status: content.qualityState.status,
      flagCount: content.qualityState.flags.length,
      warningCount: content.qualityState.warnings.length,
      isSingleSource: content.qualityState.isSingleSource,
      confidenceLevel: view.confidence.level,
      confidenceScore: view.confidence.score,
    };
    const replay = {
      tenantFingerprint: fingerprint(scope.tenantId),
      workspaceFingerprint: fingerprint(scope.workspaceId),
      readerSummaryIdFingerprint: fingerprint(execution.value.readerSummaryId),
      requestStatus: request.value.status,
      executionStatus: execution.value.status,
      queuedCommandCount: queue.all().length,
      publishedEventCount: events.all().length,
      selectedFeedItemCount: view.coverage.selectedFeedItemCount,
      storyClusterCount: view.coverage.storyClusterCount,
      topReadCount: view.coverage.topReadCount,
      citationCount: view.coverage.citationCount,
      providerCount: view.coverage.providerCount,
      sourceMixProviderCounts,
      topReadProviderCounts,
      primarySourceMixCounts,
      primaryTopReadCounts,
      citedTopReadCount,
      canonicalUrlTopReadCount,
      citationCanonicalUrlCount,
      minTopReadSignalScore: roundMetric(
        Math.min(...content.topReads.map((item) => item.signalScore)),
      ),
      averageTopReadSignalScore: roundMetric(
        average(content.topReads.map((item) => item.signalScore)),
      ),
      mediumOrHighConfidenceTopReadCount: content.topReads.filter(
        (item) =>
          item.confidence.level === "medium" ||
          item.confidence.level === "high",
      ).length,
      lowConfidenceTopReadCount: content.topReads.filter(
        (item) => item.confidence.level === "low",
      ).length,
    };
    const collectionIntegrity = readCollectionIntegrityStatus(collectionDate);
    const qualityGates = {
      collectionIntegrityCleanForEval:
        collectionIntegrity.status === "clean" || allowDirtyCollection,
      requestCreatedJob: request.value.created === true,
      executionCompleted: execution.value.status === "completed",
      artifactPersisted: artifacts.all().length === 1,
      readyEventPublished: replay.publishedEventCount === 1,
      finalContentPresent: content.topReads.length > 0,
      summaryTextHasReadableStructure:
        finalText.headlineChars >= 12 &&
        finalText.headlineChars <= 180 &&
        finalText.oneLineTakeawayChars >= 40 &&
        finalText.oneLineTakeawayChars <= 500 &&
        finalText.bulletCount >= 1 &&
        finalText.bulletCount <= 5,
      topReadsAtLeastEight: replay.topReadCount >= 8,
      everyTopReadHasResolvedCitation:
        replay.citedTopReadCount === replay.topReadCount,
      everyTopReadHasCanonicalUrl:
        replay.canonicalUrlTopReadCount === replay.topReadCount,
      everyCitationHasCanonicalUrl:
        replay.citationCanonicalUrlCount === replay.citationCount,
      sourceMixHasAtLeastFourProviders: replay.providerCount >= 4,
      redditAndXTwitterInSourceMix: primarySources.every(
        (source) => (replay.primarySourceMixCounts[source] ?? 0) >= 1,
      ),
      redditAndXTwitterInTopReads: primarySources.every(
        (source) => (replay.primaryTopReadCounts[source] ?? 0) >= 1,
      ),
      topReadSignalsStayAboveRelevanceFloor:
        replay.minTopReadSignalScore >= 0.35 &&
        replay.averageTopReadSignalScore >= 0.65,
      lowConfidenceTopReadsAreExplicitlyFlagged:
        replay.lowConfidenceTopReadCount === 0 ||
        (qualityState.warningCount >= 1 &&
          finalText.openQuestionCount >= 1 &&
          finalText.riskCount >= 1),
      summaryIsNotSingleSource: qualityState.isSingleSource === false,
      modelConfidenceAtLeastMedium:
        qualityState.confidenceLevel === "medium" ||
        qualityState.confidenceLevel === "high",
      topReadsExplainWhyNow: content.topReads.every(
        (item) => item.whyNow.trim().length >= 12,
      ),
      topReadsHaveReaderReasons: content.topReads.every(
        (item) => item.reason.trim().length >= 12,
      ),
      openQuestionsAvailable: finalText.openQuestionCount >= 1,
      nextActionsAvailable: finalText.nextActionCount >= 1,
      noTechnicalLeakageInUserText: finalText.technicalLeakCount === 0,
      noRawSecretFragments: true,
    };
    const reportWithoutSecretGate = {
      schemaVersion: 1,
      artifactFormat: "yesterday-reader-summary-final-replay-v1",
      collectionDate,
      generatedBy: "npm run check:yesterday-reader-summary-final-replay",
      model: {
        liveNetwork: false,
        replayTarget: "workspace-reader-summary-final-text",
        modelProvider: "deterministic-local",
        rawPostTextPersistedInReport: false,
        finalSummaryTextPersistedInReport: false,
      },
      inputs: {
        period: {
          startedAt: period.startedAt.toISOString(),
          endedAt: period.endedAt.toISOString(),
          timezone: "UTC",
        },
        maxEvidenceItems,
        maxStories,
      },
      collectionIntegrity,
      replay,
      finalText,
      qualityState,
      qualityGates,
      blockingPassed: false,
    } satisfies Report;
    const finalQualityGates = {
      ...reportWithoutSecretGate.qualityGates,
      noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
    };

    return {
      ...reportWithoutSecretGate,
      qualityGates: finalQualityGates,
      blockingPassed: Object.values(finalQualityGates).every(Boolean),
    };
  } catch (error) {
    console.warn(
      `Yesterday reader summary final replay local source unavailable: ${message(error)}`,
    );
    return undefined;
  } finally {
    await connection.close().catch(() => undefined);
  }
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data source is unavailable.`,
    );
  }

  const report = JSON.parse(readFileSync(outputPath, "utf8")) as Report;
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "yesterday-reader-summary-final-replay-v1" &&
    report.blockingPassed === true &&
    report.replay.topReadCount >= 8 &&
    primarySources.every(
      (source) => (report.replay.primarySourceMixCounts[source] ?? 0) >= 1,
    ) &&
    primarySources.every(
      (source) => (report.replay.primaryTopReadCounts[source] ?? 0) >= 1,
    ) &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Yesterday reader summary final replay artifact OK (${report.collectionDate}; local source unavailable)`,
  );
}

function collectUserFacingText(
  content: ReaderSummaryContentView,
): readonly string[] {
  return [
    content.headline,
    content.oneLineTakeaway,
    ...content.bullets,
    ...content.topReads.flatMap((item) => [
      item.title,
      item.reason,
      item.whyNow,
      ...item.whyImportant,
    ]),
    ...content.interestSections.flatMap((section) => [
      section.title,
      section.insight,
    ]),
    ...content.openQuestions,
    ...content.risks,
    ...content.nextActions.flatMap((action) => [action.label, action.reason]),
  ].filter((value) => value.trim().length > 0);
}

function countTechnicalLeaks(values: readonly string[]): number {
  const text = values.join("\n").toLowerCase();

  return technicalLeakFragments.filter((fragment) => text.includes(fragment))
    .length;
}

function countBy<TValue>(
  values: readonly TValue[],
  keyOf: (value: TValue) => string,
): readonly ProviderCount[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    const key = keyOf(value).trim();
    if (key.length === 0) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([providerKey, count]) => ({ providerKey, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.providerKey.localeCompare(right.providerKey),
    );
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

class CapturingReaderSummaryJobQueue implements ReaderSummaryJobQueuePort {
  private readonly commands: EnqueueReaderSummaryJobCommand[] = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(command: EnqueueReaderSummaryJobCommand): Promise<void> {
    this.commands.push(command);
  }

  all(): readonly EnqueueReaderSummaryJobCommand[] {
    return [...this.commands];
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort["reserveSummaryJob"]> {
    return ok({
      remaining: 999,
      resetAt: new Date(
        clock.now().getTime() + 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
  }
}

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  constructor(private readonly prefix: string) {}

  generate(): string {
    const id = `${this.prefix}-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}
