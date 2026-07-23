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
      evidence("repo-low", 999, "github-trending-page", 1),
      evidence("repo-boundary", 1_000, "github-trending-page", 2),
      evidence("repo-first", 4_200, "github-trending-page", 3),
      evidence("repo-second", 2_500, "github-trending-page", 4),
      evidence("repo-third", 1_050, "github-trending-page", 5),
      evidence("repo-fourth", 1_001, "github-trending-page", 6),
      evidence("repo-eleven", 50_000, "github-trending-page", 11),
      evidence("reddit", 50_000, "reddit", 7),
    ]);

    expect(selected.map((item) => item.feedItemId)).toEqual([
      "repo-first",
      "repo-second",
      "repo-third",
    ]);
  });

  it("deduplicates normalized repository snapshots before top-three selection", () => {
    const strongestSnapshot = {
      ...evidence("build-your-own-x-strong", 1_126, undefined, 1),
      canonicalUrl:
        "https://github.com/Codecrafters-io/build-your-own-x/?ref=daily",
      title: "codecrafters-io/build-your-own-x",
      observedAt: new Date("2026-07-18T11:00:00.000Z"),
    };
    const currentWeakerSnapshot = {
      ...evidence("build-your-own-x-current", 1_068, undefined, 2),
      canonicalUrl:
        "https://github.com/codecrafters-io/build-your-own-x.git",
      title: "codecrafters-io/build-your-own-x",
      observedAt: new Date("2026-07-18T12:00:00.000Z"),
    };
    const olderEqualSnapshot = {
      ...evidence("equal-old", 1_100, undefined, 3),
      canonicalUrl: "https://github.com/example/equal-repo",
      observedAt: new Date("2026-07-18T10:00:00.000Z"),
    };
    const currentEqualSnapshot = {
      ...evidence("equal-current", 1_100, undefined, 3),
      canonicalUrl: "https://github.com/example/equal-repo/",
      observedAt: new Date("2026-07-18T12:00:00.000Z"),
    };
    const thirdRepository = evidence("third-repository", 1_050, undefined, 4);
    const fourthRepository = evidence(
      "fourth-repository",
      1_040,
      undefined,
      5,
    );

    const selected = selectGitHubTrendingHighlights([
      currentWeakerSnapshot,
      fourthRepository,
      olderEqualSnapshot,
      strongestSnapshot,
      thirdRepository,
      currentEqualSnapshot,
    ]);

    expect(selected.map((item) => item.feedItemId)).toEqual([
      "build-your-own-x-current",
      "equal-current",
      "third-repository",
    ]);
    const appendix = buildGitHubTrendingNarrativeAppendix({
      evidence: [
        currentWeakerSnapshot,
        fourthRepository,
        olderEqualSnapshot,
        strongestSnapshot,
        thirdRepository,
        currentEqualSnapshot,
      ],
      citations: [
        currentWeakerSnapshot,
        fourthRepository,
        olderEqualSnapshot,
        strongestSnapshot,
        thirdRepository,
        currentEqualSnapshot,
      ].map((item) => ({
        citationId: `citation-${item.feedItemId}`,
        feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId,
        providerKey: item.providerKey,
        field: "canonicalUrl" as const,
        canonicalUrl: item.canonicalUrl,
      })),
    });

    expect(appendix?.text).toContain(
      "codecrafters-io/build-your-own-x** (#2): +1,068 stars today",
    );
    expect(appendix?.text).not.toContain("+1,126 stars today");
    expect(appendix?.citationIds).toEqual([
      "citation-build-your-own-x-current",
      "citation-equal-current",
      "citation-third-repository",
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

  it("excludes rank 11 from supplemental evidence regardless of momentum", () => {
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
    ]);
  });

  it("uses only native Top 10 and momentum admission for Watch", () => {
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
      ...evidence("repo-1", 1_001, "github-trending-page", 1),
      contentQuality: ineligibleForSummary,
    };
    const watch = {
      ...evidence("repo-11", 1_001, "github-trending-page", 11),
      contentQuality: ineligibleForSummary,
    };

    expect(selectGitHubTrendingDisplayRepositories([topTen, watch])).toEqual([
      topTen,
    ]);
    expect(selectGitHubTrendingHighlights([topTen, watch])).toEqual([topTen]);
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

  it("uses only the latest scan group without filling gaps from history", () => {
    const older = [1, 2, 3].map((rank) => ({
      ...evidence(`old-${rank}`, 1_500, "github-trending-page", rank),
      publishedAt: new Date("2026-07-10T12:00:00.000Z"),
      observedAt: new Date("2026-07-10T12:05:00.000Z"),
    }));
    const latest = [1, 3].map((rank) => ({
      ...evidence(`latest-${rank}`, 1_500, "github-trending-page", rank),
      publishedAt: new Date("2026-07-10T13:00:00.000Z"),
      observedAt: new Date("2026-07-10T13:05:00.000Z"),
    }));

    expect(
      selectGitHubTrendingDisplayRepositories([...older, ...latest]).map(
        (item) => item.feedItemId,
      ),
    ).toEqual(["latest-1", "latest-3"]);
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
    const item = {
      ...evidence(
        "owner/repo - useful developer tool",
        1_234,
        "github-trending-page",
        1,
      ),
      canonicalUrl: "https://github.com/owner/repo",
      title: "attacker/forged-repository",
    };

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
      text: "- **owner/repo** (#1): +1,234 stars today.",
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
  canonicalUrl: `https://github.com/fixture/${feedItemId.replace(/[^A-Za-z0-9_.-]/gu, "-")}`,
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
