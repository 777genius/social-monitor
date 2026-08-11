import type { SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import type {
  ReaderSummaryDailyClaimResult,
  ReaderSummaryDailyExecutionWork,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";
import { readerSummaryDailyModelJobIdentity } from "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";

import {
  runReaderSummaryDailyCatchUp,
  runReaderSummaryDailyCatchUpBatches,
  readerSummaryDailyDeliveryC1CatchUpBatchLimit,
  providerCatchUpArgs,
  verifyClaimedProviderAuthority,
  visibleProviderCounts,
  assertVisibleProviderAuthority,
} from "./run-reader-summary-daily-catch-up";

describe("daily reader-summary catch-up entrypoint", () => {
  it("reaches caught_up across multiple seven-claim C1 batches", async () => {
    const requestedDates = [
      "2026-07-23",
      "2026-07-24",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ];
    const claims: ReaderSummaryDailyClaimResult[] = [
      ...requestedDates.map((requestedUtcDate) => ({
        kind: "claimed" as const,
        work: dailyWork(requestedUtcDate, "COMPLETED", "2026-08-10"),
      })),
      { kind: "caught_up", eligibleThrough: "2026-08-10" },
    ];
    let terminalCalls = 0;
    const result = await runReaderSummaryDailyCatchUpBatches(
      {
        claimNext: async () => claims.shift()!,
        executeClaimed: async (work) => {
          terminalCalls += 1;
          return { kind: "replayed", requestedUtcDate: work.requestedUtcDate };
        },
        readPersistedRows: async () => [],
        spawn: () => childResult(""),
        env: {},
        cwd: "/workspace",
      },
      true,
      "2026-08-10",
    );
    expect(result.outcome).toBe("caught_up");
    expect(terminalCalls).toBe(13);
    expect(claims).toHaveLength(0);
    expect(readerSummaryDailyDeliveryC1CatchUpBatchLimit("2026-08-10")).toBe(3);
  });

  it("fails closed instead of returning a partial C1 recovery", async () => {
    const claims: ReaderSummaryDailyClaimResult[] = Array.from(
      { length: 21 },
      () => ({
        kind: "claimed" as const,
        work: dailyWork("2026-07-23", "COMPLETED", "2026-08-10"),
      }),
    );
    await expect(
      runReaderSummaryDailyCatchUpBatches(
        {
          claimNext: async () => claims.shift()!,
          executeClaimed: async (work) => ({
            kind: "replayed",
            requestedUtcDate: work.requestedUtcDate,
          }),
          readPersistedRows: async () => [],
          spawn: () => childResult(""),
          env: {},
          cwd: "/workspace",
        },
        true,
        "2026-08-10",
      ),
    ).rejects.toThrow("did not reach CAUGHT_UP through 2026-08-10");
  });

  it("requires the frozen C1 boundary before making the first claim", async () => {
    const claimNext = jest.fn();
    await expect(
      runReaderSummaryDailyCatchUpBatches(
        {
          claimNext,
          executeClaimed: jest.fn(),
          readPersistedRows: jest.fn(),
          spawn: jest.fn(),
          env: {},
          cwd: "/workspace",
        },
        true,
      ),
    ).rejects.toThrow("recovery-through is required");
    expect(claimNext).not.toHaveBeenCalled();
  });

  it("rejects rollover evidence beyond the frozen boundary", async () => {
    const claimNext = jest.fn().mockResolvedValue({
      kind: "claimed",
      work: dailyWork("2026-08-11", "COMPLETED", "2026-08-11"),
    });
    await expect(
      runReaderSummaryDailyCatchUpBatches(
        {
          claimNext,
          executeClaimed: async (work) => ({
            kind: "replayed",
            requestedUtcDate: work.requestedUtcDate,
          }),
          readPersistedRows: async () => [],
          spawn: () => childResult(""),
          env: {},
          cwd: "/workspace",
        },
        true,
        "2026-08-10",
      ),
    ).rejects.toThrow("result exceeds recovery-through");
    expect(claimNext).toHaveBeenCalledTimes(7);
  });

  it("acquires DB ownership and invokes providers before transient deferral", async () => {
    const order: string[] = [];
    const result = await runReaderSummaryDailyCatchUp({
      claimNext: async () => {
        order.push("claim");
        return { kind: "claimed", work: dailyWork("2026-07-27") };
      },
      executeClaimed: async () => {
        order.push("terminal");
        return { kind: "completed", requestedUtcDate: "2026-07-27" };
      },
      readPersistedRows: async () => [],
      spawn: (_command, childArgs) => {
        order.push("providers");
        void childArgs;
        return childResult("", 1);
      },
      env: {},
      cwd: "/workspace",
    });

    expect(result.outcome).toBe("nothing_eligible");
    expect(order).toEqual(["claim", "providers"]);
  });

  it("uses only the non-historical provider verification route", () => {
    expect(providerCatchUpArgs("2026-07-27")).toEqual([
      "run",
      "run:reader-summary-clean-real-day-collection",
      "--",
      "--update",
      "--date",
      "2026-07-27",
      "--provider-catch-up",
      "--wait-for-x-readiness",
    ]);
  });

  it("makes a leased concurrent run perform zero provider/model actions", async () => {
    let calls = 0;
    const result = await runReaderSummaryDailyCatchUp({
      claimNext: async () => ({
        kind: "leased",
        requestedUtcDate: "2026-07-27",
      }),
      executeClaimed: async () => {
        calls += 1;
        return { kind: "completed", requestedUtcDate: "2026-07-27" };
      },
      readPersistedRows: async () => [],
      spawn: () => {
        calls += 1;
        return childResult("");
      },
      env: {},
      cwd: "/workspace",
    });
    expect(result.outcome).toBe("nothing_eligible");
    expect(calls).toBe(0);
  });

  it("does no generation or writes when a replay is already caught up", async () => {
    let providerCalls = 0;
    let persistedReadCalls = 0;
    let terminalCalls = 0;

    const result = await runReaderSummaryDailyCatchUp({
      claimNext: async () => ({
        kind: "caught_up",
        eligibleThrough: "2026-07-27",
      }),
      executeClaimed: async () => {
        terminalCalls += 1;
        return { kind: "completed", requestedUtcDate: "2026-07-27" };
      },
      readPersistedRows: async () => {
        persistedReadCalls += 1;
        return [];
      },
      spawn: () => {
        providerCalls += 1;
        return childResult("");
      },
      env: {},
      cwd: "/workspace",
    });

    expect(result.outcome).toBe("caught_up");
    expect({ providerCalls, persistedReadCalls, terminalCalls }).toEqual({
      providerCalls: 0,
      persistedReadCalls: 0,
      terminalCalls: 0,
    });
  });

  it("replays completed publication with zero collector calls", async () => {
    let providerCalls = 0;
    const claims: ReaderSummaryDailyClaimResult[] = [
      { kind: "claimed", work: dailyWork("2026-07-27", "COMPLETED") },
      { kind: "caught_up", eligibleThrough: "2026-07-27" },
    ];
    const result = await runReaderSummaryDailyCatchUp({
      claimNext: async () => claims.shift()!,
      executeClaimed: async (work) => ({
        kind: "replayed",
        requestedUtcDate: work.requestedUtcDate,
      }),
      readPersistedRows: async () => [],
      spawn: () => {
        providerCalls += 1;
        return childResult("");
      },
      env: {},
      cwd: "/workspace",
    });
    expect(result.outcome).toBe("caught_up");
    expect(providerCalls).toBe(0);
  });

  it("rejects a zero-exit artifact left over from a prior day", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-catch-up-test-"));
    const artifactPath = join(directory, "collection.json");
    try {
      writeFileSync(
        artifactPath,
        JSON.stringify({
          schemaVersion: 1,
          artifactFormat: "reader-summary-clean-real-day-collection-v1",
          generatedBy: "npm run run:reader-summary-clean-real-day-collection",
          run: { collectionDate: "2026-07-26" },
          inputs: {
            database: "local-postgres",
            targetPublishedWindow: {
              startInclusive: "2026-07-26T00:00:00.000Z",
              endExclusive: "2026-07-27T00:00:00.000Z",
            },
          },
        }),
      );
      expect(() =>
        verifyClaimedProviderAuthority({
          work: dailyWork("2026-07-27"),
          artifactPath,
        }),
      ).toThrow("exact day evidence");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects immutable source bytes whose hash changed", () => {
    const value = dailyWork("2026-07-27");
    expect(() =>
      verifyClaimedProviderAuthority({
        work: {
          ...value,
          sourceAuthority: {
            ...value.sourceAuthority,
            canonicalSha256: "f".repeat(64),
          },
        },
        artifactPath: "/missing",
      }),
    ).toThrow("SHA-256 diverged");
  });

  it("does not let a prior-day global report block the next collector", async () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-catch-up-sequential-"));
    const artifactPath = join(directory, "collection.json");
    writeFileSync(
      artifactPath,
      JSON.stringify({
        schemaVersion: 1,
        artifactFormat: "reader-summary-clean-real-day-collection-v1",
        generatedBy: "npm run run:reader-summary-clean-real-day-collection",
        run: { collectionDate: "2026-07-27" },
        inputs: { database: "local-postgres" },
      }),
    );
    const claims: ReaderSummaryDailyClaimResult[] = [
      { kind: "claimed", work: dailyWork("2026-07-27", "COMPLETED") },
      { kind: "claimed", work: dailyWork("2026-07-28") },
    ];
    const providerDates: string[] = [];
    try {
      const result = await runReaderSummaryDailyCatchUp({
        claimNext: async () => claims.shift()!,
        readPersistedRows: async () => [],
        executeClaimed: async (work) => ({
          kind: "replayed",
          requestedUtcDate: work.requestedUtcDate,
        }),
        spawn: (_command, args) => {
          providerDates.push(args[5]!);
          return childResult("");
        },
        env: { READER_SUMMARY_DAILY_COLLECTION_REPORT_PATH: artifactPath },
        cwd: "/workspace",
      });
      expect(result.outcome).toBe("nothing_eligible");
      expect(providerDates).toEqual(["2026-07-28"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("classifies immutable authority corruption as terminal blocked", async () => {
    const corrupt = dailyWork("2026-07-27");
    let providerCalls = 0;
    const result = await runReaderSummaryDailyCatchUp({
      claimNext: async () => ({
        kind: "claimed",
        work: {
          ...corrupt,
          sourceAuthority: {
            ...corrupt.sourceAuthority,
            canonicalSha256: "f".repeat(64),
          },
        },
      }),
      readPersistedRows: async () => [],
      executeClaimed: async () => {
        throw new Error("terminal must not run");
      },
      spawn: () => {
        providerCalls += 1;
        return childResult("");
      },
      env: {},
      cwd: "/workspace",
    });
    expect(result.outcome).toBe("blocked");
    expect(providerCalls).toBe(0);
  });

  it("counts only VISIBLE persisted rows", () => {
    expect(
      visibleProviderCounts([
        { providerKey: "reddit", status: "VISIBLE" },
        { providerKey: "reddit", status: "HIDDEN" },
        { providerKey: "reddit", status: "TOMBSTONED" },
        { providerKey: "rss", status: "VISIBLE" },
      ]),
    ).toEqual({ reddit: 1, rss: 1 });
  });

  it("treats a VISIBLE count conflict as terminal corruption", () => {
    expect(() =>
      assertVisibleProviderAuthority(
        [
          { providerKey: "reddit", status: "VISIBLE" },
          { providerKey: "reddit", status: "HIDDEN" },
        ],
        { reddit: 0 },
      ),
    ).toThrow("Visible provider counts diverged");
  });

  it("classifies malformed exact-day evidence as blocked", async () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-catch-up-malformed-"));
    const artifactPath = join(directory, "collection.json");
    writeFileSync(artifactPath, "not-json");
    try {
      const result = await runReaderSummaryDailyCatchUp({
        claimNext: async () => ({
          kind: "claimed",
          work: dailyWork("2026-07-27"),
        }),
        readPersistedRows: async () => [],
        executeClaimed: async () => {
          throw new Error("terminal must not run");
        },
        spawn: () => childResult(""),
        env: { READER_SUMMARY_DAILY_COLLECTION_REPORT_PATH: artifactPath },
        cwd: "/workspace",
      });
      expect(result.outcome).toBe("blocked");
      expect(result.events[result.events.length - 1]?.reasonCode).toBe(
        "provider_authority_invalid",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

const dailyWork = (
  requestedUtcDate: string,
  modelJobState: ReaderSummaryDailyExecutionWork["modelJobState"] = "RESERVED",
  eligibleThrough = "2026-07-28",
): ReaderSummaryDailyExecutionWork => {
  const record = {
    schemaVersion: 1,
    tenantId: "00000000-0000-7000-8000-000000006101",
    workspaceId: "00000000-0000-7000-8000-000000006102",
    requestedUtcDate,
    ingestionCutoff: "2026-07-29T01:00:00.000Z",
    items: [],
  };
  const bytes = Buffer.from(JSON.stringify(record));
  return {
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    requestedUtcDate,
    eligibleThrough,
    sourceAuthority: {
      requestedUtcDate,
      ingestionCutoff: record.ingestionCutoff,
      canonicalBytes: bytes,
      canonicalSha256: createHash("sha256").update(bytes).digest("hex"),
    },
    modelJob: readerSummaryDailyModelJobIdentity({
      tenantId: record.tenantId,
      workspaceId: record.workspaceId,
      requestedUtcDate,
      sourceAuthoritySha256: createHash("sha256").update(bytes).digest("hex"),
    }),
    modelJobState,
    lease: {
      owner: "worker",
      fencingToken: 1n,
      leasedAt: "2026-07-29T01:00:00.000Z",
      expiresAt: "2026-07-29T01:20:00.000Z",
      absoluteExpiresAt: "2026-07-29T08:00:00.000Z",
    },
    ...(modelJobState === "COMPLETED"
      ? {
          completedResponseBytes: Buffer.from("response"),
          completedReceiptBytes: Buffer.from("receipt"),
        }
      : {}),
  };
};

const childResult = (stdout: string, status = 0): SpawnSyncReturns<string> => ({
  pid: 1,
  output: [null, stdout, ""],
  stdout,
  stderr: "",
  status,
  signal: null,
});
