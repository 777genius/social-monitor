import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateReaderSummaryMultiDayQuality,
  type ReaderSummaryMultiDayActualDay,
} from "@social-monitor/summary/domain";

import {
  assertArtifactPayloadSha256,
  assertActualDayProjectionSha256,
  projectReaderSummaryMultiDayTopReadEntries,
  type GoldFile,
  type TargetManifestV2,
  validateExistingV2Report,
  validateGold,
  validateTargetManifestV2,
} from "./check-reader-summary-multi-day-quality";
import {
  buildReaderSummaryMultiDayQualityCorpus,
  readerSummaryMultiDayQualityCorpusFormat,
  serializeReaderSummaryMultiDayQualityCorpus,
  type SourceOnlyCorpusRow,
} from "./capture-reader-summary-multi-day-quality-corpus";
import { readerSummaryMultiDayAnnotationManifestFormat } from "./lib/reader-summary-multi-day-quality-provenance";
import {
  actualDayProjectionSha256,
  readerSummaryMultiDayQualityReportGeneratedBy,
  readerSummaryMultiDayQualityReportModel,
} from "./lib/reader-summary-multi-day-quality-report";
import { dailyPeriodKey } from "./lib/reader-summary-quality-eval-support";

describe("reader summary multi-day target manifest v2", () => {
  it("rejects a runtime artifact payload hash mismatch", () => {
    expect(() =>
      assertArtifactPayloadSha256({
        collectionDate: "2026-07-09",
        expected: "a".repeat(64),
        actual: "b".repeat(64),
      }),
    ).toThrow("payload hash mismatch");
  });

  it("rejects a runtime actual-day projection hash mismatch", () => {
    expect(() =>
      assertActualDayProjectionSha256({
        collectionDate: "2026-07-09",
        expected: "a".repeat(64),
        actual: "b".repeat(64),
      }),
    ).toThrow("projection hash mismatch");
  });

  it("rejects a missing reviewed target day", () => {
    const gold = goldFile(["2026-07-09", "2026-07-10"]);
    const manifest = targetManifest(["2026-07-09"]);

    expect(() => validateTargetManifestV2(manifest, gold)).toThrow(
      "exactly one artifact for every gold day",
    );
  });

  it("rejects duplicate target dates", () => {
    const gold = goldFile(["2026-07-09", "2026-07-10"]);
    const manifest = targetManifest(["2026-07-09", "2026-07-09"]);

    expect(() => validateTargetManifestV2(manifest, gold)).toThrow(
      "duplicate collection dates",
    );
  });

  it("rejects duplicate artifact ids", () => {
    const gold = goldFile(["2026-07-09", "2026-07-10"]);
    const manifest = targetManifest(["2026-07-09", "2026-07-10"]);
    const duplicate = {
      ...manifest,
      targets: manifest.targets.map((target) => ({
        ...target,
        artifactId: manifest.targets[0]!.artifactId,
      })),
    };

    expect(() => validateTargetManifestV2(duplicate, gold)).toThrow(
      "duplicate artifact ids",
    );
  });

  it("rejects invalid exact scope identity", () => {
    const gold = goldFile(["2026-07-09"]);
    const manifest = targetManifest(["2026-07-09"]);

    expect(() =>
      validateTargetManifestV2(
        { ...manifest, scope: { ...manifest.scope, tenantId: "drifted" } },
        gold,
      ),
    ).toThrow("unsupported v2 contract");

    expect(() =>
      validateTargetManifestV2(
        {
          ...manifest,
          scope: { ...manifest.scope, scopeKey: "workspace:drifted" },
        },
        gold,
      ),
    ).toThrow("unsupported v2 contract");
  });

  it("rejects a target without an actual-day projection hash", () => {
    const gold = goldFile(["2026-07-09"]);
    const manifest = structuredClone(
      targetManifest(["2026-07-09"]),
    ) as unknown as { targets: Array<Record<string, unknown>> };
    delete manifest.targets[0]!.actualDayProjectionSha256;

    expect(() => validateTargetManifestV2(manifest, gold)).toThrow(
      "invalid target binding",
    );
  });
});

