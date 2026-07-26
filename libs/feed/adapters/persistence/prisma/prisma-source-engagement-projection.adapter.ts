import {
  feedSignalBaselineSampleFromItem,
} from "@social-monitor/feed/domain";
import { feedItemFromPrisma } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-records";
import type {
  PrismaSourceEngagementClient,
  PrismaSourceEngagementTransactionClient,
} from "./prisma-source-engagement-client";
import {
  addResults,
  chunks,
  daysBefore,
  deepMergeJson,
  emptyResult,
  maxDate,
  metricColumns,
  metricsFromSnapshot,
  normalizeMetricJson,
  utcDay,
} from "./prisma-source-engagement-projection-helpers";
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
import {
  normalizeJsonObject,
  type IdGenerator,
  type JsonObject,
} from "@social-monitor/shared-kernel";

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
