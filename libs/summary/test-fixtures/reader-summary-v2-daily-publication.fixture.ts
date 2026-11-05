import type { JsonObject } from "@social-monitor/shared-kernel";

import { authoritativeReaderSummaryProviderMetadata } from
  "./reader-summary-authoritative-provider-metadata.fixture";

export type ReaderSummaryV2DailyPublicationCandidate = {
  readonly id: string;
  readonly providerKey: "x-twitter" | "reddit" | "hacker-news";
  readonly providerMetadata: JsonObject;
  readonly title: string;
  readonly body: string;
};

export const readerSummaryV2DailyPublicationCandidates = (
): readonly ReaderSummaryV2DailyPublicationCandidate[] => [
  candidate("aster-compiler", "x-twitter", 9_000,
    "Aster compiler isolates macro evaluation checkpoints",
    "The compiler release isolates macro state during repeatable builds."),
  candidate("boreal-database", "reddit", 800,
    "Boreal database publishes failover receipts for AI agents",
    "The database records durable receipts for coding-agent failover."),
  candidate("cinder-runtime", "hacker-news", 700,
    "Cinder runtime introduces deterministic coding-agent task replay",
    "The runtime replays AI developer tasks from verified checkpoints."),
  candidate("drift-api", "x-twitter", 8_000,
    "Drift API binds audit exports to stable cursors",
    "The API release binds every audit export to a pagination cursor."),
  candidate("ember-storage", "reddit", 700,
    "Ember storage rejects stale AI model snapshot restoration",
    "The storage engine protects developer tools from stale model state."),
  candidate("fjord-sdk", "hacker-news", 600,
    "Fjord SDK adds typed failures for developer tools",
    "The SDK gives AI coding integrations bounded retry outcomes."),
  candidate("grove-cache", "x-twitter", 7_000,
    "Grove cache records workspace generation leases",
    "The cache prevents late generation writes after workspace changes."),
  candidate("harbor-cli", "reddit", 600,
    "Harbor CLI previews scoped AI coding dependency upgrades",
    "The developer tool keeps dependency changes inside one workspace."),
  candidate("ion-scheduler", "hacker-news", 500,
    "Ion scheduler caps concurrent coding-agent recovery batches",
    "The AI agent scheduler limits recovery while other jobs keep running."),
  candidate("juniper-proxy", "x-twitter", 6_000,
    "Juniper proxy verifies outbound redirect destinations",
    "The proxy validates every redirect before making an outbound request."),
];

export type ReaderSummaryV2DailyGitHubBoardCandidate = {
  readonly id: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly canonicalUrl: string;
  readonly repositoryFullName: string;
  readonly rank: number;
  readonly starsGained: number;
  readonly checkedAt: Date;
  readonly observedAt: Date;
  readonly providerMetadata: JsonObject;
};

export const readerSummaryV2DailyGitHubBoardCandidates = (
): readonly ReaderSummaryV2DailyGitHubBoardCandidate[] =>
  Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    const repositoryFullName = `fixture-ai/reliable-tool-${rank}`;
    const checkedAt = new Date("2026-08-30T14:00:00.000Z");
    return {
      id: `github-daily-${rank}`,
      sourceItemId: `github-daily-source-${rank}`,
      sourceBindingId: "binding-github-trending-daily",
      canonicalUrl: `https://github.com/${repositoryFullName}`,
      repositoryFullName,
      rank,
      starsGained: rank <= 3 ? 1_200 - rank * 10 : 200 - rank,
      checkedAt,
      observedAt: new Date("2026-08-30T14:05:00.000Z"),
      providerMetadata: {
        kind: "github_trending_page_repository",
        repository: {
          fullName: repositoryFullName,
          totalStars: 20_000 - rank,
          forksCount: 500,
        },
        trending: {
          rank,
          starsGained: rank <= 3 ? 1_200 - rank * 10 : 200 - rank,
          window: "daily",
        },
      },
    };
  });

const candidate = (
  id: string,
  providerKey: ReaderSummaryV2DailyPublicationCandidate["providerKey"],
  signal: number,
  title: string,
  body: string,
): ReaderSummaryV2DailyPublicationCandidate => ({
  id,
  providerKey,
  providerMetadata: authoritativeReaderSummaryProviderMetadata(
    providerKey,
    signal,
  ),
  title,
  body,
});
