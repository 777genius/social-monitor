import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReaderSummaryProductionRecoveryAuthorityHandle,
  ReaderSummaryProductionRecoveryAuthorityPort,
} from "@social-monitor/summary/ports";
import { productionRecoveryBinding } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.spec-support";
import {
  ReaderSummaryJob,
  ReaderSummaryPublicationPolicy,
} from "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  configureProductionRecoverySession,
  discoverReaderSummaryProductionRecoveryScope,
  resolveReaderSummaryProductionRecoveryRuntimePoolConfigs,
  resolveReaderSummaryProductionRecoverySourceDatabaseUrl,
} from "../recover-reader-summary-production";
import {
  executeProductionRecoveryDay,
  historicalGitHubOmissionForRecoveryDay,
  readerSummaryProductionRecoveryDayIds,
  readerSummaryProductionRecoveryJobIdempotencyKey,
  readerSummaryProductionRecoveryResumeDayIds,
  readerSummaryProductionRecoveryResumeJobIdempotencyKey,
  runReaderSummaryProductionRecovery,
  type ReaderSummaryProductionRecoveryExecutionGuard,
  type ReaderSummaryProductionRecoverySkipEvidence,
} from "./reader-summary-production-recovery-cli";
import {
  dayAuthority,
  periodForRecoveryDate,
} from "./reader-summary-production-recovery-data";
import { PrismaReaderSummaryProductionRecoveryExecutionGuard } from "./reader-summary-production-recovery-replay-guard";

