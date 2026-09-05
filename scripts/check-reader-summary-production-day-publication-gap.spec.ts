import { strict as assert } from "node:assert";

import { dailyGapPublicationBindingsQuery } from "./lib/reader-summary-daily-gap-query";
import { dailyGapTestDates, dailyGapTestDatabaseUrl, dailyGapTestRows, dailyGapTestScope } from "./lib/reader-summary-daily-gap-test-fixtures";

const mockCalls: { operation: string; args: readonly unknown[] }[] = [];
let mockRows = dailyGapTestRows();
let mockQueryFailure: Error | undefined;
jest.mock("@social-monitor/platform-persistence", () => ({
  defaultPostgresRuntimePoolConfig: (...args: unknown[]) => ({ args }),
  runWithSystemDatabaseAccess: async (reason: string, operation: () => Promise<unknown>) => {
    mockCalls.push({ operation: "system-access", args: [reason] });
    return operation();
  },
  acquirePrismaPgRuntimeConnection: async () => ({
    client: {
      $transaction: async (operation: (transaction: unknown) => Promise<unknown>, options: unknown) => {
        mockCalls.push({ operation: "transaction", args: [options] });
        return operation({
          $executeRawUnsafe: async (...args: unknown[]) => {
            mockCalls.push({ operation: "execute", args });
            return 0;
          },
          $queryRawUnsafe: async (...args: unknown[]) => {
            mockCalls.push({ operation: "query", args });
            if (mockQueryFailure !== undefined) throw mockQueryFailure;
            return mockRows;
          },
        });
      },
    },
    close: async () => { mockCalls.push({ operation: "close", args: [] }); },
  }),
}));
jest.mock("@social-monitor/platform-persistence/prisma-runtime-client", () => ({
  loadPrismaRuntimeClient: () => class {},
}));
jest.mock("./lib/reader-summary-production-day-scope", () => ({
  readerSummaryProductionDayScope: {
    tenantId: "00000000-0000-4000-8000-000000009201",
    workspaceId: "00000000-0000-4000-8000-000000009202",
  },
}));

import { publicationGapDates, verifyPublishedProductionDayGap } from "./check-reader-summary-production-day-publication-gap";
const verify = () => verifyPublishedProductionDayGap({
  afterDate: "2026-08-29", targetDate: "2026-09-04", databaseUrl: dailyGapTestDatabaseUrl,
});

describe("production-day publication cursor gap", () => {
  it("returns every intervening UTC date and excludes both endpoints", () => {
    assert.deepEqual(publicationGapDates("2026-08-14", "2026-08-18"), [
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
    ]);
  });

  it("accepts an ordinary consecutive transition without a database gap", () => {
    assert.deepEqual(publicationGapDates("2026-08-27", "2026-08-28"), []);
  });

  it("fails closed for malformed or non-forward transitions", () => {
    assert.throws(() => publicationGapDates("not-a-date", "2026-08-28"),
      /publication cursor date is invalid/u,
    );
    assert.throws(() => publicationGapDates("2026-08-28", "2026-08-28"),
      /must follow the current cursor/u,
    );
    assert.throws(() => publicationGapDates("2026-08-29", "2026-08-28"),
      /must follow the current cursor/u,
    );
  });

  it("validates the synthetic mixed gap in one bounded repeatable-read snapshot", async () => {
    mockCalls.length = 0;
    mockRows = dailyGapTestRows();
    assert.deepEqual(await verify(), dailyGapTestDates);
    assert.deepEqual(mockCalls.map((call) => call.operation), [
      "system-access", "transaction", "execute", "query", "close",
    ]);
    assert.deepEqual(mockCalls[1]?.args, [{ isolationLevel: "RepeatableRead", maxWait: 30_000, timeout: 180_000 }]);
    assert.deepEqual(mockCalls[2]?.args, ["SET LOCAL statement_timeout = '60s'"]);
    assert.deepEqual(mockCalls[3]?.args, [dailyGapPublicationBindingsQuery,
      dailyGapTestScope.tenantId, dailyGapTestScope.workspaceId, "workspace", dailyGapTestDates]);
  });

  it("does not connect for a consecutive day", async () => {
    mockCalls.length = 0;
    assert.deepEqual(await verifyPublishedProductionDayGap({
      afterDate: "2026-09-03", targetDate: "2026-09-04", databaseUrl: dailyGapTestDatabaseUrl,
    }), []);
    assert.deepEqual(mockCalls, []);
  });

  it("fails closed and closes the connection for a missing or tampered terminal", async () => {
    for (const rows of [dailyGapTestRows().slice(0, 4), dailyGapTestRows().map((row, i) =>
      i === 4 ? { ...row, proofSha256: "f".repeat(64) } : row)]) {
      mockRows = rows;
      mockCalls.length = 0;
      await assert.rejects(verify());
      assert.equal(mockCalls.at(-1)?.operation, "close");
    }
  });

  it("propagates database failure and closes the connection", async () => {
    mockCalls.length = 0;
    mockQueryFailure = new Error("Synthetic database unavailable");
    try {
      await assert.rejects(verify(), /Synthetic database unavailable/u);
      assert.equal(mockCalls.at(-1)?.operation, "close");
    } finally {
      mockQueryFailure = undefined;
    }
  });
});
