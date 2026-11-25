import { FixedClock } from "@social-monitor/shared-kernel";

import type { PrismaSummaryClient } from "../../libs/summary/adapters/persistence/prisma/prisma-summary-client";
import type {
  PrismaReaderSummaryArtifactRecord,
  PrismaReaderSummaryJobRecord,
  PrismaReaderSummaryPolicyRecord,
} from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import type { PrismaReaderSummaryTopicRecommendationDecisionRecord } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-topic-recommendation-decision-records";
import type {
  PrismaSummaryArtifactRecord,
  PrismaSummaryFeedbackRecord,
  PrismaSummaryJobRecord,
  PrismaSummaryOutboxEventRecord,
  PrismaSummaryPolicyRecord,
  PrismaSummaryStatus,
} from "../../libs/summary/adapters/persistence/prisma/prisma-summary-records";

const clock = new FixedClock(new Date("2026-06-08T00:00:00.000Z"));

export class FakePrismaSummaryClient implements PrismaSummaryClient {
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

  readerSummaryJobStatus(id: string): PrismaSummaryStatus | undefined {
    return this.readerSummaryJobs.get(id)?.status;
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
            record.id === args.where.id &&
            (args.where.status === undefined ||
              args.where.status.in.includes(record.status)),
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
