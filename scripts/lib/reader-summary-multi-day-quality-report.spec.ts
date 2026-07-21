import {
  evaluateReaderSummaryMultiDayQuality,
  type ReaderSummaryMultiDayActualDay,
  type ReaderSummaryMultiDayGoldDay,
} from "@social-monitor/summary/domain";

import {
  actualDayProjectionSha256,
  readerSummaryMultiDayQualityReportGeneratedBy,
  readerSummaryMultiDayQualityReportModelV3,
  validateReaderSummaryMultiDayQualityReportV3,
} from "./reader-summary-multi-day-quality-report";

const dates = [
  "2026-07-10",
  "2026-07-11",
  "2026-07-12",
  "2026-07-13",
  "2026-07-14",
] as const;
const generationProfile = {
  modelVersion: "codex:gpt-5.5:xhigh",
  promptVersion: "reader_summary.prompt.agent_runtime.v10",
  rankingPolicyVersion: "story_ranking_v8",
} as const;
const thresholds = {
  minimumDayCount: 5,
  minimumStoryPairPrecision: 1,
  minimumStoryPairRecall: 1,
  minimumCrossSourcePrecision: 1,
  minimumCrossSourceRecall: 1,
  minimumRankingAccuracy: 1,
  minimumNarrativeCoverage: 1,
  maximumWeakTopReadRate: 0,
} as const;
const gateNames = [
  "minimumRealDayCount",
  "allGoldDaysPersisted",
  "allDaysUseExpectedGenerationProfile",
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
  "allDaysMeetCatastrophicQualityFloor",
  "allGoldFeedItemsPresent",
  "exactReviewedArtifactBindings",
  "capturedCurrentPublicArtifactBindings",
  "currentInputFileHashesBound",
  "goldContractV2",
  "noRawSecretFragments",
] as const;

