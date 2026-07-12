import {
  feedSignalBaselineSampleFromItem,
} from "@social-monitor/feed/domain";
import { feedItemFromPrisma } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-records";
import type {
  PrismaSourceEngagementClient,
  PrismaSourceEngagementSnapshotRecord,
  PrismaSourceEngagementTransactionClient,
} from "./prisma-source-engagement-client";
import {
  engagementMetricsHaveRegression,
  engagementObservationBucketStartedAt,
  nextEngagementObservationDueAt,
  peakEngagementMetrics,
  sourceMetadataWithoutEngagementMetrics,
  type SourceEngagementMetrics,
} from "@social-monitor/ingestion/domain";
import type {
  ProjectSourceEngagementCommand,
  ProjectSourceEngagementResult,
  SourceEngagementProjectionPort,
  SourceEngagementSample,
} from "@social-monitor/ingestion/ports";
import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import type {
  IdGenerator,
  JsonObject,
  JsonValue,
} from "@social-monitor/shared-kernel";
import { normalizeJsonObject } from "@social-monitor/shared-kernel";

export class PrismaSourceEngagementProjectionAdapter
  implements SourceEngagementProjectionPort
{
  private readonly lastRetentionPurgeAtByScope = new Map<string, Date>();

  constructor(
    private readonly prisma: PrismaSourceEngagementClient,
    private readonly ids: IdGenerator,
  ) {}

  async project(
    command: ProjectSourceEngagementCommand,
  ): Promise<ProjectSourceEngagementResult> {
    if (command.samples.length === 0) {
      return {
        ...emptyResult(),
        ...(await this.purgeRetentionIfDue(command)),
      };
    }

    let result = emptyResult();
    const orderedSamples = [...command.samples].sort((left, right) =>
      left.externalId.localeCompare(right.externalId),
    );
    for (const samples of chunks(orderedSamples, 20)) {
      const chunkResult = await withPrismaWriteRetry(() =>
        this.prisma.$transaction(
          async (transaction) => {
            let current = emptyResult();
            for (const sample of samples) {
              current = addResults(
                current,
                await this.projectSample(transaction, command, sample),
              );
            }
            return current;
          },
          {
            maxWait: 5_000,
            timeout: 30_000,
            isolationLevel: "Serializable",
          },
        ),
      );
      result = addResults(result, chunkResult);
    }
    const retention = await this.purgeRetentionIfDue(command);
    return { ...result, ...retention };
  }

  private async purgeRetentionIfDue(
    command: ProjectSourceEngagementCommand,
  ): Promise<Pick<
    ProjectSourceEngagementResult,
    | "retentionObservationsPurged"
    | "retentionRollupsPurged"
    | "retentionPurgeDeferred"
  >> {
    const scopeKey = `${command.tenantId}:${command.workspaceId}`;
    const lastPurgeAt = this.lastRetentionPurgeAtByScope.get(scopeKey);
    if (
      lastPurgeAt !== undefined &&
      command.observedAt.getTime() - lastPurgeAt.getTime() < 86_400_000
    ) {
      return {};
    }
    try {
      const purged = await withPrismaWriteRetry(() =>
        this.prisma.$transaction(
          async (prisma) => {
            // Observations and their daily rollups are committed atomically in
            // projectSample, so an aged observation has verified rollup coverage.
            const observations =
              await prisma.sourceItemEngagementObservation.deleteMany({
                where: {
                  tenantId: command.tenantId,
                  workspaceId: command.workspaceId,
                  observedAt: {
                    lt: daysBefore(command.observedAt, 30),
                  },
                },
              });
            const rollups =
              await prisma.sourceItemEngagementDailyRollup.deleteMany({
                where: {
                  tenantId: command.tenantId,
                  workspaceId: command.workspaceId,
                  day: { lt: daysBefore(command.observedAt, 365) },
                },
              });
            return {
              retentionObservationsPurged: observations.count,
              retentionRollupsPurged: rollups.count,
            };
          },
          {
            maxWait: 5_000,
            timeout: 30_000,
            isolationLevel: "Serializable",
          },
        ),
      );
      this.lastRetentionPurgeAtByScope.set(scopeKey, command.observedAt);
      return purged;
    } catch {
      return { retentionPurgeDeferred: true };
    }
  }

  private async projectSample(
    prisma: PrismaSourceEngagementTransactionClient,
    command: ProjectSourceEngagementCommand,
    sample: SourceEngagementSample,
  ): Promise<ProjectSourceEngagementResult> {
    const sourceItem = await prisma.sourceItem.findFirst({
      where: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        providerKey: command.providerKey,
        providerItemId: sample.externalId,
      },
    });
    if (sourceItem === null) {
      throw new Error("Engagement sample source item was not persisted");
    }
    if (
      sample.sourceItemId !== undefined &&
      sample.sourceItemId !== sourceItem.id
    ) {
      throw new Error("Engagement sample source item binding mismatch");
    }

    const scopeKey = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceItemId: sourceItem.id,
    };
    const current = await prisma.sourceItemEngagementSnapshot.findUnique({
      where: { tenantId_workspaceId_sourceItemId: scopeKey },
    });
    const previousMetrics = metricsFromSnapshot(current);
    const isLatest =
      current === null ||
      command.observedAt.getTime() >= current.lastObservedAt.getTime();
    const metricsChanged =
      current === null || current.metricsHash !== sample.metricsFingerprint;
    const hasRegression =
      previousMetrics !== null &&
      engagementMetricsHaveRegression({
        previous: previousMetrics,
        current: sample.metrics,
      });
    const observationDue =
      current === null ||
      command.observedAt.getTime() >= current.nextObservationDueAt.getTime();
    const bucketStartedAt = engagementObservationBucketStartedAt(
      command.observedAt,
    );
    const observationResult = observationDue
      ? await prisma.sourceItemEngagementObservation.createMany({
          data: [
            {
              id: this.ids.generate(),
              ...scopeKey,
              providerKey: command.providerKey,
              sourceBindingId: command.sourceBindingId,
              scanJobId: command.scanJobId,
              ...metricColumns(sample.metrics),
              metricsHash: sample.metricsFingerprint,
              observedAt: command.observedAt,
              bucketStartedAt,
              reason: current === null ? "INITIAL" : "CADENCE",
              metricsChanged,
              hasRegression,
            },
          ],
          skipDuplicates: true,
        })
      : { count: 0 };

    if (observationResult.count === 1) {
      await this.updateDailyRollup(prisma, {
        ...scopeKey,
        providerKey: command.providerKey,
        observedAt: command.observedAt,
        metrics: sample.metrics,
        metricsChanged,
        hasRegression,
      });
    }

    if (isLatest) {
      const updateSourceItem = prisma.sourceItem.update;
      if (updateSourceItem === undefined) {
        throw new Error("Engagement projection requires scoped source update");
      }
      const observationAt =
        observationResult.count === 1
          ? command.observedAt
          : (current?.lastObservationAt ?? command.observedAt);
      const nextDueAt =
        observationResult.count === 1
          ? nextEngagementObservationDueAt({
              publishedAt: sample.publishedAt,
              observedAt: command.observedAt,
            })
          : (current?.nextObservationDueAt ?? command.observedAt);
      await prisma.sourceItemEngagementSnapshot.upsert({
        where: { tenantId_workspaceId_sourceItemId: scopeKey },
        update: {
          providerKey: command.providerKey,
          ...metricColumns(sample.metrics, true),
          metricsHash: sample.metricsFingerprint,
          lastObservedAt: command.observedAt,
          lastChangedAt:
            metricsChanged || current === null
              ? command.observedAt
              : current.lastChangedAt,
          lastObservationAt: observationAt,
          nextObservationDueAt: nextDueAt,
        },
        create: {
          ...scopeKey,
          providerKey: command.providerKey,
          ...metricColumns(sample.metrics, true),
          metricsHash: sample.metricsFingerprint,
          firstObservedAt: command.observedAt,
          lastObservedAt: command.observedAt,
          lastChangedAt: command.observedAt,
          lastObservationAt: observationAt,
          nextObservationDueAt: nextDueAt,
        },
      });
      await updateSourceItem({
        where: { id: sourceItem.id },
        data: {
          lastObservedAt: maxDate(
            sourceItem.lastObservedAt,
            command.observedAt,
          ),
          ...(sample.refreshReadModels
            ? {
                metadata: deepMergeJson(
                  sourceMetadataWithoutEngagementMetrics({
                    providerKey: command.providerKey,
                    metadata: normalizeJsonObject(sourceItem.metadata),
                  }),
                  sample.providerMetadataPatch,
                ),
              }
            : {}),
        },
      });
      if (sample.refreshReadModels) {
        await this.refreshFeedReadModels(prisma, {
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          sourceItemId: sourceItem.id,
          providerKey: command.providerKey,
          providerMetadataPatch: sample.providerMetadataPatch,
          observedAt: command.observedAt,
        });
      }
    }

    return {
      currentSnapshotsUpdated: isLatest ? 1 : 0,
      observationsAppended: observationResult.count,
      metricChanges: isLatest && metricsChanged ? 1 : 0,
      regressionsObserved: hasRegression ? observationResult.count : 0,
    };
  }

  private async refreshFeedReadModels(
    prisma: PrismaSourceEngagementTransactionClient,
    params: {
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly sourceItemId: string;
      readonly providerKey: string;
      readonly providerMetadataPatch: JsonObject;
      readonly observedAt: Date;
    },
  ): Promise<void> {
    const feedItems = await prisma.feedItem.findMany({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        status: "VISIBLE",
        sourceItemId: params.sourceItemId,
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 1_000,
    });
    for (const feedItem of feedItems) {
      const updateFeedItem = prisma.feedItem.update;
      if (updateFeedItem === undefined) {
        throw new Error("Engagement projection requires scoped feed item update");
      }
      const updated = await updateFeedItem({
        where: { id: feedItem.id },
        data: {
          providerMetadata: deepMergeJson(
            sourceMetadataWithoutEngagementMetrics({
              providerKey: params.providerKey,
              metadata: normalizeJsonObject(feedItem.providerMetadata),
            }),
            params.providerMetadataPatch,
          ),
        },
      });
      const signal = feedSignalBaselineSampleFromItem(feedItemFromPrisma(updated));
      if (signal === undefined) {
        await prisma.feedSignalBaselineSample.deleteMany({
          where: {
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            feedItemId: updated.id,
          },
        });
        continue;
      }
      await prisma.feedSignalBaselineSample.upsert({
        where: {
          tenantId_workspaceId_feedItemId: {
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            feedItemId: updated.id,
          },
        },
        update: {
          interestId: updated.interestId,
          providerKey: signal.providerKey,
          sourceKey: signal.sourceKey,
          contentType: signal.contentType,
          strength: signal.strength,
          publishedAt: signal.publishedAt,
          observedAt: params.observedAt,
        },
        create: {
          id: this.ids.generate(),
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          interestId: updated.interestId,
          feedItemId: updated.id,
          providerKey: signal.providerKey,
          sourceKey: signal.sourceKey,
          contentType: signal.contentType,
          strength: signal.strength,
          publishedAt: signal.publishedAt,
          observedAt: params.observedAt,
        },
      });
    }
  }

  private async updateDailyRollup(
    prisma: PrismaSourceEngagementTransactionClient,
    params: {
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly sourceItemId: string;
      readonly providerKey: string;
      readonly observedAt: Date;
      readonly metrics: SourceEngagementMetrics;
      readonly metricsChanged: boolean;
      readonly hasRegression: boolean;
    },
  ): Promise<void> {
    const day = utcDay(params.observedAt);
    const scopeKey = {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      sourceItemId: params.sourceItemId,
      day,
    };
    const current = await prisma.sourceItemEngagementDailyRollup.findUnique({
      where: { tenantId_workspaceId_sourceItemId_day: scopeKey },
    });
    const previousPeak = normalizeMetricJson(current?.peakMetrics);
    await prisma.sourceItemEngagementDailyRollup.upsert({
      where: { tenantId_workspaceId_sourceItemId_day: scopeKey },
      update: {
        sampleCount: (current?.sampleCount ?? 0) + 1,
        changedSampleCount:
          (current?.changedSampleCount ?? 0) + (params.metricsChanged ? 1 : 0),
        regressionCount:
          (current?.regressionCount ?? 0) + (params.hasRegression ? 1 : 0),
        lastObservedAt: params.observedAt,
        compactedThroughAt: params.observedAt,
        closingMetrics: params.metrics,
        peakMetrics:
          previousPeak === null
            ? params.metrics
            : peakEngagementMetrics({
                previous: previousPeak,
                current: params.metrics,
              }),
      },
      create: {
        ...scopeKey,
        providerKey: params.providerKey,
        sampleCount: 1,
        changedSampleCount: params.metricsChanged ? 1 : 0,
        regressionCount: params.hasRegression ? 1 : 0,
        firstObservedAt: params.observedAt,
        lastObservedAt: params.observedAt,
        compactedThroughAt: params.observedAt,
        openingMetrics: params.metrics,
        closingMetrics: params.metrics,
        peakMetrics: params.metrics,
      },
    });
  }
}

