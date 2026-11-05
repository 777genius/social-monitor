import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exactProductionRecoveryBinding as productionRecoveryBinding } from "./reader-summary-production-recovery-exact.spec-support";
import { exactRecoveryGapBinding } from "./reader-summary-production-recovery-gap.spec-support";
import {
  assertPersistedReaderSummaryProductionRecoveryAuthority,
  limitRecoveryAgentRuntimeToOneCall,
  loadPersistedReaderSummaryProductionRecoveryAuthority,
} from "../recover-reader-summary-production";
import {
  limitRecoveryModelToOneCall,
  parseReaderSummaryProductionRecoveryCliArguments,
  readerSummaryProductionRecoveryDayIds,
  readerSummaryProductionRecoveryHistoricalDates,
  readerSummaryProductionRecoveryIdentity,
  runReaderSummaryProductionRecoveryGap,
  runReaderSummaryProductionRecovery,
  type ReaderSummaryProductionRecoveryExecutionGuard,
} from "./reader-summary-production-recovery-cli";
import type { ReaderSummaryProductionRecoveryGapAuthorityBinding } from "./reader-summary-production-recovery-gap-authority";
import {
  readerSummaryProductionRecoveryGenerationProfile,
  readerSummaryProductionRecoveryModelContract,
} from "./reader-summary-production-recovery-model-contract";

const generationProfile = {
  modelVersion: "codex:gpt-5.6-sol:xhigh",
  promptVersion: "reader_summary.prompt.2026-07-14.daily_synthesis",
  rankingPolicyVersion: "story_ranking_v10",
} as const;