describe("reader summary multi-day artifact-only report", () => {
  it("records manual-only status without a CI or release claim", () => {
    expect(readerSummaryMultiDayQualityReportModelV3).toMatchObject({
      executionStatus: "manual_evaluation",
      ciEnforced: false,
      releaseStatusAsserted: false,
      artifactOnlyCurrentAtValidationAsserted: false,
    });
  });

  it("requires the captured-current-artifact gate for v3 reports", () => {
    const fixture = reportFixture();
    expect(() => validateFixture(fixture)).not.toThrow();
    (
      fixture.report.qualityGates as unknown as Record<string, boolean>
    ).capturedCurrentPublicArtifactBindings = false;
    expect(() => validateFixture(fixture)).toThrow("stale or forged");
  });

  it("reruns card-ranked multi-citation evaluation from exact projections", () => {
    const fixture = reportFixture();

    expect(fixture.report.metrics.orderedRankingAccuracy).toBe(1);
    expect(
      fixture.report.inputs.actualDays[0]?.topReadEntries.map(
        (entry) => entry.citationFeedItemIds,
      ),
    ).toEqual([["feed-0-a", "feed-0-a-support"], ["feed-0-b"]]);
    expect(() => validateFixture(fixture)).not.toThrow();
  });

  it("rejects a missing evaluation surface or wrong report identity", () => {
    const missing = reportFixture();
    delete (missing.report as { metrics?: unknown }).metrics;
    expect(() => validateFixture(missing)).toThrow(
      "exact v3 report validation",
    );

    const identity = reportFixture();
    identity.report.generatedBy = "forged-command";
    expect(() => validateFixture(identity)).toThrow(
      "exact v3 report validation",
    );
  });

  it("rejects high-confidence secrets anywhere in persisted report fields", () => {
    for (const secret of [
      `ghp_${"g".repeat(48)}`,
      `smk_${"m".repeat(48)}`,
      `whsec_${"w".repeat(48)}`,
      `sk-${"s".repeat(48)}`,
    ]) {
      const fixture = reportFixture();
      const secretPath = `/private/${secret}/gold.json`;
      fixture.report.inputs.goldPath = secretPath;
      fixture.expectedInputsWithoutActualDays.goldPath = secretPath;
      expect(() => validateFixture(fixture)).toThrow(
        "exact v3 report validation",
      );
    }
  });

  it("rejects forged metrics, days, gates and projection evidence", () => {
    const metrics = reportFixture();
    (metrics.report.metrics as unknown as { dayCount: number }).dayCount = 999;
    expect(() => validateFixture(metrics)).toThrow(
      "evidence is stale or forged",
    );

    const days = reportFixture();
    (days.report.days[0]!.issues as unknown as string[]).push("forged");
    expect(() => validateFixture(days)).toThrow("evidence is stale or forged");

    const gates = reportFixture();
    (
      gates.report.qualityGates as unknown as Record<string, boolean>
    ).storyPairPrecision = false;
    expect(() => validateFixture(gates)).toThrow("evidence is stale or forged");

    const projection = reportFixture();
    (
      projection.report.inputs.actualDays[0] as unknown as {
        topReadEntries: unknown[];
      }
    ).topReadEntries = [];
    expect(() => validateFixture(projection)).toThrow(
      "projection hash is stale",
    );
  });

  it("rejects a hash-rebound collection projection that omits reviewed input", () => {
    const fixture = reportFixture();
    const day = fixture.report.inputs.actualDays[0]!;
    fixture.report.inputs.actualDays[0] = {
      ...day,
      storyClusters: day.storyClusters.map((cluster) =>
        cluster.representativeFeedItemId === "feed-0-b"
          ? { ...cluster, representativeFeedItemId: "feed-0-unreviewed" }
          : cluster,
      ),
      topReadEntries: day.topReadEntries.map((entry) => ({
        ...entry,
        citationFeedItemIds: entry.citationFeedItemIds.map((feedItemId) =>
          feedItemId === "feed-0-b" ? "feed-0-unreviewed" : feedItemId,
        ),
      })),
    };
    rebindProjection(fixture);

    expect(() => validateFixture(fixture)).toThrow(
      "evaluation evidence is stale or forged",
    );
  });

  it("rejects hash-rebound editorial ordering drift", () => {
    const fixture = reportFixture();
    const day = fixture.report.inputs.actualDays[0]!;
    fixture.report.inputs.actualDays[0] = {
      ...day,
      topReadEntries: [...day.topReadEntries].reverse(),
    };
    rebindProjection(fixture);

    expect(() => validateFixture(fixture)).toThrow(
      "evaluation evidence is stale or forged",
    );
  });

  it("rejects hash-rebound citations to unknown source items", () => {
    const fixture = reportFixture();
    const day = fixture.report.inputs.actualDays[0]!;
    fixture.report.inputs.actualDays[0] = {
      ...day,
      topReadEntries: day.topReadEntries.map((entry, index) =>
        index === 0
          ? { ...entry, citationFeedItemIds: ["feed-0-unknown"] }
          : entry,
      ),
    };
    rebindProjection(fixture);

    expect(() => validateFixture(fixture)).toThrow(
      "references unknown feed item",
    );
  });

  it("rejects hash-rebound narrative coverage drift", () => {
    const fixture = reportFixture();
    const day = fixture.report.inputs.actualDays[0]!;
    fixture.report.inputs.actualDays[0] = {
      ...day,
      narrativeSections: [],
    };
    rebindProjection(fixture);

    expect(() => validateFixture(fixture)).toThrow(
      "evaluation evidence is stale or forged",
    );
  });

  it("rejects hash-rebound impossible actual-day shapes before evaluation", () => {
    const duplicateCluster = reportFixture();
    const duplicateClusterDay = duplicateCluster.report.inputs.actualDays[0]!;
    duplicateCluster.report.inputs.actualDays[0] = {
      ...duplicateClusterDay,
      storyClusters: [
        ...duplicateClusterDay.storyClusters,
        {
          ...duplicateClusterDay.storyClusters[0]!,
          representativeFeedItemId: "feed-0-other",
          duplicateFeedItemIds: [],
        },
      ],
    };
    rebindProjection(duplicateCluster);
    expect(() => validateFixture(duplicateCluster)).toThrow(
      "Duplicate actual story cluster id",
    );

    const duplicateCitation = reportFixture();
    const duplicateCitationDay = duplicateCitation.report.inputs.actualDays[0]!;
    duplicateCitation.report.inputs.actualDays[0] = {
      ...duplicateCitationDay,
      topReadEntries: [
        ...duplicateCitationDay.topReadEntries,
        { citationFeedItemIds: ["feed-0-a"], qualityEligible: true },
      ],
    };
    rebindProjection(duplicateCitation);
    expect(() => validateFixture(duplicateCitation)).toThrow("across cards");

    const unknownNarrativeCluster = reportFixture();
    const unknownNarrativeDay =
      unknownNarrativeCluster.report.inputs.actualDays[0]!;
    unknownNarrativeCluster.report.inputs.actualDays[0] = {
      ...unknownNarrativeDay,
      narrativeSections: unknownNarrativeDay.narrativeSections.map(
        (section, index) =>
          index === 0
            ? { ...section, storyClusterId: "cluster-missing" }
            : section,
      ),
    };
    rebindProjection(unknownNarrativeCluster);
    expect(() => validateFixture(unknownNarrativeCluster)).toThrow(
      "unknown actual story cluster",
    );

    const emptyCard = reportFixture();
    const emptyCardDay = emptyCard.report.inputs.actualDays[0]!;
    emptyCard.report.inputs.actualDays[0] = {
      ...emptyCardDay,
      topReadEntries: emptyCardDay.topReadEntries.map((entry, index) =>
        index === 0
          ? { citationFeedItemIds: [], qualityEligible: true }
          : entry,
      ),
    };
    rebindProjection(emptyCard);
    expect(() => validateFixture(emptyCard)).toThrow(
      "projection hash is stale",
    );
  });
});

