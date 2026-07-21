import {
  evaluateReaderSummaryMultiDayQuality,
  type ReaderSummaryMultiDayActualDay,
  type ReaderSummaryMultiDayGoldDay,
  type ReaderSummaryMultiDayRankingExpectation,
} from "./reader-summary-multi-day-quality-eval";

describe("evaluateReaderSummaryMultiDayQuality", () => {
  it("does not let secondary coverage hide a missing lead", () => {
    const collectionDate = "2026-07-09";
    const gold = goldDay(collectionDate);
    const secondaryExpectations = Array.from({ length: 4 }, (_, index) => ({
      expectedStoryKey: `secondary-${index}`,
      expectedKind: "secondary_signal" as const,
    }));
    const actual = actualDay(collectionDate);
    const result = evaluateReaderSummaryMultiDayQuality({
      actualDays: [
        {
          ...actual,
          narrativeSections: [
            {
              kind: "lead",
              storyClusterId: "wrong-lead",
              citationFeedItemIds: ["feed-wrong-lead"],
            },
            ...secondaryExpectations.map((_, index) => ({
              kind: "secondary_signal" as const,
              storyClusterId: `cluster-secondary-${index}`,
              citationFeedItemIds: [`feed-secondary-${index}`],
            })),
          ],
          storyClusters: [
            ...actual.storyClusters,
            {
              id: "wrong-lead",
              representativeFeedItemId: "feed-wrong-lead",
              duplicateFeedItemIds: [],
              providerKeys: ["fixture"],
            },
            ...secondaryExpectations.map((_, index) => ({
              id: `cluster-secondary-${index}`,
              representativeFeedItemId: `feed-secondary-${index}`,
              duplicateFeedItemIds: [],
              providerKeys: ["fixture"],
            })),
          ],
        },
      ],
      goldDays: [
        {
          ...gold,
          storyExpectations: [
            ...gold.storyExpectations,
            ...secondaryExpectations.map((_, index) => ({
              feedItemId: `feed-secondary-${index}`,
              expectedStoryKey: `secondary-${index}`,
              providerKey: "fixture",
            })),
          ],
          narrativeExpectations: [
            { expectedStoryKey: "story-a", expectedKind: "lead" },
            ...secondaryExpectations,
          ],
        },
      ],
      thresholds: {
        ...thresholds(),
        minimumNarrativeCoverage: 0.7,
      },
      expectedGenerationProfile: generationProfile,
    });

    expect(result.metrics.narrativeCoverage).toBe(0.8);
    expect(result.metrics.leadCoverage).toBe(0);
    expect(result.qualityGates.narrativeCoverage).toBe(true);
    expect(result.qualityGates.leadCoverage).toBe(false);
    expect(result.blockingPassed).toBe(false);
  });
  it("measures clustering, cross-source, ranking, narrative and weak reads", () => {
    const result = evaluateReaderSummaryMultiDayQuality({
      actualDays: [
        {
          collectionDate: "2026-07-09",
          modelVersion: "codex:gpt-5.5:xhigh",
          promptVersion: "reader_summary.prompt.agent_runtime.v8",
          rankingPolicyVersion: "story_ranking_v7",
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
          topReadEntries: [
            {
              citationFeedItemIds: ["x-launch"],
              qualityEligible: true,
            },
            {
              citationFeedItemIds: ["rss-launch"],
              qualityEligible: false,
            },
          ],
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
        goldDayCount: 1,
        storyPairPrecision: 1,
        storyPairRecall: 1,
        crossSourcePrecision: 1,
        crossSourceRecall: 1,
        falseCrossSourceClusterCount: 0,
        rankingAccuracy: 1,
        orderedRankingAccuracy: 1,
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
          rankingPolicyVersion: "story_ranking_v6",
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
          topReadEntries: [
            {
              citationFeedItemIds: ["reddit-b"],
              qualityEligible: false,
            },
          ],
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
        "Generation profile mismatch: model=codex:legacy prompt=reader_summary.prompt.agent_runtime.v2 ranking=story_ranking_v6",
      ]),
    );
  });

  it("blocks when one of ten gold days has no persisted summary", () => {
    const collectionDates = Array.from(
      { length: 10 },
      (_, index) => `2026-07-${String(index + 1).padStart(2, "0")}`,
    );
    const result = evaluateReaderSummaryMultiDayQuality({
      actualDays: collectionDates.slice(0, 9).map((date) => actualDay(date)),
      goldDays: collectionDates.map((date) => goldDay(date)),
      thresholds: { ...thresholds(), minimumDayCount: 9 },
      expectedGenerationProfile: generationProfile,
    });

    expect(result.metrics).toMatchObject({
      dayCount: 9,
      goldDayCount: 10,
      currentGenerationArtifactCount: 9,
      missingExpectedFeedItemCount: 3,
    });
    expect(result.qualityGates.minimumRealDayCount).toBe(true);
    expect(result.qualityGates.allGoldDaysPersisted).toBe(false);
    expect(result.qualityGates.allGoldFeedItemsPresent).toBe(false);
    expect(result.blockingPassed).toBe(false);
    expect(result.days[9]?.issues).toEqual([
      "Missing persisted reader summary for 2026-07-10",
    ]);
  });

  it("fails ordered ranking when top reads are present in reverse order", () => {
    const actual = actualDay("2026-07-09", ["feed-b", "feed-a"]);
    const gold = goldDay("2026-07-09", [
      { feedItemId: "feed-a", expected: "top_read", expectedRank: 1 },
      { feedItemId: "feed-b", expected: "top_read", expectedRank: 2 },
      { feedItemId: "noise", expected: "exclude" },
    ]);
    const result = evaluateReaderSummaryMultiDayQuality({
      actualDays: [actual],
      goldDays: [gold],
      thresholds: thresholds(),
      expectedGenerationProfile: generationProfile,
    });

    expect(result.metrics).toMatchObject({
      rankingAccuracy: 1,
      topReadPositiveRecall: 1,
      excludedItemRejectionRate: 1,
      orderedRankingCorrectCount: 0,
      orderedRankingExpectationCount: 2,
      orderedRankingAccuracy: 0,
    });
    expect(result.qualityGates.rankingAccuracy).toBe(true);
    expect(result.qualityGates.orderedRankingAccuracy).toBe(false);
    expect(result.blockingPassed).toBe(false);
    expect(result.days[0]?.issues).toEqual(
      expect.arrayContaining([
        "Ranking order mismatch for feed-a: expected rank 1, actual 2",
        "Ranking order mismatch for feed-b: expected rank 2, actual 1",
      ]),
    );
  });

  it("assigns every citation on a top-read card to the card rank", () => {
    const baseActual = actualDay("2026-07-09");
    const actual = {
      ...baseActual,
      storyClusters: [
        {
          ...baseActual.storyClusters[0]!,
          duplicateFeedItemIds: ["feed-b"],
          providerKeys: ["hacker-news", "reddit"],
        },
        ...baseActual.storyClusters.slice(2),
      ],
      topReadEntries: [
        {
          citationFeedItemIds: ["feed-a", "feed-b"],
          qualityEligible: true,
        },
        {
          citationFeedItemIds: ["noise"],
          qualityEligible: true,
        },
      ],
    };
    const gold = goldDay("2026-07-09", [
      { feedItemId: "feed-a", expected: "top_read", expectedRank: 1 },
      { feedItemId: "feed-b", expected: "top_read", expectedRank: 1 },
      { feedItemId: "noise", expected: "top_read", expectedRank: 2 },
    ]);
    const result = evaluateFixture([actual], [gold]);

    expect(result.metrics).toMatchObject({
      orderedRankingCorrectCount: 3,
      orderedRankingExpectationCount: 3,
      orderedRankingAccuracy: 1,
    });
    expect(result.qualityGates.orderedRankingAccuracy).toBe(true);
  });

  it("does not let four perfect days hide one catastrophic day", () => {
    const collectionDates = [
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
    ];
    const goldDays = collectionDates.map(catastrophicFloorGoldDay);
    const perfectDays = collectionDates
      .slice(0, 4)
      .map(perfectCatastrophicFloorActualDay);
    const catastrophicDay: ReaderSummaryMultiDayActualDay = {
      ...perfectCatastrophicFloorActualDay(collectionDates[4]!),
      storyClusters: [
        {
          id: "cluster:a",
          representativeFeedItemId: "feed-a",
          duplicateFeedItemIds: [],
          providerKeys: ["hacker-news"],
        },
        {
          id: "cluster:b",
          representativeFeedItemId: "feed-b",
          duplicateFeedItemIds: [],
          providerKeys: ["reddit"],
        },
        {
          id: "cluster:noise",
          representativeFeedItemId: "noise",
          duplicateFeedItemIds: [],
          providerKeys: ["rss"],
        },
      ],
      topReadEntries: [],
      narrativeSections: [],
    };

    const result = evaluateReaderSummaryMultiDayQuality({
      actualDays: [...perfectDays, catastrophicDay],
      goldDays,
      thresholds: {
        minimumDayCount: 5,
        minimumStoryPairPrecision: 0.8,
        minimumStoryPairRecall: 0.8,
        minimumCrossSourcePrecision: 0.8,
        minimumCrossSourceRecall: 0.8,
        minimumRankingAccuracy: 0.8,
        minimumNarrativeCoverage: 0.8,
        maximumWeakTopReadRate: 0.2,
      },
      expectedGenerationProfile: generationProfile,
    });

    expect(result.metrics).toMatchObject({
      storyPairRecall: 0.8,
      crossSourceRecall: 0.8,
      orderedRankingAccuracy: 0.8,
      narrativeCoverage: 0.8,
      leadCoverage: 0.8,
      secondarySignalCoverage: 0.8,
      weakTopReadRate: 0.2,
    });
    for (const aggregateGate of [
      "storyPairPrecision",
      "storyPairRecall",
      "crossSourcePrecision",
      "crossSourceRecall",
      "rankingAccuracy",
      "orderedRankingAccuracy",
      "narrativeCoverage",
      "leadCoverage",
      "secondarySignalCoverage",
      "weakTopReadRate",
    ]) {
      expect(result.qualityGates[aggregateGate]).toBe(true);
    }
    expect(result.qualityGates.allDaysMeetCatastrophicQualityFloor).toBe(false);
    expect(result.blockingPassed).toBe(false);
  });

  it("fails closed on malformed actual and gold inputs", () => {
    const baseActual = actualDay("2026-07-09");
    const cases: readonly {
      actualDays: readonly ReaderSummaryMultiDayActualDay[];
      goldDays: readonly ReaderSummaryMultiDayGoldDay[];
      expectedMessage: string;
    }[] = [
      {
        actualDays: [baseActual, baseActual],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage: "Duplicate actual collection date 2026-07-09",
      },
      {
        actualDays: [baseActual],
        goldDays: [goldDay("2026-07-09"), goldDay("2026-07-09")],
        expectedMessage: "Duplicate gold collection date 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            topReadEntries: [
              {
                citationFeedItemIds: ["feed-a"],
                qualityEligible: true,
              },
              {
                citationFeedItemIds: ["feed-a"],
                qualityEligible: true,
              },
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Duplicate actual top-read citation feed item feed-a across cards 1 and 2 for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            topReadEntries: [
              { citationFeedItemIds: [], qualityEligible: true },
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Actual top-read card 1 has no citation feed items for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            topReadEntries: [
              {
                citationFeedItemIds: ["feed-a", "feed-b"],
                qualityEligible: true,
              },
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Actual top-read card 1 spans multiple story clusters for 2026-07-09: cluster:a, cluster:b",
      },
      {
        actualDays: [baseActual],
        goldDays: [
          goldDay("2026-07-09", [
            { feedItemId: "feed-a", expected: "top_read" },
            { feedItemId: "feed-a", expected: "exclude" },
          ]),
        ],
        expectedMessage: "Duplicate ranking feed item feed-a for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            storyClusters: [
              { ...baseActual.storyClusters[0]!, id: " " },
              ...baseActual.storyClusters.slice(1),
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Actual story cluster id must be non-empty for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            storyClusters: [
              {
                ...baseActual.storyClusters[0]!,
                representativeFeedItemId: " ",
              },
              ...baseActual.storyClusters.slice(1),
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Actual story cluster cluster:a representative feed item id must be non-empty for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            storyClusters: [
              {
                ...baseActual.storyClusters[0]!,
                duplicateFeedItemIds: [""],
              },
              ...baseActual.storyClusters.slice(1),
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Actual story cluster cluster:a feed item id must be non-empty for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            storyClusters: [
              {
                ...baseActual.storyClusters[0]!,
                duplicateFeedItemIds: ["feed-a"],
              },
              ...baseActual.storyClusters.slice(1),
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Feed item feed-a appears more than once in actual cluster cluster:a for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            storyClusters: [
              {
                ...baseActual.storyClusters[0]!,
                duplicateFeedItemIds: ["feed-extra", "feed-extra"],
              },
              ...baseActual.storyClusters.slice(1),
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Feed item feed-extra appears more than once in actual cluster cluster:a for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            storyClusters: [
              ...baseActual.storyClusters,
              {
                id: "cluster:a",
                representativeFeedItemId: "feed-extra",
                duplicateFeedItemIds: [],
                providerKeys: ["rss"],
              },
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Duplicate actual story cluster id cluster:a for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            storyClusters: [
              {
                ...baseActual.storyClusters[0]!,
                providerKeys: [],
              },
              ...baseActual.storyClusters.slice(1),
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Actual story cluster cluster:a has no provider keys for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            storyClusters: [
              {
                ...baseActual.storyClusters[0]!,
                providerKeys: [""],
              },
              ...baseActual.storyClusters.slice(1),
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Actual story cluster cluster:a provider key must be non-empty for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            storyClusters: [
              {
                ...baseActual.storyClusters[0]!,
                providerKeys: ["hacker-news", "hacker-news"],
              },
              ...baseActual.storyClusters.slice(1),
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Duplicate provider key hacker-news in actual cluster cluster:a for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            narrativeSections: [
              {
                kind: "lead",
                storyClusterId: "cluster:missing",
                citationFeedItemIds: ["feed-a"],
              },
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Narrative section references unknown actual story cluster cluster:missing for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            narrativeSections: [
              {
                kind: "lead",
                citationFeedItemIds: [],
              },
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Actual narrative section has no citation feed items for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            narrativeSections: [
              {
                kind: "lead",
                citationFeedItemIds: ["feed-a", "feed-a"],
              },
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Duplicate actual narrative citation feed item feed-a for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            narrativeSections: [
              {
                kind: "lead",
                citationFeedItemIds: ["feed-missing"],
              },
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Actual narrative section references unknown feed item feed-missing for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            topReadEntries: [
              {
                citationFeedItemIds: ["feed-missing"],
                qualityEligible: true,
              },
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Actual top-read card 1 references unknown feed item feed-missing for 2026-07-09",
      },
      {
        actualDays: [
          {
            ...baseActual,
            storyClusters: [
              ...baseActual.storyClusters,
              {
                id: "cluster:other",
                representativeFeedItemId: "feed-a",
                duplicateFeedItemIds: [],
                providerKeys: ["rss"],
              },
            ],
          },
        ],
        goldDays: [goldDay("2026-07-09")],
        expectedMessage:
          "Feed item feed-a is assigned to multiple actual clusters for 2026-07-09: cluster:a, cluster:other",
      },
    ];

    for (const testCase of cases) {
      expect(() =>
        evaluateFixture(testCase.actualDays, testCase.goldDays),
      ).toThrow(testCase.expectedMessage);
    }
  });
});

const actualDay = (
  collectionDate: string,
  topReadFeedItemIds: readonly string[] = ["feed-a"],
): ReaderSummaryMultiDayActualDay => ({
  collectionDate,
  ...generationProfile,
  storyClusters: [
    {
      id: "cluster:a",
      representativeFeedItemId: "feed-a",
      duplicateFeedItemIds: [],
      providerKeys: ["hacker-news"],
    },
    {
      id: "cluster:b",
      representativeFeedItemId: "feed-b",
      duplicateFeedItemIds: [],
      providerKeys: ["reddit"],
    },
    {
      id: "cluster:noise",
      representativeFeedItemId: "noise",
      duplicateFeedItemIds: [],
      providerKeys: ["rss"],
    },
  ],
  topReadEntries: topReadFeedItemIds.map((feedItemId) => ({
    citationFeedItemIds: [feedItemId],
    qualityEligible: true,
  })),
  narrativeSections: [],
});

const goldDay = (
  collectionDate: string,
  rankingExpectations: readonly ReaderSummaryMultiDayRankingExpectation[] = [
    { feedItemId: "feed-a", expected: "top_read" },
    { feedItemId: "noise", expected: "exclude" },
  ],
): ReaderSummaryMultiDayGoldDay => ({
  collectionDate,
  storyExpectations: [
    {
      feedItemId: "feed-a",
      expectedStoryKey: "story-a",
      providerKey: "hacker-news",
    },
    {
      feedItemId: "feed-b",
      expectedStoryKey: "story-b",
      providerKey: "reddit",
    },
    {
      feedItemId: "noise",
      expectedStoryKey: "noise",
      providerKey: "rss",
    },
  ],
  crossSourceExpectations: [
    { expectedStoryKey: "story-a", expected: false },
    { expectedStoryKey: "story-b", expected: false },
    { expectedStoryKey: "noise", expected: false },
  ],
  rankingExpectations,
  narrativeExpectations: [],
});

const catastrophicFloorGoldDay = (
  collectionDate: string,
): ReaderSummaryMultiDayGoldDay => ({
  collectionDate,
  storyExpectations: [
    {
      feedItemId: "feed-a",
      expectedStoryKey: "story-a",
      providerKey: "hacker-news",
    },
    {
      feedItemId: "feed-b",
      expectedStoryKey: "story-a",
      providerKey: "reddit",
    },
    {
      feedItemId: "noise",
      expectedStoryKey: "noise",
      providerKey: "rss",
    },
  ],
  crossSourceExpectations: [
    { expectedStoryKey: "story-a", expected: true },
    { expectedStoryKey: "noise", expected: false },
  ],
  rankingExpectations: [
    { feedItemId: "feed-a", expected: "top_read", expectedRank: 1 },
    { feedItemId: "feed-b", expected: "top_read", expectedRank: 1 },
    { feedItemId: "noise", expected: "exclude" },
  ],
  narrativeExpectations: [
    { expectedStoryKey: "story-a", expectedKind: "lead" },
    { expectedStoryKey: "noise", expectedKind: "secondary_signal" },
  ],
});

const perfectCatastrophicFloorActualDay = (
  collectionDate: string,
): ReaderSummaryMultiDayActualDay => ({
  collectionDate,
  ...generationProfile,
  storyClusters: [
    {
      id: "cluster:a",
      representativeFeedItemId: "feed-a",
      duplicateFeedItemIds: ["feed-b"],
      providerKeys: ["hacker-news", "reddit"],
    },
    {
      id: "cluster:noise",
      representativeFeedItemId: "noise",
      duplicateFeedItemIds: [],
      providerKeys: ["rss"],
    },
  ],
  topReadEntries: [
    {
      citationFeedItemIds: ["feed-a", "feed-b"],
      qualityEligible: true,
    },
  ],
  narrativeSections: [
    {
      kind: "lead",
      storyClusterId: "cluster:a",
      citationFeedItemIds: ["feed-a"],
    },
    {
      kind: "secondary_signal",
      storyClusterId: "cluster:noise",
      citationFeedItemIds: ["noise"],
    },
  ],
});

const generationProfile = {
  modelVersion: "codex:gpt-5.5:xhigh",
  promptVersion: "reader_summary.prompt.agent_runtime.v8",
  rankingPolicyVersion: "story_ranking_v7",
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

const evaluateFixture = (
  actualDays: readonly ReaderSummaryMultiDayActualDay[],
  goldDays: readonly ReaderSummaryMultiDayGoldDay[],
) =>
  evaluateReaderSummaryMultiDayQuality({
    actualDays,
    goldDays,
    thresholds: thresholds(),
    expectedGenerationProfile: generationProfile,
  });