const metricKeys = [
  "score",
  "comments",
  "likes",
  "reposts",
  "replies",
  "quotes",
  "bookmarks",
  "impressions",
  "views",
  "points",
  "stars",
  "forks",
  "starsGained",
  "providerRank",
  "upvoteRatioBps",
] as const satisfies readonly (keyof SourceEngagementMetrics)[];

const metricColumns = (
  metrics: SourceEngagementMetrics,
  includeMissing = false,
): Readonly<Record<string, bigint | number | null>> => {
  const columns: Record<string, bigint | number | null> = {};
  for (const key of metricKeys) {
    const value = metrics[key];
    if (value === undefined) {
      if (includeMissing) columns[key] = null;
      continue;
    }
    columns[key] =
      key === "providerRank" || key === "upvoteRatioBps"
        ? value
        : BigInt(value);
  }
  return columns;
};

const metricsFromSnapshot = (
  snapshot: PrismaSourceEngagementSnapshotRecord | null,
): SourceEngagementMetrics | null => {
  if (snapshot === null) {
    return null;
  }
  return Object.fromEntries(
    metricKeys.flatMap((key) => {
      const value = snapshot[key];
      return value === null || value === undefined
        ? []
        : [[key, typeof value === "bigint" ? Number(value) : value]];
    }),
  ) as SourceEngagementMetrics;
};