function reportFixture() {
  const goldDays = dates.map(goldDay);
  const actualDays = dates.map(actualDay);
  const targets = actualDays.map((day, index) => ({
    collectionDate: day.collectionDate,
    artifactId: `00000000-0000-7000-8000-${String(index + 10).padStart(12, "0")}`,
    artifactPayloadSha256: "a".repeat(64),
    actualDayProjectionSha256: actualDayProjectionSha256(day),
  }));
  const artifactBindings = targets.map((target) => ({ ...target }));
  const expectedInputsWithoutActualDays = {
    databaseFingerprint: `postgres-sha256:${"a".repeat(64)}`,
    capturedAt: "2026-07-21T00:10:00.000Z",
    currentAtCapture: true,
    goldPath: "/private/gold.json",
    goldSha256: "b".repeat(64),
    goldContractVersion: 2,
    goldProvenance: { corpus: { sha256: "c".repeat(64) } },
    targetManifestPath: "/private/target.json",
    targetManifestSha256: "d".repeat(64),
    evaluatorContractVersion: "reader-summary-multi-day-quality-evaluator-v4",
    generationProfile,
    collectionDates: dates,
    artifactBindings,
  };
  const evaluation = evaluateReaderSummaryMultiDayQuality({
    actualDays,
    goldDays,
    thresholds,
    expectedGenerationProfile: generationProfile,
  });
  const qualityGates = {
    ...evaluation.qualityGates,
    exactReviewedArtifactBindings: true,
    capturedCurrentPublicArtifactBindings: true,
    currentInputFileHashesBound: true,
    goldContractV2: true,
    noRawSecretFragments: true,
  };
  const report = {
    schemaVersion: 3,
    artifactFormat: "reader-summary-multi-day-quality-report-v3",
    generatedBy: readerSummaryMultiDayQualityReportGeneratedBy,
    model: readerSummaryMultiDayQualityReportModelV3,
    inputs: { ...expectedInputsWithoutActualDays, actualDays },
    thresholds,
    metrics: structuredClone(evaluation.metrics),
    days: structuredClone(evaluation.days),
    qualityGates: structuredClone(qualityGates),
    blockingPassed: true,
  };
  return {
    report,
    goldDays,
    targets,
    expectedInputsWithoutActualDays,
  };
}

function validateFixture(fixture: ReturnType<typeof reportFixture>): void {
  validateReaderSummaryMultiDayQualityReportV3({
    value: fixture.report,
    expectedInputsWithoutActualDays: fixture.expectedInputsWithoutActualDays,
    goldDays: fixture.goldDays,
    thresholds,
    generationProfile,
    targets: fixture.targets,
    expectedQualityGateNames: gateNames,
    label: "report fixture",
  });
}

function rebindProjection(
  fixture: ReturnType<typeof reportFixture>,
  index = 0,
): void {
  const hash = actualDayProjectionSha256(
    fixture.report.inputs.actualDays[index]!,
  );
  fixture.targets[index]!.actualDayProjectionSha256 = hash;
  fixture.expectedInputsWithoutActualDays.artifactBindings[
    index
  ]!.actualDayProjectionSha256 = hash;
}

function goldDay(
  collectionDate: string,
  index: number,
): ReaderSummaryMultiDayGoldDay {
  return {
    collectionDate,
    storyExpectations: [
      {
        feedItemId: `feed-${index}-a`,
        expectedStoryKey: `story-${index}-a`,
        providerKey: "hacker-news",
      },
      {
        feedItemId: `feed-${index}-a-support`,
        expectedStoryKey: `story-${index}-a`,
        providerKey: "rss",
      },
      {
        feedItemId: `feed-${index}-b`,
        expectedStoryKey: `story-${index}-b`,
        providerKey: "reddit",
      },
    ],
    crossSourceExpectations: [
      { expectedStoryKey: `story-${index}-a`, expected: true },
      { expectedStoryKey: `story-${index}-b`, expected: false },
    ],
    rankingExpectations: [
      {
        feedItemId: `feed-${index}-a`,
        expected: "top_read",
        expectedRank: 1,
      },
      {
        feedItemId: `feed-${index}-a-support`,
        expected: "top_read",
      },
      {
        feedItemId: `feed-${index}-b`,
        expected: "top_read",
        expectedRank: 2,
      },
    ],
    narrativeExpectations: [
      { expectedStoryKey: `story-${index}-a`, expectedKind: "lead" },
    ],
  };
}

function actualDay(
  collectionDate: string,
  index: number,
): ReaderSummaryMultiDayActualDay {
  return {
    collectionDate,
    ...generationProfile,
    storyClusters: [
      {
        id: `cluster-${index}-a`,
        representativeFeedItemId: `feed-${index}-a`,
        duplicateFeedItemIds: [`feed-${index}-a-support`],
        providerKeys: ["hacker-news", "rss"],
      },
      {
        id: `cluster-${index}-b`,
        representativeFeedItemId: `feed-${index}-b`,
        duplicateFeedItemIds: [],
        providerKeys: ["reddit"],
      },
    ],
    topReadEntries: [
      {
        citationFeedItemIds: [`feed-${index}-a`, `feed-${index}-a-support`],
        qualityEligible: true,
      },
      {
        citationFeedItemIds: [`feed-${index}-b`],
        qualityEligible: true,
      },
    ],
    narrativeSections: [
      {
        kind: "lead",
        storyClusterId: `cluster-${index}-a`,
        citationFeedItemIds: [`feed-${index}-a`],
      },
    ],
  };
}