describe("reader summary multi-day top-read projection", () => {
  it("preserves card boundaries for multi-citation ranking", () => {
    expect(
      projectReaderSummaryMultiDayTopReadEntries({
        collectionDate: "2026-07-09",
        topReads: [
          { citationIds: ["c-a", "c-a-support"], qualityEligible: true },
          { citationIds: ["c-b"], qualityEligible: false },
        ],
        citationFeedItemIdByCitationId: new Map([
          ["c-a", "feed-a"],
          ["c-a-support", "feed-a-support"],
          ["c-b", "feed-b"],
        ]),
      }),
    ).toEqual([
      {
        citationFeedItemIds: ["feed-a", "feed-a-support"],
        qualityEligible: true,
      },
      { citationFeedItemIds: ["feed-b"], qualityEligible: false },
    ]);
  });

  it("fails closed on zero or unresolved card citations", () => {
    expect(() =>
      projectReaderSummaryMultiDayTopReadEntries({
        collectionDate: "2026-07-09",
        topReads: [{ citationIds: [], qualityEligible: true }],
        citationFeedItemIdByCitationId: new Map(),
      }),
    ).toThrow("has no citations");

    expect(() =>
      projectReaderSummaryMultiDayTopReadEntries({
        collectionDate: "2026-07-09",
        topReads: [{ citationIds: ["missing"], qualityEligible: true }],
        citationFeedItemIdByCitationId: new Map(),
      }),
    ).toThrow("references unresolved citation missing");
  });
});

