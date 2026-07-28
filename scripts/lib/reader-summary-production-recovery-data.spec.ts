import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type {
  ReaderSummaryGitHubProjectionReaderPort,
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReaderSummaryProductionRecoveryDayAuthority,
  ReaderSummaryProductionRecoveryEvidence,
  ReaderSummaryProductionRecoveryProviderKey,
} from "@social-monitor/summary/ports";

import {
  buildReaderSummaryProductionRecoveryPlan,
  buildRecoveryEvidenceSelection,
} from "./reader-summary-production-recovery-data";

describe("reader summary production recovery data", () => {
  it("summarizes the exact Jul23 and Jul24 authority scope", () => {
    const plan = buildReaderSummaryProductionRecoveryPlan(bindingFixture());

    expect(plan.dryRunCanonicalSha256s).toEqual([
      "a".repeat(64),
      "a".repeat(64),
    ]);
    expect(plan.days).toMatchObject([
      {
        requestedUtcDate: "2026-07-23",
        totalEvidenceCount: 345,
        primaryEvidenceCount: 345,
        githubEvidenceCount: 0,
        githubMode: "historical_unavailable",
      },
      {
        requestedUtcDate: "2026-07-24",
        totalEvidenceCount: 351,
        primaryEvidenceCount: 341,
        githubEvidenceCount: 10,
        githubMode: "verified_existing",
      },
    ]);
  });

  it("binds Jul24 GitHub supplemental rows to existing projection data", async () => {
    const binding = bindingFixture();
    const feedItems = feedItemsFor(binding);
    const githubProjectionReader = githubProjectionReaderFor(binding);

    const selection = await buildRecoveryEvidenceSelection({
      binding,
      requestedUtcDate: "2026-07-24",
      maxPrimaryEvidenceItems: 12,
      feedItems,
      githubProjectionReader,
      clock: { now: () => new Date("2026-07-25T01:00:00.000Z") },
    });
    const github = selection.selectedEvidence.filter(
      (item) => item.providerKey === "github-trending-page",
    );

    expect(github).toHaveLength(10);
    expect(github.every((item) => item.contentQuality?.eligibleForSummary === false)).toBe(true);
    expect(github.every((item) => item.contentQuality?.eligibleForTopRead === false)).toBe(true);
    expect(selection.clusters.some((cluster) => cluster.providerKeys.includes("github-trending-page"))).toBe(false);
  });

  it("fails closed when Jul24 projection lacks full verified metadata", async () => {
    const binding = bindingFixture();
    const githubProjectionReader = githubProjectionReaderFor(binding, {
      omitFetchStartedAt: true,
    });

    await expect(
      buildRecoveryEvidenceSelection({
        binding,
        requestedUtcDate: "2026-07-24",
        maxPrimaryEvidenceItems: 2,
        feedItems: feedItemsFor(binding),
        githubProjectionReader,
        clock: { now: () => new Date("2026-07-25T01:00:00.000Z") },
      }),
    ).rejects.toThrow("GitHub projection diverged from authority");
  });
});

const tenantId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const recoveryId = "33333333-3333-4333-8333-333333333333";
const providers = [
  "github-trending-page",
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
] as const;

function bindingFixture(): ReaderSummaryProductionRecoveryAuthorityBinding {
  const jul23 = dayFixture("2026-07-23", {
    "github-trending-page": 0,
    "hacker-news": 100,
    reddit: 100,
    rss: 78,
    "x-twitter": 67,
  });
  const jul24 = dayFixture("2026-07-24", {
    "github-trending-page": 10,
    "hacker-news": 100,
    reddit: 100,
    rss: 68,
    "x-twitter": 73,
  });
  return {
    schemaVersion: "reader_summary.production_recovery_authority.v1",
    recoveryId,
    identity: "reader_summary.production_recovery.v1:fixture",
    tenantId,
    workspaceId,
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
    days: [jul23, jul24],
  };
}

