import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  buildGitHubTrendingNarrativeAppendix,
  githubTrendingStarsGained,
  selectGitHubTrendingHighlights,
  withGitHubTrendingNarrativeAppendix,
} from "./reader-summary-github-trending-policy";

describe("reader summary GitHub Trending policy", () => {
  it("keeps at most three repositories with more than 1,000 gained stars", () => {
    const selected = selectGitHubTrendingHighlights([
      evidence("repo-low", 999),
      evidence("repo-boundary", 1_000),
      evidence("repo-third", 1_050),
      evidence("repo-first", 4_200),
      evidence("repo-fourth", 1_001),
      evidence("repo-second", 2_500),
      evidence("reddit", 50_000, "reddit"),
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
    const item = evidence("owner/repo - useful developer tool", 1_234);

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
      value: `#1, +${starsGained.toLocaleString("en-US")} stars today`,
    },
    { label: "Stars", value: "500,000" },
  ],
});