describe("reader summary production recovery", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("requires apply before authority preparation", async () => {
    const authority = fakeAuthority("prepared");
    await expect(
      runReaderSummaryProductionRecovery({
        apply: false,
        authority,
        executionGuard: guard("execute"),
        executeDay: async () => {
          throw new Error("must not execute");
        },
      }),
    ).rejects.toThrow("requires --apply");
    expect(authority.prepareCalls()).toBe(0);
  });

  it("full replay performs no claim or model execution", async () => {
    const executionGuard = guard("execute");
    let modelCalls = 0;

    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      authority: fakeAuthority("replayed"),
      executionGuard,
      executeDay: async () => {
        modelCalls += 1;
        throw new Error("must not execute");
      },
    });

    expect(result.outcome).toBe("replayed");
    expect(result.dayResults.map((day) => day.outcome)).toEqual([
      "skipped",
      "skipped",
      "skipped",
      "skipped",
      "skipped",
      "skipped",
    ]);
    expect(executionGuard.calls()).toBe(0);
    expect(modelCalls).toBe(0);
  });

  it("claims before and executes each unclaimed date once", async () => {
    const seen: string[] = [];
    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      authority: fakeAuthority("prepared"),
      executionGuard: guard("execute"),
      executeDay: async ({ binding, requestedUtcDate }) => {
        seen.push(requestedUtcDate);
        const ids = readerSummaryProductionRecoveryDayIds(
          binding,
          requestedUtcDate,
        );
        return {
          requestedUtcDate,
          outcome: "published",
          readerSummaryJobId: ids.readerSummaryJobId,
          readerSummaryId: ids.readerSummaryId,
        };
      },
    });

    expect(result.outcome).toBe("applied");
    expect(seen).toEqual([
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
    ]);
  });

  it("does not execute a date with an existing durable claim", async () => {
    const executionGuard = guard((date) =>
      date === "2026-07-24" ? "replayed" : "execute",
    );
    const executed: string[] = [];

    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      authority: fakeAuthority("prepared"),
      executionGuard,
      executeDay: async ({ requestedUtcDate }) => {
        executed.push(requestedUtcDate);
        return { requestedUtcDate, outcome: "published" };
      },
    });

    expect(executed).toEqual([
      "2026-07-23",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
    ]);
    expect(result.dayResults[1]?.outcome).toBe("replayed");
  });

  it("executes only the narrow resume identity and reports rejected evidence", async () => {
    const binding = productionRecoveryBinding();
    const rejectedIds = readerSummaryProductionRecoveryDayIds(
      binding,
      "2026-07-23",
    );
    const rejected: ReaderSummaryProductionRecoverySkipEvidence = {
      reason: "existing_quality_rejection",
      terminalStatus: "REJECTED",
      readerSummaryJobId: rejectedIds.readerSummaryJobId,
      readerSummaryId: rejectedIds.readerSummaryId,
      failureReason: "quality gate fixture",
    };
    const identities: string[] = [];
    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      authority: fakeAuthority("prepared"),
      executionGuard: guard((date) =>
        date === "2026-07-23"
          ? rejected
          : date === "2026-07-24"
            ? "resume"
            : "replayed",
      ),
      executeDay: async ({ requestedUtcDate, executionIdentity }) => {
        identities.push(executionIdentity);
        return { requestedUtcDate, outcome: "published" };
      },
    });

    expect(identities).toEqual(["resume-v1"]);
    expect(result.dayResults[0]).toMatchObject({
      outcome: "skipped",
      skipEvidence: rejected,
    });
  });

  it("authorizes historical GitHub omission only from exact DB authority", () => {
    const binding = productionRecoveryBinding();
    expect(
      historicalGitHubOmissionForRecoveryDay(binding, "2026-07-23"),
    ).toEqual({
      reason:
        binding.days[0].githubEvidence.mode === "historical_unavailable"
          ? binding.days[0].githubEvidence.authorization.reason
          : "",
      authorizedAt: new Date(binding.lease.issuedAt),
    });
    expect(
      historicalGitHubOmissionForRecoveryDay(binding, "2026-07-24"),
    ).toBeUndefined();
    const day = binding.days[0];
    const forged = {
      ...binding,
      days: [
        {
          ...day,
          githubEvidence: day.githubEvidence.mode === "historical_unavailable"
            ? {
                ...day.githubEvidence,
                authorization: {
                  ...day.githubEvidence.authorization,
                  authorizationId:
                    "reader_summary.production_recovery.github.2026-07-28.v2",
                },
              }
            : day.githubEvidence,
        },
        ...binding.days.slice(1),
      ],
    } as unknown as ReaderSummaryProductionRecoveryAuthorityBinding;
    expect(() =>
      historicalGitHubOmissionForRecoveryDay(forged, "2026-07-23"),
    ).toThrow("historical GitHub omission authority is not exact");
  });

  it("discovers only the canonical Jul23-Jul28 DB-owned scope", async () => {
    let sql = "";
    let values: readonly unknown[] = [];
    const scope = await discoverReaderSummaryProductionRecoveryScope({
      $queryRaw: async <T>(
        strings: TemplateStringsArray,
        ...queryValues: readonly unknown[]
      ): Promise<T> => {
        sql = strings.join("?").replace(/\s+/gu, " ").toLowerCase();
        values = queryValues;
        return [
          {
            tenantId: "00000000-0000-7000-8000-000000000901",
            workspaceId: "00000000-0000-7000-8000-000000000902",
          },
        ] as T;
      },
    });

    expect(scope.tenantId).toBe(
      "00000000-0000-7000-8000-000000000901",
    );
    expect(values).toEqual([
      "00000000-0000-7000-8000-000000000901",
      "00000000-0000-7000-8000-000000000902",
    ]);
    expect(sql).toContain("date '2026-07-23'");
    expect(sql).toContain("date '2026-07-28'");
    expect(sql).toContain("historical_unavailable");
    expect(sql).toContain("partial_existing");
    expect(sql).not.toContain("expectedcount");
    expect(sql).not.toContain("source_items");
  });

  it("sets exact tenant session scope and requires one runtime database", async () => {
    const values: Array<readonly unknown[]> = [];
    await configureProductionRecoverySession(
      {
        $queryRaw: async <T>(
          _strings: TemplateStringsArray,
          ...queryValues: readonly unknown[]
        ): Promise<T> => {
          values.push(queryValues);
          return [] as T;
        },
      },
      {
        tenantId: "10000000-0000-4000-8000-000000000001",
        workspaceId: "20000000-0000-4000-8000-000000000002",
      },
    );
    expect(values[0]).toEqual([
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
    ]);
    expect(
      resolveReaderSummaryProductionRecoverySourceDatabaseUrl({
        env: {},
        productionDatabaseUrl: "postgres://same",
      }),
    ).toBe("postgres://same");
    expect(() =>
      resolveReaderSummaryProductionRecoveryRuntimePoolConfigs({
        env: {},
        sourceDatabaseUrl: "postgres://other",
        resolveRuntimePoolConfig: () => ({
          processId: "admin-tool",
          connectionString: "postgres://same",
          min: 0,
          max: 1,
          connectionTimeoutMillis: 1,
          idleTimeoutMillis: 1,
        }),
      }),
    ).toThrow("must match DATABASE_URL");
  });

  it("replays an exact final receipt with read-only SQL", async () => {
    const binding = productionRecoveryBinding();
    const calls: string[] = [];
    const client = {
      $queryRaw: async <T>(
        strings: TemplateStringsArray,
      ): Promise<T> => {
        calls.push(strings.join("?"));
        return [{ replayed: true }] as T;
      },
      $transaction: async <T>(
        operation: (client: unknown) => Promise<T>,
      ): Promise<T> => operation(client),
    };
    const executionGuard =
      new PrismaReaderSummaryProductionRecoveryExecutionGuard(
        client as never,
      );

    await expect(
      executionGuard.claim({
        binding,
        requestedUtcDate: "2026-07-24",
      }),
    ).resolves.toBe("replayed");
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("INSERT");
  });

  it("atomically persists the day claim and RUNNING job before execution", async () => {
    const binding = productionRecoveryBinding();
    const calls: string[] = [];
    const client = {
      $queryRaw: async <T>(
        strings: TemplateStringsArray,
      ): Promise<T> => {
        const sql = strings.join("?").replace(/\s+/gu, " ");
        calls.push(sql);
        if (sql.includes("SELECT EXISTS")) {
          return [{ replayed: false }] as T;
        }
        if (sql.includes('FROM "idempotency_keys" AS claim')) {
          return [] as T;
        }
        if (sql.includes("WITH claimed AS")) {
          return [
            {
              claimed: true,
              staleJobSuperseded: false,
              rejectedArtifactSuperseded: false,
            },
          ] as T;
        }
        throw new Error(`Unexpected claim SQL: ${sql}`);
      },
      $transaction: async <T>(
        operation: (client: unknown) => Promise<T>,
      ): Promise<T> => operation(client),
    };
    const executionGuard =
      new PrismaReaderSummaryProductionRecoveryExecutionGuard(
        client as never,
      );

    await expect(
      executionGuard.claim({
        binding,
        requestedUtcDate: "2026-07-26",
      }),
    ).resolves.toBe("execute");
    expect(calls[3]).toContain('INSERT INTO "idempotency_keys"');
    expect(calls[3]).toContain('INSERT INTO "reader_summary_jobs"');
    expect(calls[3]).toContain("'RUNNING'");
    expect(calls[3]).toContain(
      "transaction_timestamp(), transaction_timestamp()",
    );
  });

  it("adopts the durable RUNNING claim and wires durable artifact persistence", async () => {
    const binding = productionRecoveryBinding();
    const requestedUtcDate = "2026-07-24";
    const ids = readerSummaryProductionRecoveryDayIds(
      binding,
      requestedUtcDate,
    );
    const day = dayAuthority(binding, requestedUtcDate);
    const claimedAt = new Date(binding.lease.consumedAt);
    const durableJob = ReaderSummaryJob.request({
      id: ids.readerSummaryJobId,
      tenantId: tenantId(binding.tenantId),
      workspaceId: workspaceId(binding.workspaceId),
      scope: { type: "workspace" },
      period: periodForRecoveryDate(requestedUtcDate),
      idempotencyKey: readerSummaryProductionRecoveryJobIdempotencyKey(
        requestedUtcDate,
        day.canonicalSha256,
      ),
      requestedAt: claimedAt,
    }).start({ startedAt: claimedAt });
    const savedJobs: Array<
      Parameters<ReaderSummaryJobRepositoryPort["save"]>[0]
    > = [];
    const durableJobs = {
      save: jest.fn(async (job: (typeof savedJobs)[number]) => {
        savedJobs.push(job);
      }),
      findById: jest.fn(async () => durableJob),
      findByIdempotencyKey: jest.fn(async () => null),
      findRequested: jest.fn(async () => []),
      claimForExecution: jest.fn(async () => {
        throw new Error("the durable lease must not be claimed twice");
      }),
    } satisfies ReaderSummaryJobRepositoryPort;
    const durableArtifacts = {
      save: jest.fn(async () => undefined),
      list: jest.fn(async () => ({ items: [] })),
      listPeriodSummaries: jest.fn(async () => ({ items: [] })),
      findById: jest.fn(async () => null),
      findRejectedDebugById: jest.fn(async () => null),
    } satisfies ReaderSummaryArtifactRepositoryPort;

    jest
      .spyOn(ExecuteReaderSummaryJobUseCase.prototype, "execute")
      .mockImplementation(async function (
        this: ExecuteReaderSummaryJobUseCase,
        command,
      ) {
        const repositories = this as unknown as {
          readonly readerSummaryJobs: ReaderSummaryJobRepositoryPort;
          readonly readerSummaryArtifacts: ReaderSummaryArtifactRepositoryPort;
          readonly historicalGitHubOmission: unknown;
        };
        expect(repositories.readerSummaryArtifacts).toBe(durableArtifacts);
        expect(repositories.historicalGitHubOmission).toBeUndefined();
        const staged = await repositories.readerSummaryJobs.findById({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          readerSummaryJobId: command.readerSummaryJobId,
        });
        expect(staged?.toSnapshot().status).toBe("requested");

        const running = await repositories.readerSummaryJobs.claimForExecution({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          readerSummaryJobId: command.readerSummaryJobId,
          requestedAt: claimedAt,
          startedAt: claimedAt,
        });
        expect(running?.toSnapshot().status).toBe("running");
        expect(durableJobs.claimForExecution).not.toHaveBeenCalled();
        await repositories.readerSummaryJobs.save(
          running!.fail({
            failedAt: claimedAt,
            failureReason: "durable failure fixture",
          }),
        );

        return {
          ok: true,
          value: {
            readerSummaryJobId: ids.readerSummaryJobId,
            readerSummaryId: ids.readerSummaryId,
            status: "completed",
          },
        };
      });

    await expect(
      executeProductionRecoveryDay({
        binding,
        requestedUtcDate,
        model: {} as never,
        finalization: {} as never,
        durableJobs,
        durableArtifacts,
        feedItems: {} as never,
        githubProjectionReader: {} as never,
        ids: { generate: () => "unused-id" },
        clock: { now: () => claimedAt },
      }),
    ).resolves.toMatchObject({
      outcome: "published",
      readerSummaryJobId: ids.readerSummaryJobId,
      readerSummaryId: ids.readerSummaryId,
    });
    expect(durableJobs.findById).toHaveBeenCalledTimes(1);
    expect(savedJobs[0]?.toSnapshot().status).toBe("failed");
  });

  it("wires exact historical omission while leaving publication policy intact", async () => {
    const binding = productionRecoveryBinding();
    const requestedUtcDate = "2026-07-23";
    const ids = readerSummaryProductionRecoveryDayIds(
      binding,
      requestedUtcDate,
    );
    jest
      .spyOn(ExecuteReaderSummaryJobUseCase.prototype, "execute")
      .mockImplementation(async function () {
        const configured = this as unknown as {
          readonly historicalGitHubOmission: unknown;
          readonly publicationPolicy: unknown;
        };
        expect(configured.historicalGitHubOmission).toEqual(
          historicalGitHubOmissionForRecoveryDay(
            binding,
            requestedUtcDate,
          ),
        );
        expect(configured.publicationPolicy).toBeInstanceOf(
          ReaderSummaryPublicationPolicy,
        );
        return {
          ok: true,
          value: {
            readerSummaryJobId: ids.readerSummaryJobId,
            readerSummaryId: ids.readerSummaryId,
            status: "completed",
          },
        };
      });

    await expect(
      executeProductionRecoveryDay({
        binding,
        requestedUtcDate,
        model: {} as never,
        finalization: {} as never,
        durableJobs: {} as never,
        durableArtifacts: {} as never,
        feedItems: {} as never,
        githubProjectionReader: {} as never,
        ids: { generate: () => "unused-id" },
        clock: { now: () => new Date(binding.lease.consumedAt) },
      }),
    ).resolves.toMatchObject({ readerSummaryId: ids.readerSummaryId });
  });

  it("uses separate IDs and idempotency only when resume is explicit", async () => {
    const binding = productionRecoveryBinding();
    const requestedUtcDate = "2026-07-24";
    const resumeIds = readerSummaryProductionRecoveryResumeDayIds(
      binding,
      requestedUtcDate,
    );
    const day = dayAuthority(binding, requestedUtcDate);
    jest
      .spyOn(ExecuteReaderSummaryJobUseCase.prototype, "execute")
      .mockImplementation(async function (_command) {
        const jobs = this as unknown as {
          readonly readerSummaryJobs: ReaderSummaryJobRepositoryPort;
        };
        const staged = await jobs.readerSummaryJobs.findById({
          tenantId: tenantId(binding.tenantId),
          workspaceId: workspaceId(binding.workspaceId),
          readerSummaryJobId: resumeIds.readerSummaryJobId,
        });
        expect(staged?.toSnapshot().idempotencyKey).toBe(
          readerSummaryProductionRecoveryResumeJobIdempotencyKey(
            requestedUtcDate,
            day.canonicalSha256,
          ),
        );
        return {
          ok: true,
          value: {
            readerSummaryJobId: resumeIds.readerSummaryJobId,
            readerSummaryId: resumeIds.readerSummaryId,
            status: "completed",
          },
        };
      });
    await executeProductionRecoveryDay({
      binding,
      requestedUtcDate,
      executionIdentity: "resume-v1",
      model: {} as never,
      finalization: {} as never,
      durableJobs: {} as never,
      durableArtifacts: {} as never,
      feedItems: {} as never,
      githubProjectionReader: {} as never,
      ids: { generate: () => "unused-id" },
      clock: { now: () => new Date(binding.lease.consumedAt) },
    });
  });
});

