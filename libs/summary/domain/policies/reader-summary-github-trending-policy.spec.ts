import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  buildGitHubTrendingNarrativeAppendix,
  githubTrendingRank,
  githubTrendingStarsGained,
  selectGitHubTrendingDisplayRepositories,
  selectGitHubTrendingHighlights,
  selectGitHubTrendingSupplementalEvidence,
  withGitHubTrendingNarrativeAppendix,
} from "./reader-summary-github-trending-policy";

describe("reader summary GitHub Trending policy", () => {
  it("keeps at most three repositories with more than 1,000 gained stars", () => {
    const selected = selectGitHubTrendingHighlights([
      evidence("repo-top-ten", 50_000, "github-trending-page", 1),
      evidence("repo-low", 999, "github-trending-page", 11),
      evidence("repo-boundary", 1_000, "github-trending-page", 12),
      evidence("repo-third", 1_050, "github-trending-page", 13),
      evidence("repo-first", 4_200, "github-trending-page", 14),
      evidence("repo-fourth", 1_001, "github-trending-page", 15),
      evidence("repo-second", 2_500, "github-trending-page", 16),
      evidence("reddit", 50_000, "reddit", 17),
    ]);

    expect(selected.map((item) => item.feedItemId)).toEqual([
      "repo-first",
      "repo-second",
      "repo-third",
    ]);
  });

  it("reads comma-formatted stars gained without confusing total stars", () => {
    const item = {
      ...evidence("repo", 3_703),
      providerMetricLabels: [
        { label: "GitHub Trending today", value: "#1, +3,703 stars today" },
        { label: "Stars", value: "18,398" },
      ],
    };

    expect(githubTrendingStarsGained(item)).toBe(3_703);
    expect(githubTrendingRank(item)).toBe(1);
  });

  it("selects exactly the first ten repositories in GitHub rank order", () => {
    const items = [12, 2, 10, 1, 8, 5, 11, 4, 9, 3, 7, 6].map((rank) => ({
      ...evidence(`repo-${rank}`, 100 + rank, "github-trending-page", rank),
      observedAt: new Date(Date.UTC(2026, 6, 10, 12, 0, rank)),
    }));

    expect(
      selectGitHubTrendingDisplayRepositories(items).map(
        (item) => item.feedItemId,
      ),
    ).toEqual([
      "repo-1",
      "repo-2",
      "repo-3",
      "repo-4",
      "repo-5",
      "repo-6",
      "repo-7",
      "repo-8",
      "repo-9",
      "repo-10",
    ]);
  });

  it("keeps high-momentum appendix evidence outside the display top ten", () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      evidence(
        `repo-${index + 1}`,
        index === 11 ? 1_500 : 100,
        "github-trending-page",
        index + 1,
      ),
    );

    expect(
      selectGitHubTrendingSupplementalEvidence(items).map(
        (item) => item.feedItemId,
      ),
    ).toEqual([
      "repo-1",
      "repo-2",
      "repo-3",
      "repo-4",
      "repo-5",
      "repo-6",
      "repo-7",
      "repo-8",
      "repo-9",
      "repo-10",
      "repo-12",
    ]);
  });

  it("keeps safe Top 10 entries despite generic eligibility and filters ineligible Watch entries", () => {
    const ineligibleForSummary = {
      qualityScore: 0,
      interestRelevanceScore: 0,
      engagementIntegrityScore: 1,
      eligibleForSummary: false,
      eligibleForTopRead: false,
      needsLlmReview: false,
      decision: "excluded",
      flags: ["generic_summary_exclusion"],
      reason: "Generic editorial eligibility does not govern the native board.",
    };
    const topTen = {
      ...evidence("repo-1", 100, "github-trending-page", 1),
      contentQuality: ineligibleForSummary,
    };
    const watch = {
      ...evidence("repo-11", 1_001, "github-trending-page", 11),
      contentQuality: ineligibleForSummary,
    };

    expect(selectGitHubTrendingDisplayRepositories([topTen, watch])).toEqual([
      topTen,
    ]);
    expect(selectGitHubTrendingHighlights([topTen, watch])).toEqual([]);
  });

  it("deduplicates snapshots and recovers the strongest multi-scope rank", () => {
    const olderDuplicate = {
      ...evidence("repo-duplicate-old", 200, "github-trending-page", 1),
      canonicalUrl: "https://github.com/owner/duplicate",
      observedAt: new Date("2026-07-10T12:00:00.000Z"),
    };
    const latestDuplicate = {
      ...evidence("repo-duplicate-latest", 300, "github-trending-page", 2),
      canonicalUrl: "https://github.com/owner/duplicate",
      observedAt: new Date("2026-07-10T13:00:00.000Z"),
    };
    const ambiguousRank = {
      ...evidence("repo-other-at-rank-2", 100, "github-trending-page", 2),
      observedAt: new Date("2026-07-10T13:00:00.000Z"),
    };
    const rankThree = {
      ...evidence("repo-3", 100, "github-trending-page", 3),
      observedAt: new Date("2026-07-10T13:00:00.000Z"),
    };

    expect(
      selectGitHubTrendingDisplayRepositories([
        olderDuplicate,
        latestDuplicate,
        ambiguousRank,
        rankThree,
      ]).map((item) => item.feedItemId),
    ).toEqual(["repo-duplicate-latest", "repo-3"]);
  });

  it("rejects non-daily Trending windows", () => {
    const item = {
      ...evidence("repo", 3_703),
      providerMetricLabels: [
        {
          label: "GitHub Trending this week",
          value: "#1, +3,703 stars this week",
        },
      ],
    };

    expect(githubTrendingStarsGained(item)).toBeUndefined();
  });

  it("builds a compact deterministic appendix from cited highlights", () => {
    const item = evidence(
      "owner/repo - useful developer tool",
      1_234,
      "github-trending-page",
      11,
    );

    expect(
      buildGitHubTrendingNarrativeAppendix({
        evidence: [item],
        citations: [
          {
            citationId: "c9",
            feedItemId: item.feedItemId,
            sourceItemId: item.sourceItemId,
            providerKey: item.providerKey,
            field: "canonicalUrl",
            canonicalUrl: item.canonicalUrl,
          },
        ],
      }),
    ).toEqual({
      id: "github-trending",
      kind: "watch",
      title: "GitHub Trending",
      text: "- **owner/repo**: +1,234 stars today.",
      citationIds: ["c9"],
    });
  });

  it("replaces an existing deterministic appendix instead of duplicating it", () => {
    const staleAppendix = {
      id: "github-trending",
      kind: "watch" as const,
      title: "GitHub Trending",
      text: "Stale repository list.",
      citationIds: ["old-citation"],
    };
    const currentAppendix = {
      ...staleAppendix,
      text: "Current repository list.",
      citationIds: ["current-citation"],
    };

    expect(
      withGitHubTrendingNarrativeAppendix({
        narrativeSections: [
          {
            id: "lead",
            kind: "lead",
            title: "Lead",
            text: "Primary summary.",
            citationIds: ["lead-citation"],
          },
          staleAppendix,
        ],
        appendix: currentAppendix,
      }),
    ).toEqual([
      expect.objectContaining({ id: "lead" }),
      expect.objectContaining({
        id: "github-trending",
        text: "Current repository list.",
      }),
    ]);
  });
});

const evidence = (
  feedItemId: string,
  starsGained: number,
  providerKey = "github-trending-page",
  rank = 1,
): SummaryEvidenceItem => ({
  feedItemId,
  sourceItemId: `source-${feedItemId}`,
  sourceBindingId: `binding-${providerKey}`,
  interestId: "interest-ai",
  providerKey,
  canonicalUrl: `https://example.test/${feedItemId}`,
  title: feedItemId,
  publishedAt: new Date("2026-07-10T12:00:00.000Z"),
  observedAt: new Date("2026-07-10T12:05:00.000Z"),
  score: 1,
  whyImportant: [],
  providerMetricLabels: [
    {
      label: "GitHub Trending today",
      value: `#${rank}, +${starsGained.toLocaleString("en-US")} stars today`,
    },
    { label: "Stars", value: "500,000" },
  ],
});
