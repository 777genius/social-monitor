import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { PrismaSummaryClient } from "./prisma-summary-client";
import { PrismaReaderSummaryJobRepository } from "./prisma-reader-summary-job.repository";
import {
  readerSummaryJobFromPrisma,
  type PrismaReaderSummaryJobRecord,
} from "./prisma-reader-summary-records";

const tenant = tenantId("00000000-0000-7000-8000-000000000101");
const workspace = workspaceId("00000000-0000-7000-8000-000000000102");
const oldStartedAt = new Date("2026-08-14T12:00:00.000Z");
const reclaimedAt = new Date("2026-08-14T12:30:00.000Z");
const staleBefore = new Date("2026-08-14T12:15:00.000Z");

describe("PrismaReaderSummaryJobRepository execution lease", () => {
  it("does not issue a write for a fresh running job", async () => {
    const updateMany = jest.fn();
    const repository = repositoryWith({
      findFirst: jest.fn().mockResolvedValue(
        record({ startedAt: new Date("2026-08-14T12:20:00.000Z") }),
      ),
      updateMany,
    });

    const claim = await repository.claimForExecution(claimParams());

    expect(claim).toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("reclaims stale RUNNING with an exact status-and-start-time CAS", async () => {
    const reclaimed = record({
      requestedAt: reclaimedAt,
      startedAt: reclaimedAt,
    });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(record())
      .mockResolvedValueOnce(reclaimed);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = repositoryWith({ findFirst, updateMany });

    const claim = await repository.claimForExecution(claimParams());

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: tenant,
        workspaceId: workspace,
        id: record().id,
        status: "RUNNING",
        startedAt: oldStartedAt,
      },
      data: expect.objectContaining({
        status: "RUNNING",
        requestedAt: reclaimedAt,
        startedAt: reclaimedAt,
      }),
    });
    expect(claim?.toSnapshot()).toMatchObject({
      status: "running",
      requestedAt: reclaimedAt,
      startedAt: reclaimedAt,
    });
  });

  it("allows only one claimant when stale readers race", async () => {
    let current = record();
    let initialReads = 0;
    let releaseReads = (): void => undefined;
    const bothRead = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const findFirst = jest.fn(async () => {
      if (initialReads < 2) {
        initialReads += 1;
        if (initialReads === 2) {
          releaseReads();
        }
        await bothRead;
        return record();
      }
      return current;
    });
    const updateMany = jest.fn(async (args: ClaimUpdateArgs) => {
      if (
        current.status !== args.where.status ||
        current.startedAt?.getTime() !== args.where.startedAt?.getTime()
      ) {
        return { count: 0 };
      }
      current = record({
        requestedAt: args.data.requestedAt,
        startedAt: args.data.startedAt,
      });
      return { count: 1 };
    });
    const repository = repositoryWith({ findFirst, updateMany });

    const claims = await Promise.all([
      repository.claimForExecution(claimParams()),
      repository.claimForExecution({
        ...claimParams(),
        requestedAt: new Date(reclaimedAt.getTime() + 1_000),
        startedAt: new Date(reclaimedAt.getTime() + 1_000),
      }),
    ]);

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
  });

  it("fences a terminal write from a superseded execution", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const repository = repositoryWith({
      findFirst: jest.fn(),
      updateMany,
    });
    const failed = readerSummaryJobFromPrisma(record()).fail({
      failedAt: new Date("2026-08-14T12:31:00.000Z"),
      failureReason: "Interrupted claimant resumed",
    });

    await expect(
      repository.saveExecutionOutcome({
        job: failed,
        expectedStartedAt: oldStartedAt,
      }),
    ).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: tenant,
          workspaceId: workspace,
          id: record().id,
          status: "RUNNING",
          startedAt: oldStartedAt,
        },
      }),
    );
  });
});

type ClaimUpdateArgs = {
  readonly where: {
    readonly status: string;
    readonly startedAt?: Date;
  };
  readonly data: {
    readonly requestedAt: Date;
    readonly startedAt: Date;
  };
};

const repositoryWith = (readerSummaryJob: {
  readonly findFirst: jest.Mock;
  readonly updateMany: jest.Mock;
}): PrismaReaderSummaryJobRepository =>
  new PrismaReaderSummaryJobRepository({
    readerSummaryJob,
  } as unknown as PrismaSummaryClient);

const claimParams = () => ({
  tenantId: tenant,
  workspaceId: workspace,
  readerSummaryJobId: record().id,
  requestedAt: reclaimedAt,
  startedAt: reclaimedAt,
  staleRunningStartedBefore: staleBefore,
});

const record = (
  overrides: Partial<PrismaReaderSummaryJobRecord> = {},
): PrismaReaderSummaryJobRecord => ({
  id: "00000000-0000-7000-8000-000000000103",
  tenantId: tenant,
  workspaceId: workspace,
  scopeType: "workspace",
  scopeKey: "workspace",
  interestId: null,
  cadence: "daily",
  periodStartedAt: new Date("2026-08-13T00:00:00.000Z"),
  periodEndedAt: new Date("2026-08-14T00:00:00.000Z"),
  periodTimezone: "UTC",
  periodKey:
    "daily:2026-08-13T00:00:00.000Z:2026-08-14T00:00:00.000Z:UTC",
  userId: null,
  subscriptionId: null,
  status: "RUNNING",
  idempotencyKey: "reader-summary:daily:2026-08-13",
  requestedAt: new Date("2026-08-14T11:59:00.000Z"),
  startedAt: oldStartedAt,
  completedAt: null,
  failedAt: null,
  readerSummaryArtifactId: null,
  failureReason: null,
  createdAt: new Date("2026-08-14T11:59:00.000Z"),
  updatedAt: oldStartedAt,
  ...overrides,
});