function dayFixture(
  date: "2026-07-23" | "2026-07-24",
  counts: Record<ReaderSummaryProductionRecoveryProviderKey, number>,
): ReaderSummaryProductionRecoveryDayAuthority {
  const providerEvidence = Object.fromEntries(
    providers.map((providerKey) => [
      providerKey,
      Array.from({ length: counts[providerKey] }, (_, index) =>
        evidenceFixture(date, providerKey, index + 1),
      ),
    ]),
  ) as ReaderSummaryProductionRecoveryDayAuthority["providerEvidence"];
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
    providerCounts: providers.map((providerKey) => ({
      providerKey,
      count: counts[providerKey],
    })),
    providerEvidence,
    providerEvidenceSha256: "b".repeat(64),
    githubEvidence:
      date === "2026-07-23"
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

function evidenceFixture(
  date: "2026-07-23" | "2026-07-24",
  providerKey: ReaderSummaryProductionRecoveryProviderKey,
  index: number,
): ReaderSummaryProductionRecoveryEvidence {
  const suffix = `${providerIndex(providerKey)}${String(index).padStart(11, "0")}`;
  const publishedAt = `${date}T12:00:00.${String(index).padStart(3, "0")}Z`;
  return {
    providerKey,
    feedItemId: `20000000-0000-4000-8000-${suffix}`,
    sourceItemId: `10000000-0000-4000-8000-${suffix}`,
    sourceBindingId: `30000000-0000-4000-8000-${String(providerIndex(providerKey)).padStart(12, "0")}`,
    providerItemId: `recovery:${date}:${providerKey}:${index}`,
    canonicalUrl:
      providerKey === "github-trending-page"
        ? `https://github.com/owner/repo-${index}`
        : `https://fixture.invalid/${date}/${providerKey}/${index}`,
    sourceContentHash: "1".repeat(64),
    sourceProviderContentHash:
      providerKey === "github-trending-page" ? "2".repeat(64) : null,
    publishedAt,
    observedAt: publishedAt,
    ...(providerKey === "github-trending-page"
      ? {
          github: {
            resultId: `80000000-0000-4000-8000-${suffix}`,
            scanJobId: "70000000-0000-4000-8000-000000000001",
            scanAttemptNumber: 1,
            repositoryIdentity: `owner/repo-${index}`,
            rank: index,
            checkedAt: publishedAt,
          },
        }
      : {}),
  };
}

function feedItemsFor(
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
): FeedItemReadRepositoryPort {
  const rows = new Map(
    binding.days
      .flatMap((day) =>
        providers.flatMap((providerKey) => day.providerEvidence[providerKey]),
      )
      .map((row) => [row.feedItemId, row] as const),
  );
  return {
    async list() {
      return { items: [] };
    },
    async findById(query) {
      const row = rows.get(query.feedItemId);
      return row === undefined
        ? null
        : {
            toSnapshot: () => ({
              id: row.feedItemId,
              tenantId,
              workspaceId,
              interestId: "interest-recovery",
              sourceItemId: row.sourceItemId,
              sourceBindingId: row.sourceBindingId,
              providerKey: row.providerKey,
              canonicalUrl: row.canonicalUrl,
              title: `Title for ${row.providerItemId}`,
              bodyPreview: `Body for ${row.providerItemId}`,
              publishedAt: new Date(row.publishedAt),
              observedAt: new Date(row.observedAt),
            }),
          };
    },
    async readSourceContent(query) {
      return query.feedItemIds.map((feedItemId) => ({
        feedItemId,
        sourceItemId: rows.get(feedItemId)?.sourceItemId ?? "",
        body: `Source body for ${feedItemId}`,
      }));
    },
  };
}

function githubProjectionReaderFor(
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  options: { omitFetchStartedAt?: boolean } = {},
): ReaderSummaryGitHubProjectionReaderPort {
  const rows = binding.days[1].providerEvidence["github-trending-page"];
  return {
    async read() {
      return {
        eligibleBindingIds: [
          "30000000-0000-4000-8000-000000000001",
        ],
        pageCount: 2,
        items: rows.map((row) => ({
          feedItemId: row.feedItemId,
          sourceItemId: row.sourceItemId,
          sourceBindingId: row.sourceBindingId,
          providerKey: row.providerKey,
          metadataKind: "github_trending_page_repository",
          scanJobId: row.github!.scanJobId,
          canonicalUrl: row.canonicalUrl,
          repositoryFullName: row.github!.repositoryIdentity,
          rank: row.github!.rank,
          starsGained: 100 + row.github!.rank,
          window: "daily",
          ...(options.omitFetchStartedAt
            ? {}
            : {
                fetchStartedAt: new Date(
                  Date.parse(row.github!.checkedAt) - 60_000,
                ),
              }),
          checkedAt: new Date(row.github!.checkedAt),
          publishedAt: new Date(row.publishedAt),
          observedAt: new Date(row.observedAt),
          sourceContentHash: row.sourceContentHash,
          sourceProviderContentHash: row.sourceProviderContentHash ?? "",
        })),
      };
    },
  };
}

function providerIndex(
  providerKey: ReaderSummaryProductionRecoveryProviderKey,
): number {
  return providers.indexOf(providerKey) + 1;
}
