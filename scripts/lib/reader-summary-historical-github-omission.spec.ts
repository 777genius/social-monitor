import type { SummaryEvidenceSelection } from "@social-monitor/summary/domain";

import {
  omitGitHubEvidence,
  resolveHistoricalGitHubOmission,
} from "./reader-summary-historical-github-omission";

describe("historical GitHub omission", () => {
  it("requires an explicit flag and reason for one completed UTC day", () => {
    const authorizedAt = new Date("2026-07-20T22:00:00.000Z");
    expect(
      resolveHistoricalGitHubOmission({
        argv: ["--allow-historical-github-omission"],
        reason: "No timestamp-valid GitHub snapshot exists.",
        cadence: "daily",
        timezone: "UTC",
        periodStartedAt: new Date("2026-07-19T00:00:00.000Z"),
        periodEndedAt: new Date("2026-07-20T00:00:00.000Z"),
        now: authorizedAt,
      }),
    ).toEqual({
      reason: "No timestamp-valid GitHub snapshot exists.",
      authorizedAt,
    });
  });

  it("fails closed for incomplete or current-day authorization", () => {
    const input = {
      argv: [] as string[],
      reason: "No timestamp-valid GitHub snapshot exists.",
      cadence: "daily",
      timezone: "UTC",
      periodStartedAt: new Date("2026-07-20T00:00:00.000Z"),
      periodEndedAt: new Date("2026-07-21T00:00:00.000Z"),
      now: new Date("2026-07-20T22:00:00.000Z"),
    };
    expect(() => resolveHistoricalGitHubOmission(input)).toThrow(
      "requires both",
    );
    expect(() =>
      resolveHistoricalGitHubOmission({
        ...input,
        argv: ["--allow-historical-github-omission"],
      }),
    ).toThrow("one completed exact UTC day");
  });

  it("removes GitHub evidence and its cluster while preserving social evidence", () => {
    const selection = fixtureSelection();
    const omitted = omitGitHubEvidence(selection);

    expect(omitted.selectedEvidence.map((item) => item.providerKey)).toEqual([
      "hacker-news",
    ]);
    expect(omitted.clusters.map((cluster) => cluster.id)).toEqual([
      "cluster-hn",
    ]);
    expect(omitted.sourceWindow.selectedFeedItemIds).toEqual(["feed-hn"]);
    expect(omitted.sourceWindow.storyClusterIds).toEqual(["cluster-hn"]);
  });
});

const fixtureSelection = (): SummaryEvidenceSelection =>
  ({
    rankingPolicyVersion: "story_ranking_v7",
    sourceWindow: {
      windowId: "window-1",
      startedAt: new Date("2026-07-19T00:00:00.000Z"),
      endedAt: new Date("2026-07-20T00:00:00.000Z"),
      selectedFeedItemIds: ["feed-hn", "feed-github"],
      storyClusterIds: ["cluster-hn", "cluster-github"],
    },
    clusters: [
      {
        id: "cluster-hn",
        storyKey: "hn-story",
        representativeFeedItemId: "feed-hn",
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai"],
        providerKeys: ["hacker-news"],
        score: 1,
        observedAtRange: {
          startedAt: new Date("2026-07-19T12:00:00.000Z"),
          endedAt: new Date("2026-07-19T12:00:00.000Z"),
        },
        whyImportant: ["Relevant HN story"],
      },
      {
        id: "cluster-github",
        storyKey: "github-story",
        representativeFeedItemId: "feed-github",
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai"],
        providerKeys: ["github-trending-page"],
        score: 1,
        observedAtRange: {
          startedAt: new Date("2026-07-19T12:00:00.000Z"),
          endedAt: new Date("2026-07-19T12:00:00.000Z"),
        },
        whyImportant: ["Trending repository"],
      },
    ],
    selectedEvidence: [
      {
        feedItemId: "feed-hn",
        sourceItemId: "source-hn",
        sourceBindingId: "binding-hn",
        interestId: "interest-ai",
        providerKey: "hacker-news",
        canonicalUrl: "https://news.ycombinator.com/item?id=1",
        title: "HN story",
        publishedAt: new Date("2026-07-19T12:00:00.000Z"),
        observedAt: new Date("2026-07-19T12:01:00.000Z"),
        score: 1,
        whyImportant: ["Relevant HN story"],
      },
      {
        feedItemId: "feed-github",
        sourceItemId: "source-github",
        sourceBindingId: "binding-github",
        interestId: "interest-ai",
        providerKey: "github-trending-page",
        canonicalUrl: "https://github.com/owner/repo",
        title: "owner/repo",
        publishedAt: new Date("2026-07-19T12:00:00.000Z"),
        observedAt: new Date("2026-07-19T12:01:00.000Z"),
        score: 1,
        whyImportant: ["Trending repository"],
      },
    ],
  }) satisfies SummaryEvidenceSelection;