describe("reader summary multi-day gold validation", () => {
  it("requires valid ordered card ranks and allows shared citation ranks", () => {
    const gold = goldFile(fiveDates());
    const noOrderedRanks = structuredClone(gold) as unknown as GoldFile;
    for (const expectation of noOrderedRanks.days[0]!.rankingExpectations) {
      if (expectation.expected === "top_read") {
        (
          expectation as {
            expectedRank?: number;
          }
        ).expectedRank = undefined;
      }
    }

    expect(() => validateGold(noOrderedRanks)).toThrow(
      "at least one ordered ranking expectation per day",
    );

    const invalidRank = structuredClone(gold) as unknown as GoldFile;
    (
      invalidRank.days[0]!.rankingExpectations[0] as unknown as {
        expectedRank: number;
      }
    ).expectedRank = 0;
    expect(() => validateGold(invalidRank)).toThrow("invalid expected rank");

    const sharedCardRank = structuredClone(gold) as unknown as GoldFile;
    const secondCitation = sharedCardRank.days[0]!.rankingExpectations.find(
      (expectation) => expectation.feedItemId === fixtureFeedItemId(0, 1),
    ) as {
      expected: "top_read" | "exclude";
      expectedRank?: number;
    };
    secondCitation.expected = "top_read";
    secondCitation.expectedRank = 1;
    expect(() => validateGold(sharedCardRank)).not.toThrow();

    const unrelatedSharedRank = structuredClone(gold) as unknown as GoldFile;
    const unrelatedCitation =
      unrelatedSharedRank.days[0]!.rankingExpectations.find(
        (expectation) => expectation.feedItemId === fixtureFeedItemId(0, 2),
      ) as { expectedRank?: number };
    unrelatedCitation.expectedRank = 1;
    expect(() => validateGold(unrelatedSharedRank)).toThrow(
      "assigns unrelated stories to shared expected rank 1",
    );

    const splitStoryRanks = structuredClone(gold) as unknown as GoldFile;
    const sameStoryCitation = splitStoryRanks.days[0]!.rankingExpectations.find(
      (expectation) => expectation.feedItemId === fixtureFeedItemId(0, 1),
    ) as {
      expected: "top_read" | "exclude";
      expectedRank?: number;
    };
    sameStoryCitation.expected = "top_read";
    sameStoryCitation.expectedRank = 3;
    expect(() => validateGold(splitStoryRanks)).toThrow(
      "assigns story story-0-shared to multiple expected ranks",
    );
  });

  it("rejects duplicate gold dates and feed ids", () => {
    const duplicateDates = goldFile(["2026-07-09", "2026-07-09"]);
    expect(() => validateGold(duplicateDates)).toThrow("duplicate gold dates");

    const duplicateFeedIds = structuredClone(
      goldFile(["2026-07-09"]),
    ) as unknown as GoldFile;
    (
      duplicateFeedIds.days[0]!.storyExpectations as unknown as Array<unknown>
    ).push({
      feedItemId: duplicateFeedIds.days[0]!.storyExpectations[0]!.feedItemId,
      expectedStoryKey: "duplicate",
      providerKey: "fixture",
    });
    expect(() => validateGold(duplicateFeedIds)).toThrow(
      "duplicate or invalid story feed ids",
    );
  });

  it("requires five days, bounded thresholds, and review provenance", () => {
    expect(() => validateGold(goldFile(fiveDates()))).not.toThrow();

    expect(() => validateGold(goldFile(fiveDates().slice(0, 4)))).toThrow(
      "five-day statistical floor",
    );

    const invalidThreshold = structuredClone(
      goldFile(fiveDates()),
    ) as unknown as GoldFile;
    (
      invalidThreshold.thresholds as unknown as {
        minimumStoryPairPrecision: number;
      }
    ).minimumStoryPairPrecision = 1.1;
    expect(() => validateGold(invalidThreshold)).toThrow(
      "invalid quality thresholds",
    );

    const nonblockingThreshold = structuredClone(
      goldFile(fiveDates()),
    ) as unknown as GoldFile;
    (
      nonblockingThreshold.thresholds as unknown as {
        minimumRankingAccuracy: number;
      }
    ).minimumRankingAccuracy = 0;
    expect(() => validateGold(nonblockingThreshold)).toThrow(
      "nonblocking quality thresholds",
    );

    const weakProvenance = structuredClone(
      goldFile(fiveDates()),
    ) as unknown as GoldFile;
    if (weakProvenance.schemaVersion === 2) {
      (
        weakProvenance.provenance as unknown as { annotatorCount: number }
      ).annotatorCount = 1;
    }
    expect(() => validateGold(weakProvenance)).toThrow("unsupported contract");
  });

  it("rejects statistically vacuous five-day gold", () => {
    const vacuous = structuredClone(
      goldFile(fiveDates()),
    ) as unknown as GoldFile;
    for (const day of vacuous.days) {
      (day.storyExpectations as unknown as Array<unknown>).splice(1);
      (day.crossSourceExpectations as unknown as Array<unknown>).splice(
        0,
        Number.POSITIVE_INFINITY,
        {
          expectedStoryKey: day.storyExpectations[0]!.expectedStoryKey,
          expected: false,
        },
      );
      (day.rankingExpectations as unknown as Array<unknown>).splice(
        0,
        Number.POSITIVE_INFINITY,
        {
          feedItemId: day.storyExpectations[0]!.feedItemId,
          expected: "top_read",
          expectedRank: 1,
        },
      );
      (day.narrativeExpectations as unknown as Array<unknown>).splice(0);
    }

    expect(() => validateGold(vacuous)).toThrow(
      "statistically vacuous reviewed day",
    );
  });

  it("validates cross-source and narrative expectation fields", () => {
    const malformedCrossSource = structuredClone(
      goldFile(fiveDates()),
    ) as unknown as GoldFile;
    (
      malformedCrossSource.days[0]!
        .crossSourceExpectations as unknown as Array<unknown>
    ).push({ expectedStoryKey: "story-0", expected: "yes" });
    expect(() => validateGold(malformedCrossSource)).toThrow(
      "invalid cross-source expectations",
    );

    const malformedNarrative = structuredClone(
      goldFile(fiveDates()),
    ) as unknown as GoldFile;
    (
      malformedNarrative.days[0]!
        .narrativeExpectations as unknown as Array<unknown>
    ).push({ expectedStoryKey: "story-0", expectedKind: "hero" });
    expect(() => validateGold(malformedNarrative)).toThrow(
      "invalid narrative expectations",
    );
  });
});