const fakeAuthority = (
  outcome: "prepared" | "replayed",
): ReaderSummaryProductionRecoveryAuthorityPort & {
  prepareCalls(): number;
} => {
  const binding = productionRecoveryBinding();
  const handle = {} as ReaderSummaryProductionRecoveryAuthorityHandle;
  let calls = 0;
  return {
    prepareCalls: () => calls,
    prepare: async () => {
      calls += 1;
      return { outcome, authority: handle };
    },
    readVerifiedBinding: (candidate) => {
      if (candidate !== handle) {
        throw new Error("forged handle");
      }
      return binding;
    },
  };
};

const guard = (
  outcome:
    | "execute"
    | "resume"
    | "replayed"
    | ReaderSummaryProductionRecoverySkipEvidence
    | ((
        date: ReaderSummaryProductionRecoveryAuthorityBinding["requestedUtcDates"][number],
      ) =>
        | "execute"
        | "resume"
        | "replayed"
        | ReaderSummaryProductionRecoverySkipEvidence),
): ReaderSummaryProductionRecoveryExecutionGuard & { calls(): number } => {
  let callCount = 0;
  return {
    calls: () => callCount,
    claim: async ({ requestedUtcDate }) => {
      callCount += 1;
      return typeof outcome === "function"
        ? outcome(requestedUtcDate)
        : outcome;
    },
  };
};
