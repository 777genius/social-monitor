import type {
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReaderSummaryProductionRecoveryAuthorityHandle,
  ReaderSummaryProductionRecoveryAuthorityPort,
} from "@social-monitor/summary/ports";
import { productionRecoveryBinding } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.spec-support";

import {
  configureProductionRecoverySession,
  discoverReaderSummaryProductionRecoveryScope,
  resolveReaderSummaryProductionRecoveryRuntimePoolConfigs,
  resolveReaderSummaryProductionRecoverySourceDatabaseUrl,
} from "../recover-reader-summary-production";
import {
  readerSummaryProductionRecoveryDayIds,
  runReaderSummaryProductionRecovery,
  type ReaderSummaryProductionRecoveryExecutionGuard,
} from "./reader-summary-production-recovery-cli";
import { PrismaReaderSummaryProductionRecoveryExecutionGuard } from "./reader-summary-production-recovery-replay-guard";

describe("reader summary production recovery", () => {
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
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
    ]);
  });

  it("does not execute a date with an existing durable claim", async () => {
    const executionGuard = guard((date) =>
      date === "2026-07-25" ? "replayed" : "execute",
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
      "2026-07-24",
      "2026-07-26",
      "2026-07-27",
    ]);
    expect(result.dayResults[1]?.outcome).toBe("replayed");
  });

  it("discovers only a complete Jul24-Jul27 visible scope", async () => {
    let sql = "";
    const scope = await discoverReaderSummaryProductionRecoveryScope({
      $queryRaw: async <T>(strings: TemplateStringsArray): Promise<T> => {
        sql = strings.join("?").replace(/\s+/gu, " ").toLowerCase();
        return [
          {
            tenantId: "10000000-0000-4000-8000-000000000001",
            workspaceId: "20000000-0000-4000-8000-000000000002",
          },
        ] as T;
      },
    });

    expect(scope.tenantId).toContain("10000000");
    expect(sql).toContain("date '2026-07-24'");
    expect(sql).toContain("date '2026-07-27'");
    expect(sql).toContain("= 100");
    expect(sql).not.toContain("source_items");
  });

  it("sets exact tenant session scope and requires one runtime database", async () => {
    const values: readonly unknown[][] = [];
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
          connectionString: "postgres://same",
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
          return [{ claimed: true }] as T;
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
        requestedUtcDate: "2026-07-27",
      }),
    ).resolves.toBe("execute");
    expect(calls[2]).toContain('INSERT INTO "idempotency_keys"');
    expect(calls[2]).toContain('INSERT INTO "reader_summary_jobs"');
    expect(calls[2]).toContain("'RUNNING'");
    expect(calls[2]).toContain(
      "transaction_timestamp(), transaction_timestamp()",
    );
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
    | "replayed"
    | ((
        date: ReaderSummaryProductionRecoveryAuthorityBinding["requestedUtcDates"][number],
      ) => "execute" | "replayed"),
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