describe("reader summary production recovery CLI", () => {
  it("validates --dates before dotenv, env reads, or database setup", () => {
    const entrypoint = readFileSync(
      join(process.cwd(), "scripts/recover-reader-summary-production.ts"),
      "utf8",
    );
    const main = entrypoint.slice(entrypoint.indexOf("async function main"));
    const parseAt = main.indexOf(
      "parseReaderSummaryProductionRecoveryCliArguments",
    );
    expect(parseAt).toBeGreaterThan(0);
    for (const laterOperation of [
      'import("./lib/env-file")',
      'requiredEnv("DATABASE_URL")',
      "PrismaSummaryConnection.create",
    ]) {
      expect(main.indexOf(laterOperation)).toBeGreaterThan(parseAt);
    }
  });

  it("parses a unique explicit historical subset before runtime work", () => {
    expect(
      parseReaderSummaryProductionRecoveryCliArguments([
        "--dates=2026-07-28,2026-07-23",
        "--apply",
      ]),
    ).toEqual({
      apply: true,
      dates: ["2026-07-23", "2026-07-28"],
    });
    expect(readerSummaryProductionRecoveryHistoricalDates).toEqual([
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
    ]);
    expect(parseReaderSummaryProductionRecoveryCliArguments([
      "--apply",
      "--dates=2026-07-31,2026-07-29",
    ])).toEqual({
      apply: true,
      dates: ["2026-07-29", "2026-07-31"],
    });
    expect(() => parseReaderSummaryProductionRecoveryCliArguments([
      "--apply",
      "--dates=2026-07-28,2026-07-29",
    ])).toThrow("cannot mix v2 and v3");

    for (const argv of [
      ["--apply"],
      ["--dates=2026-07-23"],
      ["--apply", "--dates=2026-07-23,2026-07-23"],
      ["--apply", "--dates=2026-07-22"],
      ["--apply", "--dates=2026-08-01"],
      ["--apply", "--dates="],
      ["--apply", "--dates=2026-07-23", "--unknown"],
    ]) {
      expect(() =>
        parseReaderSummaryProductionRecoveryCliArguments(argv),
      ).toThrow("Reader summary production recovery CLI");
    }
  });

  it("does not read authority, claim, or execute without apply", async () => {
    const claim = jest.fn();
    const executeDay = jest.fn();

    await expect(
      runReaderSummaryProductionRecovery({
        apply: false,
        dates: ["2026-07-24"],
        generationProfile,
        binding: productionRecoveryBinding(),
        executionGuard: { claim },
        executeDay,
      }),
    ).rejects.toThrow("--apply before persisted binding access");
    expect(claim).not.toHaveBeenCalled();
    expect(executeDay).not.toHaveBeenCalled();
  });

  it("claims and executes only the selected dates", async () => {
    const binding = productionRecoveryBinding();
    const calls: string[] = [];
    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      dates: ["2026-07-24", "2026-07-27"],
      generationProfile,
      binding,
      executionGuard: {
        claim: async ({ requestedUtcDate, generationProfile: actual }) => {
          expect(actual).toEqual(generationProfile);
          calls.push(`claim:${requestedUtcDate}`);
          return "execute";
        },
      },
      executeDay: async ({ requestedUtcDate }) => {
        calls.push(`model:${requestedUtcDate}`);
        return { requestedUtcDate, outcome: "published" };
      },
    });

    expect(calls).toEqual([
      "claim:2026-07-24",
      "model:2026-07-24",
      "claim:2026-07-27",
      "model:2026-07-27",
    ]);
    expect(result.plan.days.map((day) => day.requestedUtcDate)).toEqual([
      "2026-07-24",
      "2026-07-27",
    ]);
  });

  it("fails closed before claim or model when selected DB authority is incomplete", async () => {
    const binding = productionRecoveryBinding();
    const claim = jest.fn();
    const executeDay = jest.fn();

    await expect(
      runReaderSummaryProductionRecovery({
        apply: true,
        dates: ["2026-07-28"],
        generationProfile,
        binding: {
          ...binding,
          days: binding.days.filter(
            (day) => day.requestedUtcDate !== "2026-07-28",
          ) as unknown as typeof binding.days,
        },
        executionGuard: { claim },
        executeDay,
      }),
    ).rejects.toThrow(
      "authority is not exact pre-model Jul23-Jul28 scope",
    );
    expect(claim).not.toHaveBeenCalled();
    expect(executeDay).not.toHaveBeenCalled();
  });

  it("fails closed before claim or model for Jul28 77.5% dominance", async () => {
    const claim = jest.fn();
    const executeDay = jest.fn();
    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      dates: ["2026-07-28"],
      generationProfile,
      binding: productionRecoveryBinding(),
      executionGuard: { claim },
      executeDay,
    });
    expect(result.dayResults).toEqual([{
      requestedUtcDate: "2026-07-28",
      outcome: "unavailable",
      terminalStatus: "UNAVAILABLE",
    }]);
    expect(claim).not.toHaveBeenCalled();
    expect(executeDay).not.toHaveBeenCalled();
  });

  it("finalized replay performs zero model/provider calls and zero writes", async () => {
    const binding = productionRecoveryBinding();
    const claim = jest.fn<ReturnType<
      ReaderSummaryProductionRecoveryExecutionGuard["claim"]
    >, Parameters<
      ReaderSummaryProductionRecoveryExecutionGuard["claim"]
    >>().mockResolvedValue("replayed");
    const executeDay = jest.fn();
    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      dates: ["2026-07-25"],
      generationProfile,
      binding,
      executionGuard: { claim },
      executeDay,
    });

    expect(result.outcome).toBe("replayed");
    expect(claim).toHaveBeenCalledTimes(1);
    expect(executeDay).not.toHaveBeenCalled();
  });

  it("gap replay and ineligible days perform zero model/provider calls", async () => {
    const binding = exactRecoveryGapBinding();
    const claim = jest.fn().mockResolvedValue("replayed");
    const executeDay = jest.fn();
    const terminal = await runReaderSummaryProductionRecoveryGap({
      apply: true,
      dates: ["2026-07-29"],
      generationProfile: readerSummaryProductionRecoveryGenerationProfile,
      modelContract: readerSummaryProductionRecoveryModelContract,
      binding,
      executionGuard: { claim },
      executeDay,
    });
    expect(terminal.dayResults).toEqual([expect.objectContaining({
      requestedUtcDate: "2026-07-29",
      outcome: "partial",
      terminalStatus: "PARTIAL",
    })]);
    expect(claim).not.toHaveBeenCalled();
    expect(executeDay).not.toHaveBeenCalled();

    const eligible = {
      ...binding,
      days: binding.days.map((day) =>
        day.requestedUtcDate === "2026-07-29"
          ? {
              ...day,
              modelEligibility: {
                eligible: true,
                reasons: [],
                evaluatedAgainst: "immutable_db_evidence" as const,
              },
              terminalOutcome: null,
            }
          : day,
      ) as unknown as ReaderSummaryProductionRecoveryGapAuthorityBinding["days"],
    };
    claim.mockClear();
    const replay = await runReaderSummaryProductionRecoveryGap({
      apply: true,
      dates: ["2026-07-29"],
      generationProfile: readerSummaryProductionRecoveryGenerationProfile,
      modelContract: readerSummaryProductionRecoveryModelContract,
      binding: eligible,
      executionGuard: { claim },
      executeDay,
    });
    expect(replay.outcome).toBe("replayed");
    expect(claim).toHaveBeenCalledTimes(1);
    expect(executeDay).not.toHaveBeenCalled();
  });

  it("permits at most one model call for a gap date", async () => {
    const generate = jest.fn().mockResolvedValue({});
    const model = limitRecoveryModelToOneCall({
      route: jest.fn(),
      estimate: jest.fn(),
      generate,
      validateRawProviderResponse: jest.fn(),
      classifyError: jest.fn(),
    });
    await expect(model.generate({} as never, {} as never)).resolves.toEqual({});
    await expect(model.generate({} as never, {} as never)).rejects.toThrow(
      "one model call per date",
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("prevents an internal repair from making a second runtime call", async () => {
    const runTask = jest.fn().mockResolvedValue({});
    const client = limitRecoveryAgentRuntimeToOneCall({
      runTask,
      checkHealth: jest.fn(),
    });
    await expect(client.runTask({} as never)).resolves.toEqual({});
    await expect(client.runTask({} as never)).rejects.toThrow(
      "one model call per date",
    );
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("uses one deterministic recovery identity per date", () => {
    const binding = productionRecoveryBinding();
    const first = readerSummaryProductionRecoveryDayIds(
      binding,
      "2026-07-24",
    );
    expect(
      readerSummaryProductionRecoveryDayIds(binding, "2026-07-24"),
    ).toEqual(first);
    expect(
      readerSummaryProductionRecoveryDayIds(binding, "2026-07-25"),
    ).not.toEqual(first);
    expect(
      readerSummaryProductionRecoveryIdentity(binding, "2026-07-24"),
    ).toMatch(/^reader_summary\.production_recovery\.generate\.v2:[0-9a-f]{64}$/u);
  });

  it("requires exactly two byte-identical persisted dry-run plans before claim", async () => {
    const queries: string[] = [];
    const client = {
      $queryRaw: async <T>(
        strings: TemplateStringsArray,
      ): Promise<T> => {
        queries.push(strings.join("?").replace(/\s+/gu, " "));
        return [
          {
            authorityCount: 1,
            selectedDayCount: 2,
            dryRunCount: 2,
            dryRunBytesEqual: true,
            dryRunHashesEqual: true,
            dryRunAuthorityHashesEqual: true,
            dryRunBytesHashValid: true,
            authorityBytesHashValid: true,
          },
        ] as T;
      },
    };

    await expect(
      assertPersistedReaderSummaryProductionRecoveryAuthority(client, {
        scope: {
          tenantId: productionRecoveryBinding().tenantId,
          workspaceId: productionRecoveryBinding().workspaceId,
        },
        dates: ["2026-07-24", "2026-07-25"],
      }),
    ).resolves.toBeUndefined();
    expect(queries[0]).toContain(
      '"reader_summary_production_recovery_dry_runs"',
    );
    expect(queries[0]).toContain("canonical_bytes");
    expect(queries[0]).toContain(
      "2026-07-23",
    );
    expect(queries[0]).toContain(
      "2026-07-28",
    );

    const diverged = {
      $queryRaw: async <T>(): Promise<T> =>
        [
          {
            authorityCount: 1,
            selectedDayCount: 2,
            dryRunCount: 2,
            dryRunBytesEqual: false,
            dryRunHashesEqual: true,
            dryRunAuthorityHashesEqual: true,
            dryRunBytesHashValid: true,
            authorityBytesHashValid: true,
          },
        ] as unknown as T,
    };
    await expect(
      assertPersistedReaderSummaryProductionRecoveryAuthority(
        diverged,
        {
          scope: {
            tenantId: productionRecoveryBinding().tenantId,
            workspaceId: productionRecoveryBinding().workspaceId,
          },
          dates: ["2026-07-24", "2026-07-25"],
        },
      ),
    ).rejects.toThrow("byte-identical persisted pre-AI dry-run plans");

    const absentSelectedDate = {
      $queryRaw: async <T>(): Promise<T> =>
        [
          {
            authorityCount: 0,
            selectedDayCount: 0,
            dryRunCount: 0,
            dryRunBytesEqual: false,
            dryRunHashesEqual: false,
            dryRunAuthorityHashesEqual: false,
            dryRunBytesHashValid: false,
            authorityBytesHashValid: false,
          },
        ] as unknown as T,
    };
    await expect(
      assertPersistedReaderSummaryProductionRecoveryAuthority(
        absentSelectedDate,
        {
          scope: {
            tenantId: productionRecoveryBinding().tenantId,
            workspaceId: productionRecoveryBinding().workspaceId,
          },
          dates: ["2026-07-28"],
        },
      ),
    ).rejects.toThrow("byte-identical persisted pre-AI dry-run plans");
  });

  it("loads immutable DB authority without provider recollection or writes", async () => {
    const binding = productionRecoveryBinding();
    const queries: string[] = [];
    const client = {
      $queryRaw: async <T>(
        strings: TemplateStringsArray,
      ): Promise<T> => {
        queries.push(strings.join("?").replace(/\s+/gu, " "));
        return [
          {
            requestHash: binding.canonicalSha256,
            responsePayload: binding,
          },
        ] as unknown as T;
      },
    };

    await expect(
      loadPersistedReaderSummaryProductionRecoveryAuthority(client, {
        tenantId: binding.tenantId,
        workspaceId: binding.workspaceId,
      }),
    ).resolves.toEqual(binding);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain(
      '"reader_summary_production_recovery_days"',
    );
    expect(queries[0]).not.toContain('"feed_items"');
    expect(queries[0]).not.toContain("INSERT");
    expect(queries[0]).not.toContain("UPDATE");
  });
});
