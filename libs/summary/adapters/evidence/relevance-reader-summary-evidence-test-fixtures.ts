import type { Clock } from "@social-monitor/shared-kernel";

import type { ReaderSummaryPeriod } from "../../domain";

export const readerSummaryEvidenceTestClock: Clock = {
  now: () => new Date("2026-06-23T12:00:00.000Z"),
};

export const readerSummaryEvidenceTestPeriod: ReaderSummaryPeriod = {
  cadence: "daily",
  startedAt: new Date("2026-06-23T00:00:00.000Z"),
  endedAt: new Date("2026-06-24T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
};

export const githubTrendingMetadataFixture = (starsGained: number) => ({
  kind: "github_trending_page_repository",
  repository: {
    fullName: "owner/repository",
    totalStars: 20_000,
    forksCount: 500,
  },
  trending: { rank: 1, starsGained, window: "daily" },
});
