import { evaluateReaderSummaryMultiDayQuality } from "./reader-summary-multi-day-quality-eval";

describe("evaluateReaderSummaryMultiDayQuality", () => {
  it("measures clustering, cross-source, ranking, narrative and weak reads", () => {
    const result = evaluateReaderSummaryMultiDayQuality({
      actualDays: [
        {
          collectionDate: "2026-07-09",
          modelVersion: "codex:gpt-5.5:xhigh",
          promptVersion: "reader_summary.prompt.agent_runtime.v8",
          storyClusters: [
            {
              id: "cluster:launch",
              representativeFeedItemId: "x-launch",
              duplicateFeedItemIds: ["rss-launch"],
              providerKeys: ["x-twitter", "rss"],
            },
            {
              id: "cluster:noise",
              representativeFeedItemId: "noise",
              duplicateFeedItemIds: [],
              providerKeys: ["reddit"],
            },
          ],
          topReadFeedItemIds: ["x-launch"],
          topReadQualityEligibility: [true, false],
          narrativeSections: [
            {
              kind: "lead",
              citationFeedItemIds: ["rss-launch"],
            },
          ],
        },
      ],
      goldDays: [
        {
          collectionDate: "2026-07-09",
          storyExpectations: [
            {
              feedItemId: "x-launch",
              expectedStoryKey: "launch",
              providerKey: "x-twitter",
            },
            {
              feedItemId: "rss-launch",
              expectedStoryKey: "launch",
              providerKey: "rss",
            },
            {
              feedItemId: "noise",
              expectedStoryKey: "noise",
              providerKey: "reddit",
            },
          ],
          crossSourceExpectations: [
            { expectedStoryKey: "launch", expected: true },
            { expectedStoryKey: "noise", expected: false },
          ],
          rankingExpectations: [
            { feedItemId: "x-launch", expected: "top_read" },
            { feedItemId: "noise", expected: "exclude" },
          ],
          narrativeExpectations: [
            { expectedStoryKey: "launch", expectedKind: "lead" },
          ],
        },
      ],
      thresholds: thresholds(),
      expectedGenerationProfile: generationProfile,
    });

    expect(result).toMatchObject({
      blockingPassed: true,
      metrics: {
        dayCount: 1,
        storyPairPrecision: 1,
        storyPairRecall: 1,
        crossSourcePrecision: 1,
        crossSourceRecall: 1,
        falseCrossSourceClusterCount: 0,
        rankingAccuracy: 1,
        narrativeCoverage: 1,
        weakTopReadRate: 0.5,
      },
    });
  });

  it("reports false merges, missed cross-source support and ranking mistakes", () => {
    const result = evaluateReaderSummaryMultiDayQuality({
      actualDays: [
        {
          collectionDate: "2026-07-08",
          modelVersion: "codex:legacy",
          promptVersion: "reader_summary.prompt.agent_runtime.v2",
          storyClusters: [
            {
              id: "cluster:wrong",
              representativeFeedItemId: "x-a",
              duplicateFeedItemIds: ["reddit-b"],
              providerKeys: ["x-twitter", "reddit"],
            },
            {
              id: "cluster:split",
              representativeFeedItemId: "rss-a",
              duplicateFeedItemIds: [],
              providerKeys: ["rss"],
            },
          ],
          topReadFeedItemIds: ["reddit-b"],
          topReadQualityEligibility: [false],
          narrativeSections: [],
        },
      ],
      goldDays: [
        {
          collectionDate: "2026-07-08",
          storyExpectations: [
            {
              feedItemId: "x-a",
              expectedStoryKey: "story-a",
              providerKey: "x-twitter",
            },
            {
              feedItemId: "rss-a",
              expectedStoryKey: "story-a",
              providerKey: "rss",
            },
            {
              feedItemId: "reddit-b",
              expectedStoryKey: "story-b",
              providerKey: "reddit",
            },
          ],
          crossSourceExpectations: [
            { expectedStoryKey: "story-a", expected: true },
            { expectedStoryKey: "story-b", expected: false },
          ],
          rankingExpectations: [
            { feedItemId: "x-a", expected: "top_read" },
            { feedItemId: "reddit-b", expected: "exclude" },
          ],
          narrativeExpectations: [
            { expectedStoryKey: "story-a", expectedKind: "lead" },
          ],
        },
      ],
      thresholds: thresholds(),
      expectedGenerationProfile: generationProfile,
    });

    expect(result.blockingPassed).toBe(false);
    expect(result.days[0]?.issues).toEqual(
      expect.arrayContaining([
        "False story merge: x-a, reddit-b",
        "False story split: x-a, rss-a",
        "Missing cross-source cluster for story-a",
        "False cross-source cluster for story-b",
        "Ranking mismatch for x-a: expected top_read",
        "Ranking mismatch for reddit-b: expected exclude",
        "Missing lead narrative for story-a",
        "Generation profile mismatch: codex:legacy / reader_summary.prompt.agent_runtime.v2",
      ]),
    );
  });
});

const generationProfile = {
  modelVersion: "codex:gpt-5.5:xhigh",
  promptVersion: "reader_summary.prompt.agent_runtime.v8",
};

const thresholds = () => ({
  minimumDayCount: 1,
  minimumStoryPairPrecision: 0.9,
  minimumStoryPairRecall: 0.9,
  minimumCrossSourcePrecision: 0.9,
  minimumCrossSourceRecall: 0.9,
  minimumRankingAccuracy: 0.9,
  minimumNarrativeCoverage: 0.9,
  maximumWeakTopReadRate: 0.5,
});