const normalizeMetricJson = (value: unknown): SourceEngagementMetrics | null => {
  const object = normalizeJsonObject(value);
  const metrics = Object.fromEntries(
    metricKeys.flatMap((key) => {
      const metric = object[key];
      return typeof metric === "number" && Number.isSafeInteger(metric)
        ? [[key, metric]]
        : [];
    }),
  ) as SourceEngagementMetrics;
  return Object.keys(metrics).length === 0 ? null : metrics;
};

const deepMergeJson = (base: JsonObject, patch: JsonObject): JsonObject => {
  const merged: Record<string, JsonValue> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) {
      continue;
    }
    const baseValue = merged[key];
    merged[key] =
      isJsonObject(baseValue) && isJsonObject(patchValue)
        ? deepMergeJson(baseValue, patchValue)
        : patchValue;
  }
  return merged;
};

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const maxDate = (left: Date | null, right: Date): Date =>
  left !== null && left.getTime() > right.getTime() ? left : right;

const utcDay = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const emptyResult = (): ProjectSourceEngagementResult => ({
  currentSnapshotsUpdated: 0,
  observationsAppended: 0,
  metricChanges: 0,
  regressionsObserved: 0,
});

const addResults = (
  left: ProjectSourceEngagementResult,
  right: ProjectSourceEngagementResult,
): ProjectSourceEngagementResult => ({
  currentSnapshotsUpdated:
    left.currentSnapshotsUpdated + right.currentSnapshotsUpdated,
  observationsAppended: left.observationsAppended + right.observationsAppended,
  metricChanges: left.metricChanges + right.metricChanges,
  regressionsObserved: left.regressionsObserved + right.regressionsObserved,
});

const chunks = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  );

const daysBefore = (value: Date, days: number): Date =>
  new Date(value.getTime() - days * 86_400_000);
