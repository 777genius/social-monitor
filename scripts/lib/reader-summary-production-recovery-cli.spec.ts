import type {
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReaderSummaryProductionRecoveryAuthorityHandle,
  ReaderSummaryProductionRecoveryAuthorityPort,
} from "@social-monitor/summary/ports";

import {
  runReaderSummaryProductionRecovery,
  type ReaderSummaryProductionRecoveryDayExecutor,
} from "./reader-summary-production-recovery-cli";

describe("reader summary production recovery CLI wrapper", () => {
  it("requires explicit apply before durable authority preparation", async () => {
    const authority = authorityPort("prepared");
    const executeDay = jest.fn();

    await expect(
      runReaderSummaryProductionRecovery({
        apply: false,
        authority,
        executeDay,
      }),
    ).rejects.toThrow("requires --apply");
    expect(authority.prepare).not.toHaveBeenCalled();
    expect(executeDay).not.toHaveBeenCalled();
  });

  it("short-circuits replay before provider, model, or write execution", async () => {
    const authority = authorityPort("replayed");
    const executeDay = jest.fn();

    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      authority,
      executeDay,
    });

    expect(result.outcome).toBe("replayed");
    expect(result.dayResults).toEqual([
      { requestedUtcDate: "2026-07-23", outcome: "skipped" },
      { requestedUtcDate: "2026-07-24", outcome: "skipped" },
    ]);
    expect(executeDay).not.toHaveBeenCalled();
  });

  it("executes each exact recovery date once after a fresh authority prepare", async () => {
    const authority = authorityPort("prepared");
    const executeDay: jest.MockedFunction<ReaderSummaryProductionRecoveryDayExecutor> =
      jest.fn(async ({ requestedUtcDate }) => ({
        requestedUtcDate,
        outcome: "published",
        readerSummaryJobId: `job-${requestedUtcDate}`,
        readerSummaryId: `artifact-${requestedUtcDate}`,
      }));

    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      authority,
      executeDay,
    });

    expect(result.outcome).toBe("applied");
    expect(executeDay).toHaveBeenCalledTimes(2);
    expect(executeDay.mock.calls.map((call) => call[0].requestedUtcDate)).toEqual([
      "2026-07-23",
      "2026-07-24",
    ]);
    expect(result.dayResults.map((day) => day.readerSummaryId)).toEqual([
      "artifact-2026-07-23",
      "artifact-2026-07-24",
    ]);
  });
});

function authorityPort(
  outcome: "prepared" | "replayed",
): jest.Mocked<ReaderSummaryProductionRecoveryAuthorityPort> {
  const handle = {} as ReaderSummaryProductionRecoveryAuthorityHandle;
  return {
    prepare: jest.fn(async () => ({ outcome, authority: handle })),
    readVerifiedBinding: jest.fn(() => bindingFixture()),
  };
}

function bindingFixture(): ReaderSummaryProductionRecoveryAuthorityBinding {
  return {
    schemaVersion: "reader_summary.production_recovery_authority.v1",
    recoveryId: "33333333-3333-4333-8333-333333333333",
    identity: "reader_summary.production_recovery.v1:fixture",
    tenantId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    requestedUtcDates: ["2026-07-23", "2026-07-24"],
    canonicalSha256: "a".repeat(64),
    dryRunCanonicalSha256s: ["a".repeat(64), "a".repeat(64)],
    lease: {
      state: "CONSUMED",
      issuedAt: "2026-07-25T00:00:00.000Z",
      consumedAt: "2026-07-25T00:00:01.000Z",
    },
    boundaries: {
      stage: "pre_model",
      modelCallPerformed: false,
      publicationPerformed: false,
      recollectionPerformed: false,
    },
    days: [
      day("2026-07-23", [0, 100, 100, 75, 67], "historical_unavailable"),
      day("2026-07-24", [10, 100, 100, 67, 73], "verified_existing"),
    ],
  };
}

function day(
  date: "2026-07-23" | "2026-07-24",
  counts: readonly [number, number, number, number, number],
  githubMode: "historical_unavailable" | "verified_existing",
): ReaderSummaryProductionRecoveryAuthorityBinding["days"][number] {
  const providerKeys = [
    "github-trending-page",
    "hacker-news",
    "reddit",
    "rss",
    "x-twitter",
  ] as const;
  const providerEvidence = Object.fromEntries(
    providerKeys.map((providerKey, providerIndex) => [
      providerKey,
      Array.from({ length: counts[providerIndex] }, (_, index) => ({
        providerKey,
        feedItemId: `20000000-0000-4000-8000-${providerIndex + 1}${String(index + 1).padStart(11, "0")}`,
        sourceItemId: `10000000-0000-4000-8000-${providerIndex + 1}${String(index + 1).padStart(11, "0")}`,
        sourceBindingId: `30000000-0000-4000-8000-${String(providerIndex + 1).padStart(12, "0")}`,
        providerItemId: `recovery:${date}:${providerKey}:${index + 1}`,
        canonicalUrl: `https://fixture.invalid/${date}/${providerKey}/${index + 1}`,
        sourceContentHash: "1".repeat(64),
        sourceProviderContentHash:
          providerKey === "github-trending-page" ? "2".repeat(64) : null,
        publishedAt: `${date}T12:00:00.000Z`,
        observedAt: `${date}T12:00:00.000Z`,
        ...(providerKey === "github-trending-page"
          ? {
              github: {
                resultId: `80000000-0000-4000-8000-${providerIndex + 1}${String(index + 1).padStart(11, "0")}`,
                scanJobId: "70000000-0000-4000-8000-000000000001",
                scanAttemptNumber: 1,
                repositoryIdentity: `owner/repo-${index + 1}`,
                rank: index + 1,
                checkedAt: `${date}T12:00:00.000Z`,
              },
            }
          : {}),
      })),
    ]),
  ) as ReaderSummaryProductionRecoveryAuthorityBinding["days"][number]["providerEvidence"];
  return {
    schemaVersion: "reader_summary.production_recovery_day.v1",
    identity: `reader_summary.production_recovery_day.v1:${date}`,
    requestedUtcDate: date,
    period: {
      startedAt: `${date}T00:00:00.000Z`,
      endedAt:
        date === "2026-07-23"
          ? "2026-07-24T00:00:00.000Z"
          : "2026-07-25T00:00:00.000Z",
      timezone: "UTC",
    },
    providerCounts: providerKeys.map((providerKey, index) => ({
      providerKey,
      count: counts[index],
    })),
    providerEvidence,
    providerEvidenceSha256: "b".repeat(64),
    githubEvidence:
      githubMode === "historical_unavailable"
        ? {
            schemaVersion:
              "reader_summary.production_recovery_github_evidence.v1",
            mode: "historical_unavailable",
            providerKey: "github-trending-page",
            requestedUtcDate: "2026-07-23",
            evidenceCount: 0,
            authorization: {
              authorizationId:
                "reader_summary.production_recovery.github.2026-07-23.v1",
              authorizedAt: "2026-07-25T00:00:00.000Z",
              reason:
                "Historical GitHub trending evidence was not collected for this UTC day; this one reviewed recovery authorizes an explicit unavailable marker and no substitute data.",
            },
          }
        : {
            schemaVersion:
              "reader_summary.production_recovery_github_evidence.v1",
            mode: "verified_existing",
            providerKey: "github-trending-page",
            requestedUtcDate: "2026-07-24",
            evidenceCount: 10,
            evidenceSha256: "c".repeat(64),
            scanJobIds: ["70000000-0000-4000-8000-000000000001"],
          },
    canonicalSha256: "d".repeat(64),
  };
}
