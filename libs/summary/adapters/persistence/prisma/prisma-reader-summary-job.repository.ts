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
          terminalFailureCode: snapshot.terminalFailureCode ?? null,
          selectionStrategy: snapshot.selectionStrategy ?? null,
          preparationConfig: snapshot.preparationConfig ?? null,
          preparationManifest: snapshot.preparationManifest ?? null,
          preparationManifestSha256: snapshot.preparationManifestSha256 ?? null,
          preparationCutoffAt: snapshot.preparationCutoffAt ?? null,
          preparationDeadlineAt: snapshot.preparationDeadlineAt ?? null,
          preparationNextCheckAt: snapshot.preparationNextCheckAt ?? null,
          preparationReadyAt: snapshot.preparationReadyAt ?? null,
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
          terminalFailureCode: snapshot.terminalFailureCode ?? null,
          selectionStrategy: snapshot.selectionStrategy ?? null,
          preparationConfig: snapshot.preparationConfig ?? null,
          preparationManifest: snapshot.preparationManifest ?? null,
          preparationManifestSha256: snapshot.preparationManifestSha256 ?? null,
          preparationCutoffAt: snapshot.preparationCutoffAt ?? null,
          preparationDeadlineAt: snapshot.preparationDeadlineAt ?? null,
          preparationNextCheckAt: snapshot.preparationNextCheckAt ?? null,
          preparationReadyAt: snapshot.preparationReadyAt ?? null,
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

    return record === null ? null : readerSummaryJobFromPrisma(
      await this.withExactPreparationTimes(record),
    );
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

    return record === null ? null : readerSummaryJobFromPrisma(
      await this.withExactPreparationTimes(record),
    );
  }

  async findRequested(
    params: Parameters<ReaderSummaryJobRepositoryPort["findRequested"]>[0],
  ): Promise<readonly ReaderSummaryJob[]> {
    assertOptionalScopeIsComplete(params);
    const findRequested = async () => {
      const records = await this.prisma.readerSummaryJob.findMany({
        where: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          status: "REQUESTED",
          ...(params.now === undefined ? {} : {
            OR: [
              { preparationNextCheckAt: null },
              { preparationNextCheckAt: { lte: params.now } },
            ] as const,
          }),
        },
        orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
        take: params.limit,
      });
      return this.withExactPreparationTimesForRecords(records);
    };
    const records =
      params.tenantId === undefined
        ? await runWithSystemDatabaseAccess(
            "cross-tenant reader summary job polling",
            findRequested,
          )
        : await findRequested();

    return records.map((record) => readerSummaryJobFromPrisma(record));
  }

  private async withExactPreparationTimes<T extends {
    readonly id: string;
    readonly tenantId: string;
    readonly workspaceId: string;
  }>(record: T): Promise<T & {
    readonly preparationCutoffAtText?: string | null;
    readonly preparationDeadlineAtText?: string | null;
  }> {
    return (await this.withExactPreparationTimesForRecords([record]))[0]!;
  }

  private async withExactPreparationTimesForRecords<T extends {
    readonly id: string;
    readonly tenantId: string;
    readonly workspaceId: string;
  }>(records: readonly T[]): Promise<readonly (T & {
    readonly preparationCutoffAtText?: string | null;
    readonly preparationDeadlineAtText?: string | null;
  })[]> {
    if (records.length === 0 || typeof this.prisma.$queryRaw !== "function") {
      return records;
    }
    const ids = records.map((record) => record.id);
    const tenantIds = records.map((record) => record.tenantId);
    const workspaceIds = records.map((record) => record.workspaceId);
    const exact = await this.prisma.$queryRaw<readonly {
      readonly id: string;
      readonly preparation_cutoff_at: string | null;
      readonly preparation_deadline_at: string | null;
    }[]>`
      SELECT id::text,
        CASE WHEN preparation_cutoff_at IS NULL THEN NULL ELSE
          to_char(preparation_cutoff_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS preparation_cutoff_at,
        CASE WHEN preparation_deadline_at IS NULL THEN NULL ELSE
          to_char(preparation_deadline_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS preparation_deadline_at
      FROM reader_summary_jobs WHERE id=ANY(${ids}::uuid[])
        AND tenant_id=ANY(${tenantIds}::uuid[])
        AND workspace_id=ANY(${workspaceIds}::uuid[])
    `;
    const byId = new Map(exact.map((row) => [row.id, row] as const));
    return records.map((record) => {
      const row = byId.get(record.id);
      return row === undefined ? record : { ...record,
        preparationCutoffAtText: row.preparation_cutoff_at,
        preparationDeadlineAtText: row.preparation_deadline_at };
    });
  }

  async claimForExecution(
    params: Parameters<ReaderSummaryJobRepositoryPort["claimForExecution"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    const record = await this.prisma.readerSummaryJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.readerSummaryJobId,
      },
    });

    if (record === null) {
      return null;
    }
    const staleRunning =
      record.status === "RUNNING" &&
      record.startedAt !== null &&
      record.startedAt < params.staleRunningStartedBefore;
    if (
      (record.status === "FAILED" && record.terminalFailureCode != null) ||
      record.status !== "REQUESTED" &&
      record.status !== "FAILED" &&
      !staleRunning
    ) {
      return null;
    }

    const update = await withPrismaWriteRetry(() =>
      this.prisma.readerSummaryJob.updateMany({
        where: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          id: params.readerSummaryJobId,
          status: record.status,
          ...(record.status === "RUNNING" && record.startedAt !== null
            ? { startedAt: record.startedAt }
            : {}),
          ...(record.status === "FAILED" ? { terminalFailureCode: null } : {}),
        },
        data: {
          status: "RUNNING",
          // publish_reader_summary also compares requestedAt. Refreshing it
          // on recovery fences publication by the interrupted process.
          requestedAt:
            record.status === "FAILED" || staleRunning
              ? params.requestedAt
              : record.requestedAt,
          startedAt: params.startedAt,
          completedAt: null,
          failedAt: null,
          readerSummaryArtifactId: null,
          failureReason: null,
          terminalFailureCode: null,
          preparationNextCheckAt: null,
        },
      }),
    );

    if (update.count !== 1) {
      return null;
    }

    return this.findById(params);
  }

  async saveExecutionOutcome(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["saveExecutionOutcome"]
    >[0],
  ): Promise<boolean> {
    const snapshot = params.job.toSnapshot();
    if (
      snapshot.startedAt?.getTime() !== params.expectedStartedAt.getTime() ||
      snapshot.status === "running" ||
      snapshot.status === "requested"
    ) {
      return false;
    }

    const update = await withPrismaWriteRetry(() =>
      this.prisma.readerSummaryJob.updateMany({
        where: {
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          id: snapshot.id,
          status: "RUNNING",
          startedAt: params.expectedStartedAt,
        },
        data: {
          status: readerSummaryJobStatusToPrisma(snapshot.status),
          requestedAt: snapshot.requestedAt,
          startedAt: params.expectedStartedAt,
          completedAt: snapshot.completedAt ?? null,
          failedAt: snapshot.failedAt ?? null,
          readerSummaryArtifactId: snapshot.readerSummaryId ?? null,
          failureReason: snapshot.failureReason ?? null,
          terminalFailureCode: snapshot.terminalFailureCode ?? null,
          preparationNextCheckAt: snapshot.preparationNextCheckAt ?? null,
          preparationReadyAt: snapshot.preparationReadyAt ?? null,
        },
      }),
    );

    return update.count === 1;
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