describe("reader summary multi-day v2 artifact validation", () => {
  it("requires the caller-provided manifest trust root", () => {
    const fixture = reportFixture();

    expect(() =>
      validateExistingV2Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: `${fixture.targetPath}.different`,
      }),
    ).toThrow("targets a different manifest path");
  });

  it("accepts a fully hash-bound reviewed report", () => {
    const fixture = reportFixture();

    expect(() =>
      validateExistingV2Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).not.toThrow();
  });

  it("rejects a report with the wrong actual artifact hash", () => {
    const fixture = reportFixture();
    fixture.report.inputs.artifactBindings[0]!.artifactPayloadSha256 =
      "b".repeat(64);
    writeJson(fixture.reportPath, fixture.report);

    expect(() =>
      validateExistingV2Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("stale evaluator or input bindings");
  });

  it("rejects a stale target manifest file hash", () => {
    const fixture = reportFixture();
    writeFileSync(
      fixture.targetPath,
      `${readFileSync(fixture.targetPath, "utf8")} `,
    );

    expect(() =>
      validateExistingV2Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("stale evaluator or input bindings");
  });

  it("rejects stale reviewed corpus provenance", () => {
    const fixture = reportFixture();
    writeFileSync(fixture.corpusPath, "changed corpus\n");

    expect(() =>
      validateExistingV2Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("corpus hash is stale");
  });

  it("rejects a stale evaluator contract version", () => {
    const fixture = reportFixture();
    (
      fixture.report.inputs as unknown as {
        evaluatorContractVersion: string;
      }
    ).evaluatorContractVersion = "stale-evaluator";
    writeJson(fixture.reportPath, fixture.report);

    expect(() =>
      validateExistingV2Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("stale evaluator or input bindings");
  });
  it("rejects a report that omits a required quality gate", () => {
    const fixture = reportFixture();
    delete (fixture.report.qualityGates as unknown as Record<string, boolean>)
      .orderedRankingAccuracy;
    writeJson(fixture.reportPath, fixture.report);

    expect(() =>
      validateExistingV2Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("failed exact v2 report validation");
  });
});

function reportFixture() {
  const root = mkdtempSync(join(tmpdir(), "summary-multi-day-binding-"));
  const goldPath = join(root, "gold.json");
  const targetPath = join(root, "target.json");
  const reportPath = join(root, "report.json");
  const corpusPath = join(root, "corpus.json");
  const annotationPath = join(root, "annotations.json");
  const dates = fiveDates();
  const corpus = buildReaderSummaryMultiDayQualityCorpus({
    dates,
    tenantId: "00000000-0000-7000-8000-000000000001",
    workspaceId: "00000000-0000-7000-8000-000000000002",
    rows: dates.flatMap(sourceRows),
    highPerProvider: 1,
    lowPerProvider: 2,
  });
  writeFileSync(
    corpusPath,
    serializeReaderSummaryMultiDayQualityCorpus(corpus),
  );
  const gold = goldFile(dates, {
    corpusPath,
    corpusSha256: sha256File(corpusPath),
    annotationPath,
    annotationSha256: "pending",
  });
  const annotations = {
    schemaVersion: 2,
    artifactFormat: readerSummaryMultiDayAnnotationManifestFormat,
    corpus: {
      artifactFormat: readerSummaryMultiDayQualityCorpusFormat,
      corpusSha256: corpus.corpusSha256,
    },
    dates,
    annotations: ["1", "2"].map((suffix) => ({
      annotatorIdSha256: suffix.repeat(64),
      independent: true,
      blindToGeneratedOutputs: true,
      days: structuredClone(gold.days),
    })),
    adjudication: {
      strategy: "independent-review-then-consensus",
      version: "v1",
      adjudicatorIdSha256: "3".repeat(64),
      days: structuredClone(gold.days),
    },
  };
  writeJson(annotationPath, annotations);
  if (gold.schemaVersion === 2) {
    (gold.provenance.annotationManifest as { sha256: string }).sha256 =
      sha256File(annotationPath);
  }
  const actualDays = dates.map(actualDay);
  const target = targetManifest(dates, actualDays);
  writeJson(goldPath, gold);
  writeJson(targetPath, target);
  const evaluation = evaluateReaderSummaryMultiDayQuality({
    actualDays,
    goldDays: gold.days,
    thresholds: gold.thresholds,
    expectedGenerationProfile: target.generationProfile,
  });
  const qualityGates = {
    ...evaluation.qualityGates,
    exactReviewedArtifactBindings: true,
    currentInputFileHashesBound: true,
    goldContractV2: true,
    noRawSecretFragments: true,
  };
  const report = {
    schemaVersion: 2,
    artifactFormat: "reader-summary-multi-day-quality-report-v2",
    generatedBy: readerSummaryMultiDayQualityReportGeneratedBy,
    model: readerSummaryMultiDayQualityReportModel,
    blockingPassed: true,
    inputs: {
      database: "local-postgres",
      goldPath,
      goldSha256: sha256File(goldPath),
      goldContractVersion: 2,
      goldProvenance: gold.schemaVersion === 2 ? gold.provenance : null,
      targetManifestPath: targetPath,
      targetManifestSha256: sha256File(targetPath),
      evaluatorContractVersion: "reader-summary-multi-day-quality-evaluator-v2",
      generationProfile: target.generationProfile,
      collectionDates: target.targets.map((item) => item.collectionDate),
      artifactBindings: target.targets.map((item) => ({
        collectionDate: item.collectionDate,
        artifactId: item.artifactId,
        artifactPayloadSha256: item.artifactPayloadSha256,
        actualDayProjectionSha256: item.actualDayProjectionSha256,
      })),
      actualDays,
    },
    thresholds: gold.thresholds,
    metrics: evaluation.metrics,
    days: evaluation.days,
    qualityGates,
  };
  writeJson(reportPath, report);

  return { goldPath, targetPath, reportPath, corpusPath, report };
}

function goldFile(
  dates: readonly string[],
  provenanceFiles: {
    readonly corpusPath: string;
    readonly corpusSha256: string;
    readonly annotationPath: string;
    readonly annotationSha256: string;
  } = {
    corpusPath: "ops/evals/fixture-corpus.json",
    corpusSha256: "c".repeat(64),
    annotationPath: "ops/evals/fixture-annotations.json",
    annotationSha256: "d".repeat(64),
  },
): GoldFile {
  return {
    schemaVersion: 2,
    artifactFormat: "reader-summary-multi-day-quality-gold-v2",
    thresholds: {
      minimumDayCount: 5,
      minimumStoryPairPrecision: 0.95,
      minimumStoryPairRecall: 0.8,
      minimumCrossSourcePrecision: 0.9,
      minimumCrossSourceRecall: 0.7,
      minimumRankingAccuracy: 0.8,
      minimumNarrativeCoverage: 0.8,
      maximumWeakTopReadRate: 0.55,
    },
    provenance: {
      corpus: {
        path: provenanceFiles.corpusPath,
        artifactFormat: "reader-summary-multi-day-quality-source-corpus-v2",
        sha256: provenanceFiles.corpusSha256,
      },
      annotationManifest: {
        path: provenanceFiles.annotationPath,
        sha256: provenanceFiles.annotationSha256,
      },
      annotatorCount: 2,
      blindToGeneratedOutputs: true,
      adjudication: {
        strategy: "independent-review-then-consensus",
        version: "v1",
      },
    },
    days: dates.map((collectionDate, index) => ({
      collectionDate,
      storyExpectations: fixtureStoryExpectations(index),
      crossSourceExpectations: fixtureCrossSourceExpectations(index),
      rankingExpectations: [
        {
          feedItemId: fixtureFeedItemId(index, 0),
          expected: "top_read" as const,
          expectedRank: 1,
        },
        {
          feedItemId: fixtureFeedItemId(index, 2),
          expected: "top_read" as const,
          expectedRank: 2,
        },
        ...[1, 3, 4, 5].map((itemIndex) => ({
          feedItemId: fixtureFeedItemId(index, itemIndex),
          expected: "exclude" as const,
        })),
      ],
      narrativeExpectations: [
        {
          expectedStoryKey: fixtureStoryKey(index, "shared"),
          expectedKind: "lead" as const,
        },
        {
          expectedStoryKey: fixtureStoryKey(index, "secondary"),
          expectedKind: "secondary_signal" as const,
        },
      ],
    })),
  };
}

function fiveDates(): readonly string[] {
  return ["2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09"];
}

function targetManifest(
  dates: readonly string[],
  actualDays: readonly ReaderSummaryMultiDayActualDay[] = dates.map(actualDay),
): TargetManifestV2 {
  return {
    schemaVersion: 2,
    artifactFormat: "reader-summary-multi-day-quality-target-manifest-v2",
    generationProfile: generationProfile(),
    scope: {
      tenantId: "00000000-0000-7000-8000-000000000001",
      workspaceId: "00000000-0000-7000-8000-000000000002",
      scopeType: "workspace",
      scopeKey: "workspace:00000000-0000-7000-8000-000000000002",
    },
    targets: dates.map((collectionDate, index) => ({
      collectionDate,
      artifactId: `00000000-0000-7000-8000-${String(index + 10).padStart(12, "0")}`,
      periodKey: dailyPeriodKey(collectionDate),
      artifactPayloadSha256: "a".repeat(64),
      actualDayProjectionSha256: actualDayProjectionSha256(actualDays[index]!),
    })),
  };
}

function sourceRows(
  collectionDate: string,
  dayIndex: number,
): SourceOnlyCorpusRow[] {
  return Array.from({ length: 6 }, (_, itemIndex) => ({
    collectionDate,
    feedItemId: fixtureFeedItemId(dayIndex, itemIndex),
    providerKey: `fixture-${(itemIndex % 3) + 1}`,
    canonicalUrl: `https://example.test/${dayIndex}/${itemIndex}`,
    title: `Story ${dayIndex}-${itemIndex}`,
    bodyPreview: "Source-only fixture",
    authorHandle: null,
    publishedAt: `${collectionDate}T12:0${itemIndex}:00.000Z`,
    observedAt: `${collectionDate}T12:1${itemIndex}:00.000Z`,
    providerMetadata: { kind: "fixture" },
  }));
}

function actualDay(
  collectionDate: string,
  index: number,
): ReaderSummaryMultiDayActualDay {
  return {
    collectionDate,
    ...generationProfile(),
    storyClusters: [
      {
        id: `cluster-${index}-shared`,
        representativeFeedItemId: fixtureFeedItemId(index, 0),
        duplicateFeedItemIds: [fixtureFeedItemId(index, 1)],
        providerKeys: ["fixture-1", "fixture-2"],
      },
      ...[2, 3, 4, 5].map((itemIndex) => ({
        id: `cluster-${index}-${itemIndex}`,
        representativeFeedItemId: fixtureFeedItemId(index, itemIndex),
        duplicateFeedItemIds: [],
        providerKeys: [`fixture-${(itemIndex % 3) + 1}`],
      })),
    ],
    topReadEntries: [
      {
        citationFeedItemIds: [fixtureFeedItemId(index, 0)],
        qualityEligible: true,
      },
      {
        citationFeedItemIds: [fixtureFeedItemId(index, 2)],
        qualityEligible: true,
      },
    ],
    narrativeSections: [
      {
        kind: "lead",
        storyClusterId: `cluster-${index}-shared`,
        citationFeedItemIds: [fixtureFeedItemId(index, 0)],
      },
      {
        kind: "secondary_signal",
        storyClusterId: `cluster-${index}-2`,
        citationFeedItemIds: [fixtureFeedItemId(index, 2)],
      },
    ],
  };
}

function fixtureFeedItemId(dayIndex: number, itemIndex: number): string {
  return `story-feed-${dayIndex}-${itemIndex}`;
}

function fixtureStoryKey(dayIndex: number, suffix: string): string {
  return `story-${dayIndex}-${suffix}`;
}

function fixtureStoryExpectations(dayIndex: number) {
  return Array.from({ length: 6 }, (_, itemIndex) => ({
    feedItemId: fixtureFeedItemId(dayIndex, itemIndex),
    expectedStoryKey:
      itemIndex < 2
        ? fixtureStoryKey(dayIndex, "shared")
        : fixtureStoryKey(
            dayIndex,
            itemIndex === 2 ? "secondary" : String(itemIndex),
          ),
    providerKey: `fixture-${(itemIndex % 3) + 1}`,
  }));
}

function fixtureCrossSourceExpectations(dayIndex: number) {
  return [
    { expectedStoryKey: fixtureStoryKey(dayIndex, "shared"), expected: true },
    {
      expectedStoryKey: fixtureStoryKey(dayIndex, "secondary"),
      expected: false,
    },
    ...[3, 4, 5].map((itemIndex) => ({
      expectedStoryKey: fixtureStoryKey(dayIndex, String(itemIndex)),
      expected: false,
    })),
  ];
}

function generationProfile() {
  return {
    modelVersion: "codex:gpt-5.5:xhigh",
    promptVersion: "reader_summary.prompt.agent_runtime.v10",
    rankingPolicyVersion: "story_ranking_v8",
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
