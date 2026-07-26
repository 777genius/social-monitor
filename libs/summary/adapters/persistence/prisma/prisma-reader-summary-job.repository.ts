import {
  runWithSystemDatabaseAccess,
  withPrismaWriteRetry,
} from "@social-monitor/platform-persistence";
import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryJob } from "../../../domain";
import type { ReaderSummaryJobRepositoryPort } from "../../../ports";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  readerSummaryJobFromPrisma,
  readerSummaryJobStatusToPrisma,
  readerSummaryScopeToPrisma,
} from "./prisma-reader-summary-records";

export class PrismaReaderSummaryJobRepository implements ReaderSummaryJobRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(job: ReaderSummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    const status = readerSummaryJobStatusToPrisma(snapshot.status);
    const scopeFields = readerSummaryScopeToPrisma(snapshot.scope);

    await withPrismaWriteRetry(() =>
      this.prisma.readerSummaryJob.upsert({
        where: { id: snapshot.id },
        update: {
          ...scopeFields,
          cadence: snapshot.period.cadence,
          periodStartedAt: snapshot.period.startedAt,
          periodEndedAt: snapshot.period.endedAt,
          periodTimezone: snapshot.period.timezone,
          periodKey: snapshot.period.periodKey,
          status,
          idempotencyKey: snapshot.idempotencyKey,
          userId: snapshot.userId ?? null,
          subscriptionId: snapshot.subscriptionId ?? null,
          requestedAt: snapshot.requestedAt,
          startedAt: snapshot.startedAt ?? null,
          completedAt: snapshot.completedAt ?? null,
          failedAt: snapshot.failedAt ?? null,
          readerSummaryArtifactId: snapshot.readerSummaryId ?? null,
          failureReason: snapshot.failureReason ?? null,
        },
        create: {
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          ...scopeFields,
          cadence: snapshot.period.cadence,
          periodStartedAt: snapshot.period.startedAt,
          periodEndedAt: snapshot.period.endedAt,
          periodTimezone: snapshot.period.timezone,
          periodKey: snapshot.period.periodKey,
          userId: snapshot.userId ?? null,
          subscriptionId: snapshot.subscriptionId ?? null,
          status,
          idempotencyKey: snapshot.idempotencyKey,
          requestedAt: snapshot.requestedAt,
          startedAt: snapshot.startedAt ?? null,
          completedAt: snapshot.completedAt ?? null,
          failedAt: snapshot.failedAt ?? null,
          readerSummaryArtifactId: snapshot.readerSummaryId ?? null,
          failureReason: snapshot.failureReason ?? null,
        },
      }),
    );
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    readerSummaryJobId: string;
  }): Promise<ReaderSummaryJob | null> {
    const record = await this.prisma.readerSummaryJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.readerSummaryJobId,
      },
    });

    return record === null ? null : readerSummaryJobFromPrisma(record);
  }

  async findByIdempotencyKey(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    idempotencyKey: string;
  }): Promise<ReaderSummaryJob | null> {
    const record = await this.prisma.readerSummaryJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        idempotencyKey: params.idempotencyKey,
      },
    });

    return record === null ? null : readerSummaryJobFromPrisma(record);
  }

  async findRequested(
    params: Parameters<ReaderSummaryJobRepositoryPort["findRequested"]>[0],
  ): Promise<readonly ReaderSummaryJob[]> {
    assertOptionalScopeIsComplete(params);
    const findRequested = () =>
      this.prisma.readerSummaryJob.findMany({
        where: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          status: "REQUESTED",
        },
        orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
        take: params.limit,
      });
    const records =
      params.tenantId === undefined
        ? await runWithSystemDatabaseAccess(
            "cross-tenant reader summary job polling",
            findRequested,
          )
        : await findRequested();

    return records.map((record) => readerSummaryJobFromPrisma(record));
  }

  async claimForExecution(
    params: Parameters<ReaderSummaryJobRepositoryPort["claimForExecution"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    const record = await this.prisma.readerSummaryJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.readerSummaryJobId,
        status: { in: ["REQUESTED", "FAILED"] },
      },
    });

    if (record === null) {
      return null;
    }

    const update = await withPrismaWriteRetry(() =>
      this.prisma.readerSummaryJob.updateMany({
        where: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          id: params.readerSummaryJobId,
          status: record.status,
        },
        data: {
          status: "RUNNING",
          requestedAt:
            record.status === "FAILED"
              ? params.requestedAt
              : record.requestedAt,
          startedAt: params.startedAt,
          completedAt: null,
          failedAt: null,
          readerSummaryArtifactId: null,
          failureReason: null,
        },
      }),
    );

    if (update.count !== 1) {
      return null;
    }

    return this.findById(params);
  }
}

const assertOptionalScopeIsComplete = (scope: {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
}): void => {
  if ((scope.tenantId === undefined) !== (scope.workspaceId === undefined)) {
    throw new Error(
      "Reader summary job polling scope must include tenant and workspace",
    );
  }
};
