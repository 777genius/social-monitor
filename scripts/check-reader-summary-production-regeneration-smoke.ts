import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Pool } from "pg";

import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { defaultPostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import {
  FixedClock,
  type IdGenerator,
  ok,
} from "@social-monitor/shared-kernel";

import { PrismaFeedConnection } from "../libs/feed/adapters/persistence/prisma/prisma-feed-connection";
import { PrismaFeedItemReadRepository } from "../libs/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { InMemoryUserRelevanceProfileRepository } from "../libs/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "../libs/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { RelevanceReaderSummaryEvidenceSelector } from "../libs/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { StoryRankingMetricsRecorder } from "../libs/summary/adapters/metrics/story-ranking-metrics.recorder";
import { InMemorySummaryEventPublisher } from "../libs/summary/adapters/messaging/in-memory-summary-event-publisher";
import { DeterministicReaderSummaryModelAdapter } from "../libs/summary/adapters/model/deterministic-reader-summary-model.adapter";
import { InMemoryReaderSummaryArtifactRepository } from "../libs/summary/adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "../libs/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPolicyRepository } from "../libs/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import {
  readerSummaryArtifactFromPrisma,
} from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import {
  buildReaderSummaryPeriod,
  ReaderSummaryPolicy,
} from "../libs/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "../libs/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { RequestReaderSummaryUseCase } from "../libs/summary/features/request-reader-summary/request-reader-summary.use-case";
import {
  presentReaderSummaryArtifact,
  type ReaderSummaryArtifactView,
  type ReaderSummaryContentView,
} from "../libs/summary/features/shared/reader-summary-artifact-presenter";
import type {
  EnqueueReaderSummaryJobCommand,
  ReaderSummaryJobQueuePort,
  SummaryQuotaPort,
} from "../libs/summary/ports";
import {
  type CollectionIntegrityStatus,
  fingerprint,
  message,
  noRawSecretFragments,
  normalizeLineEndings,
  readCollectionIntegrityStatus,
  readOption,
  roundMetric,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import {
  countBy,
  dayEnd,
  dayStart,
  isDefined,
  isLocalDataSourceUnavailable,
  primaryCounts as primaryCountsForSources,
  type ProviderCount,
  providerSkew,
  readDominantReaderSummaryQualityScope,
  readLatestReaderSummaryArtifact,
  type ReaderSummaryQualityScope as Scope,
} from "./lib/reader-summary-quality-eval-support";

type SmokeReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-production-regeneration-smoke-v1";
  readonly collectionDate: string;
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly regenerationModel: "deterministic-local";
    readonly writesProductionData: false;
    readonly rawPostTextPersistedInReport: false;
    readonly finalSummaryTextPersistedInReport: false;
  };
  readonly collectionIntegrity: CollectionIntegrityStatus;
  readonly inputs: {
    readonly period: {
      readonly startedAt: string;
      readonly endedAt: string;
      readonly timezone: "UTC";
    };
    readonly maxEvidenceItems: number;
    readonly maxStories: number;
    readonly scope: {
      readonly tenantFingerprint: string;
      readonly workspaceFingerprint: string;
    };
  };
  readonly oldArtifact: SummaryMetrics;
  readonly regeneratedArtifact: SummaryMetrics & {
    readonly requestStatus: string;
    readonly executionStatus: string;
    readonly queuedCommandCount: number;
    readonly publishedEventCount: number;
  };
  readonly comparison: {
    readonly primaryTopReadsDelta: Record<string, number>;
    readonly topReadProviderSkewDelta: number;
    readonly claimCountDelta: number;
    readonly technicalLeakDelta: number;
    readonly confidenceTruthful: boolean;
    readonly textNotWorse: boolean;
    readonly providerMixNotWorse: boolean;
    readonly regeneratedPrimaryTopReadsBalanced: boolean;
    readonly topReadDiversityNotWorse: boolean;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

type SummaryMetrics = {
  readonly artifactFingerprint: string;
  readonly confidenceLevel: "none" | "low" | "medium" | "high";
  readonly confidenceScore: number;
  readonly selectedFeedItemCount: number;
  readonly storyClusterCount: number;
  readonly crossSourceClusterRate: number;
  readonly topReadCount: number;
  readonly citationCount: number;
  readonly providerCount: number;
  readonly topReadProviderCounts: readonly ProviderCount[];
  readonly primaryTopReadCounts: Record<string, number>;
  readonly topReadProviderSkew: number;
  readonly claimCount: number;
  readonly claimQualityPassed: boolean;
  readonly technicalLeakCount: number;
  readonly textFingerprint: string;
  readonly headlineChars: number;
  readonly oneLineTakeawayChars: number;
  readonly bulletCount: number;
  readonly openQuestionCount: number;
  readonly nextActionCount: number;
  readonly riskCount: number;
};

const outputPath =
  "ops/evals/reader-summary-production-regeneration-smoke.v1.json";
const databaseUrl = yesterdaySocialQualityDatabaseUrl();
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const maxEvidenceItems = 40;
const maxStories = 10;
const primarySources = ["reddit", "x-twitter"] as const;
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
  if (artifactOnly) {
    validateExistingReport();
    return;
  }

  const report = await tryBuildReport();

  if (report === undefined) {
    if (update) {
      throw new Error(
        "Local reader summary regeneration source is unavailable; cannot update smoke report.",
      );
    }
    validateExistingReport();
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Reader summary production regeneration smoke failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:reader-summary-production-regeneration-smoke -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:reader-summary-production-regeneration-smoke -- --update`,
    );
  }

  console.log(
    `Reader summary production regeneration smoke OK (${report.collectionDate})`,
  );
}

async function tryBuildReport(): Promise<SmokeReport | undefined> {
  const pool = new Pool({
    connectionString: databaseUrl,
    min: 0,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const collectionDate = readOption("--date") ?? (await latestCleanDate(pool));
    const collectionIntegrity = readCollectionIntegrityStatus(collectionDate);
    const scope = await readDominantReaderSummaryQualityScope(
      pool,
      collectionDate,
    );
    const persistedRecord = await readLatestReaderSummaryArtifact(
      pool,
      scope,
      collectionDate,
    );
    if (persistedRecord === null) {
      throw new Error(`No persisted reader summary artifact for ${collectionDate}`);
    }

    const oldView = presentReaderSummaryArtifact(
      readerSummaryArtifactFromPrisma(persistedRecord),
      { status: "fresh", checkedAt: new Date() },
    );
    const regenerated = await regenerateSummary(scope, collectionDate);
    const oldArtifact = metricsForView(oldView, fingerprint(persistedRecord.id));
    const regeneratedArtifact = {
      ...metricsForView(
        regenerated.view,
        fingerprint(regenerated.readerSummaryId),
      ),
      requestStatus: regenerated.requestStatus,
      executionStatus: regenerated.executionStatus,
      queuedCommandCount: regenerated.queuedCommandCount,
      publishedEventCount: regenerated.publishedEventCount,
    };
    const comparison = compareMetrics(oldArtifact, regeneratedArtifact);
    const reportWithoutSecretGate = {
      schemaVersion: 1,
      artifactFormat: "reader-summary-production-regeneration-smoke-v1",
      collectionDate,
      generatedBy: "npm run check:reader-summary-production-regeneration-smoke",
      model: {
        liveNetwork: false,
        regenerationModel: "deterministic-local",
        writesProductionData: false,
        rawPostTextPersistedInReport: false,
        finalSummaryTextPersistedInReport: false,
      },
      collectionIntegrity,
      inputs: {
        period: {
          startedAt: dayStart(collectionDate),
          endedAt: dayEnd(collectionDate),
          timezone: "UTC",
        },
        maxEvidenceItems,
        maxStories,
        scope: {
          tenantFingerprint: fingerprint(String(scope.tenantId)),
          workspaceFingerprint: fingerprint(String(scope.workspaceId)),
        },
      },
      oldArtifact,
      regeneratedArtifact,
      comparison,
      qualityGates: {
        collectionIntegrityCleanForEval: collectionIntegrity.status === "clean",
        oldArtifactPresent: true,
        regenerationCompleted:
          regeneratedArtifact.executionStatus === "completed",
        regenerationDidNotWriteProductionData: true,
        providerMixNotWorse: comparison.providerMixNotWorse,
        regeneratedPrimaryTopReadsBalanced:
          comparison.regeneratedPrimaryTopReadsBalanced,
        topReadDiversityNotWorse: comparison.topReadDiversityNotWorse,
        claimQualityImprovedOrPassed:
          regeneratedArtifact.claimQualityPassed &&
          regeneratedArtifact.claimCount >= oldArtifact.claimCount,
        confidenceTruthful: comparison.confidenceTruthful,
        textNotWorse: comparison.textNotWorse,
        noTechnicalLeakRegression:
          regeneratedArtifact.technicalLeakCount <= oldArtifact.technicalLeakCount,
        noRawSecretFragments: true,
      },
      blockingPassed: false,
    } satisfies SmokeReport;
    const qualityGates = {
      ...reportWithoutSecretGate.qualityGates,
      noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
    };

    return {
      ...reportWithoutSecretGate,
      qualityGates,
      blockingPassed: Object.values(qualityGates).every(Boolean),
    };
  } catch (error) {
    if (!isLocalDataSourceUnavailable(error)) {
      throw error;
    }
    console.warn(
      `Reader summary production regeneration local source unavailable: ${message(error)}`,
    );
    return undefined;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function latestCleanDate(pool: Pool): Promise<string> {
  const result = await pool.query<{ readonly collectionDate: string }>(
    `
      select to_char(observed_at at time zone 'UTC', 'YYYY-MM-DD') as "collectionDate"
      from feed_items
      group by 1
      order by 1 desc
    `,
  );
  const cleanDate = result.rows
    .map((row) => row.collectionDate)
    .find((collectionDate) => readCollectionIntegrityStatus(collectionDate).status === "clean");

  if (cleanDate === undefined) {
    throw new Error("No clean collection date found for regeneration smoke");
  }

  return cleanDate;
}

async function regenerateSummary(
  scope: Scope,
  collectionDate: string,
): Promise<{
  readonly view: ReaderSummaryArtifactView;
  readonly readerSummaryId: string;
  readonly requestStatus: string;
  readonly executionStatus: string;
  readonly queuedCommandCount: number;
  readonly publishedEventCount: number;
}> {
  const connection = await PrismaFeedConnection.create(
    defaultPostgresRuntimePoolConfig(databaseUrl, "admin-tool"),
  );
  const clock = new FixedClock(new Date(`${collectionDate}T23:59:59.000Z`));

  try {
    const feedItems = new PrismaFeedItemReadRepository(connection);
    const jobs = new InMemoryReaderSummaryJobRepository();
    const artifacts = new InMemoryReaderSummaryArtifactRepository();
    const policies = new InMemoryReaderSummaryPolicyRepository();
    const queue = new CapturingReaderSummaryJobQueue();
    const events = new InMemorySummaryEventPublisher();
    const ids = new SequenceIdGenerator("reader-summary-regeneration-smoke");
    const period = buildReaderSummaryPeriod({
      cadence: "daily",
      startedAt: new Date(dayStart(collectionDate)),
      endedAt: new Date(dayEnd(collectionDate)),
      timezone: "UTC",
    });

    await policies.save(
      ReaderSummaryPolicy.create({
        id: "reader-summary-regeneration-smoke-policy",
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
      new AllowingSummaryQuota(clock),
      ids,
      clock,
    ).execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      scope: { type: "workspace" },
      cadence: "daily",
      period,
      idempotencyKey: `reader-summary-regeneration-smoke:${collectionDate}`,
      correlationId: `reader-summary-regeneration-smoke:${collectionDate}`,
    });
    if (!request.ok) {
      throw request.error;
    }

    const rankFeedItems = new RankFeedItemsUseCase(
      feedItems,
      new InMemoryUserRelevanceProfileRepository(),
      clock,
    );
    const evidenceSelector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      feedItems,
      clock,
      new StoryRankingMetricsRecorder(new InMemoryMetricsRecorder()),
    );
    const execution = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      policies,
      evidenceSelector,
      new DeterministicReaderSummaryModelAdapter(),
      events,
      ids,
      clock,
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
      throw new Error("Regeneration smoke did not produce artifact id");
    }

    const artifact = await artifacts.findById({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      readerSummaryId: execution.value.readerSummaryId,
    });
    if (artifact === null) {
      throw new Error("Regeneration smoke artifact was not persisted in memory");
    }

    return {
      view: presentReaderSummaryArtifact(artifact, {
        status: "fresh",
        checkedAt: clock.now(),
      }),
      readerSummaryId: execution.value.readerSummaryId,
      requestStatus: request.value.status,
      executionStatus: execution.value.status,
      queuedCommandCount: queue.all().length,
      publishedEventCount: events.all().length,
    };
  } finally {
    await connection.close().catch(() => undefined);
  }
}

function metricsForView(
  view: ReaderSummaryArtifactView,
  artifactFingerprint: string,
): SummaryMetrics {
  const topReadProviderCounts = countBy(
    view.content.topReads,
    (item) => item.providerKey,
  );
  const topReadProviderCountMap = Object.fromEntries(
    topReadProviderCounts.map((item) => [item.providerKey, item.count]),
  );
  const userFacingText = collectUserFacingText(view.content);

  return {
    artifactFingerprint,
    confidenceLevel: view.confidence.level,
    confidenceScore: view.confidence.score,
    selectedFeedItemCount: view.coverage.selectedFeedItemCount,
    storyClusterCount: view.coverage.storyClusterCount,
    crossSourceClusterRate:
      view.coverage.storyClusterCount === 0
        ? 0
        : roundMetric(
            view.coverage.crossSourceClusterCount /
              view.coverage.storyClusterCount,
          ),
    topReadCount: view.content.topReads.length,
    citationCount: view.citations.length,
    providerCount: view.coverage.providerCount,
    topReadProviderCounts,
    primaryTopReadCounts: primaryCounts(topReadProviderCountMap),
    topReadProviderSkew: providerSkew(
      topReadProviderCounts.map((item) => item.count),
    ),
    claimCount: view.content.claimBoard.length,
    claimQualityPassed: claimQualityPassed(view),
    technicalLeakCount: countTechnicalLeaks(userFacingText),
    textFingerprint: fingerprint(userFacingText.join("\n")),
    headlineChars: view.content.headline.trim().length,
    oneLineTakeawayChars: view.content.oneLineTakeaway.trim().length,
    bulletCount: view.content.bullets.length,
    openQuestionCount: view.content.openQuestions.length,
    nextActionCount: view.content.nextActions.length,
    riskCount: view.content.risks.length,
  };
}

function compareMetrics(
  oldArtifact: SummaryMetrics,
  regeneratedArtifact: SummaryMetrics,
): SmokeReport["comparison"] {
  const primaryTopReadsDelta = Object.fromEntries(
    primarySources.map((providerKey) => [
      providerKey,
      (regeneratedArtifact.primaryTopReadCounts[providerKey] ?? 0) -
        (oldArtifact.primaryTopReadCounts[providerKey] ?? 0),
    ]),
  );
  const topReadProviderSkewDelta = roundMetric(
    regeneratedArtifact.topReadProviderSkew - oldArtifact.topReadProviderSkew,
  );
  const confidenceTruthful =
    regeneratedArtifact.confidenceLevel !== "high" ||
    regeneratedArtifact.crossSourceClusterRate > 0 ||
    regeneratedArtifact.riskCount > 0 ||
    regeneratedArtifact.openQuestionCount > 0;
  const textNotWorse =
    regeneratedArtifact.headlineChars >= 12 &&
    regeneratedArtifact.headlineChars <= 180 &&
    regeneratedArtifact.oneLineTakeawayChars >= 40 &&
    regeneratedArtifact.oneLineTakeawayChars <= 500 &&
    regeneratedArtifact.bulletCount >= 1 &&
    regeneratedArtifact.bulletCount <= 5 &&
    regeneratedArtifact.openQuestionCount >= 1 &&
    regeneratedArtifact.nextActionCount >= 1;
  const providerMixNotWorse = primarySources.every(
    (providerKey) =>
      (regeneratedArtifact.primaryTopReadCounts[providerKey] ?? 0) >=
      Math.min(2, oldArtifact.primaryTopReadCounts[providerKey] ?? 0),
  );
  const regeneratedPrimaryTopReadsBalanced = primarySources.every(
    (providerKey) =>
      (regeneratedArtifact.primaryTopReadCounts[providerKey] ?? 0) >= 2,
  );

  return {
    primaryTopReadsDelta,
    topReadProviderSkewDelta,
    claimCountDelta: regeneratedArtifact.claimCount - oldArtifact.claimCount,
    technicalLeakDelta:
      regeneratedArtifact.technicalLeakCount - oldArtifact.technicalLeakCount,
    confidenceTruthful,
    textNotWorse,
    providerMixNotWorse,
    regeneratedPrimaryTopReadsBalanced,
    topReadDiversityNotWorse:
      regeneratedArtifact.topReadProviderSkew <= oldArtifact.topReadProviderSkew,
  };
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data source is unavailable.`,
    );
  }

  const report = JSON.parse(readFileSync(outputPath, "utf8")) as SmokeReport;
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "reader-summary-production-regeneration-smoke-v1" &&
    report.generatedBy ===
      "npm run check:reader-summary-production-regeneration-smoke" &&
    report.model.liveNetwork === false &&
    report.model.writesProductionData === false &&
    report.model.rawPostTextPersistedInReport === false &&
    report.model.finalSummaryTextPersistedInReport === false &&
    report.blockingPassed === true &&
    report.qualityGates.noRawSecretFragments === true &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Reader summary production regeneration smoke artifact OK (${report.collectionDate})`,
  );
}

function claimQualityPassed(view: ReaderSummaryArtifactView): boolean {
  const citationProviderById = new Map(
    view.citations.map((citation) => [citation.citationId, citation.providerKey]),
  );
  if (view.content.topReads.length > 0 && view.content.claimBoard.length === 0) {
    return false;
  }

  return view.content.claimBoard.every((claim) => {
    const evidenceProviderKeys = new Set(
      [
        ...claim.evidence.map((item) => item.providerKey),
        ...claim.citationIds
          .map((citationId) => citationProviderById.get(citationId))
          .filter(isDefined),
      ].map((providerKey) => providerKey.trim().toLowerCase()),
    );
    const hasRisk = claim.risks.length > 0;
    const hasEnoughEvidence = claim.evidence.length >= 2 || hasRisk;
    const singleSourceConfident =
      evidenceProviderKeys.size <= 1 &&
      claim.confidence.level === "high" &&
      !hasRisk;
    const socialOnlyConfident =
      evidenceProviderKeys.size > 0 &&
      [...evidenceProviderKeys].every((providerKey) =>
        primarySources.includes(providerKey as (typeof primarySources)[number]),
      ) &&
      claim.confidence.level === "high" &&
      !hasRisk;

    return hasEnoughEvidence && !singleSourceConfident && !socialOnlyConfident;
  });
}

function collectUserFacingText(
  content: ReaderSummaryContentView,
): readonly string[] {
  return [
    content.headline,
    content.oneLineTakeaway,
    ...content.bullets,
    ...content.claimBoard.flatMap((claim) => [
      claim.claim,
      ...claim.risks.map((risk) => risk.description),
    ]),
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

function primaryCounts(counts: Record<string, number>): Record<string, number> {
  return primaryCountsForSources(primarySources, counts);
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
  constructor(private readonly clock: FixedClock) {}

  async reserveSummaryJob(): ReturnType<SummaryQuotaPort["reserveSummaryJob"]> {
    return ok({
      remaining: 999,
      resetAt: new Date(
        this.clock.now().getTime() + 24 * 60 * 60 * 1000,
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
