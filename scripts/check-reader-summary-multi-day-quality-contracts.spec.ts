import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateReaderSummaryMultiDayQuality,
  type ReaderSummaryMultiDayActualDay,
} from "@social-monitor/summary/domain";

import {
  evaluatorContractVersion,
  legacyEvaluatorV3Diagnostic,
  legacyReportV2Diagnostic,
  legacyTargetManifestV3Diagnostic,
  type GoldFile,
  type TargetManifestV2,
  type TargetManifestV3,
  type TargetManifestV4,
  validateExistingV3Report,
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
  readerSummaryMultiDayQualityReportModelV3,
} from "./lib/reader-summary-multi-day-quality-report";
import { dailyPeriodKey } from "./lib/reader-summary-quality-eval-support";

describe("reader summary multi-day v3 artifact validation", () => {
  it("requires the caller-provided manifest trust root", () => {
    const fixture = reportFixture();

    expect(() =>
      validateExistingV3Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: `${fixture.targetPath}.different`,
      }),
    ).toThrow("targets a different manifest path");
  });

  it("accepts a fully hash-bound reviewed report", () => {
    const fixture = reportFixture();
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      expect(() =>
        validateExistingV3Report({
          outputPath: fixture.reportPath,
          goldPath: fixture.goldPath,
          targetManifestPath: fixture.targetPath,
        }),
      ).not.toThrow();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("CI and release status are not asserted"),
      );
      expect(JSON.stringify(fixture.report)).not.toContain(
        "currentAtValidation",
      );
      expect(fixture.report.model).toMatchObject({
        ciEnforced: false,
        releaseStatusAsserted: false,
        artifactOnlyCurrentAtValidationAsserted: false,
      });
      expect(fixture.report.qualityGates).not.toHaveProperty(
        "currentPublicArtifactBindings",
      );
    } finally {
      log.mockRestore();
    }
  });

  it("classifies immutable report v2 and evaluator v3 identities as legacy", () => {
    const legacyReport = reportFixture(3);
    rewriteAsLegacyV2Report(legacyReport);
    expect(() => validateFixture(legacyReport)).toThrow(
      legacyReportV2Diagnostic,
    );

    const legacyEvaluator = reportFixture();
    (
      legacyEvaluator.report.inputs as unknown as {
        evaluatorContractVersion: string;
      }
    ).evaluatorContractVersion =
      "reader-summary-multi-day-quality-evaluator-v3";
    writeJson(legacyEvaluator.reportPath, legacyEvaluator.report);
    expect(() => validateFixture(legacyEvaluator)).toThrow(
      legacyEvaluatorV3Diagnostic,
    );
  });

  it("fails closed when the report-bound target manifest file is missing", () => {
    const fixture = reportFixture();
    unlinkSync(fixture.targetPath);

    expect(() =>
      validateExistingV3Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow(`${fixture.targetPath} is missing`);
  });

  it("applies private evaluation-file policy to the target manifest", () => {
    const readable = reportFixture();
    chmodSync(readable.targetPath, 0o640);

    expect(() =>
      validateExistingV3Report({
        outputPath: readable.reportPath,
        goldPath: readable.goldPath,
        targetManifestPath: readable.targetPath,
      }),
    ).toThrow("owner-readable, owner-only private file permissions");

    const symlinked = reportFixture();
    const alias = `${symlinked.targetPath}.alias`;
    symlinkSync(symlinked.targetPath, alias);
    symlinked.report.inputs.targetManifestPath = alias;
    writeJson(symlinked.reportPath, symlinked.report);
    expect(() =>
      validateExistingV3Report({
        outputPath: symlinked.reportPath,
        goldPath: symlinked.goldPath,
        targetManifestPath: alias,
      }),
    ).toThrow("must not be a symlink");

    const tracked = reportFixture();
    const trackedPath = join(process.cwd(), "package.json");
    tracked.report.inputs.targetManifestPath = trackedPath;
    writeJson(tracked.reportPath, tracked.report);
    expect(() =>
      validateExistingV3Report({
        outputPath: tracked.reportPath,
        goldPath: tracked.goldPath,
        targetManifestPath: trackedPath,
      }),
    ).toThrow("must be outside every Git worktree");
  });

  it("rejects a passing gold v2 report bound only to nonblocking manifest v2", () => {
    const fixture = reportFixture(2);

    expect(() =>
      validateExistingV3Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow(
      "v2 is nonblocking; blocking and artifact-only validation require target manifest v4",
    );
  });

  it("validates old target v3 before classifying it as legacy/nonblocking", () => {
    const fixture = reportFixture(3);

    expect(() => validateFixture(fixture)).toThrow(
      legacyTargetManifestV3Diagnostic,
    );
  });

  it("fails closed on mismatched report, target and evaluator versions", () => {
    const reportIdentity = reportFixture();
    (
      reportIdentity.report as unknown as { schemaVersion: number }
    ).schemaVersion = 99;
    writeJson(reportIdentity.reportPath, reportIdentity.report);
    expect(() => validateFixture(reportIdentity)).toThrow(
      "unsupported report contract identity; expected report v3",
    );

    const fixture = reportFixture();
    writeJson(fixture.targetPath, {
      schemaVersion: 3,
      artifactFormat: "reader-summary-multi-day-quality-target-manifest-v4",
    });
    expect(() => validateFixture(fixture)).toThrow(
      "unsupported target manifest contract identity; expected target manifest v4",
    );

    const evaluatorIdentity = reportFixture();
    (
      evaluatorIdentity.report.inputs as unknown as {
        evaluatorContractVersion: string;
      }
    ).evaluatorContractVersion =
      "reader-summary-multi-day-quality-evaluator-v99";
    writeJson(evaluatorIdentity.reportPath, evaluatorIdentity.report);
    expect(() => validateFixture(evaluatorIdentity)).toThrow(
      "unsupported evaluator contract identity; expected evaluator v4",
    );
  });

  it("rejects a report with the wrong actual artifact hash", () => {
    const fixture = reportFixture();
    (
      fixture.report.inputs.artifactBindings[0] as {
        artifactPayloadSha256: string;
      }
    ).artifactPayloadSha256 = "b".repeat(64);
    writeJson(fixture.reportPath, fixture.report);

    expect(() =>
      validateExistingV3Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("stale evaluator or input bindings");
  });

  it.each([
    "publicationId",
    "reportSha256",
    "proofSha256",
    "exactProofSha256",
  ] as const)("rejects a stale v4 %s binding", (field) => {
    const fixture = reportFixture();
    const binding = fixture.report.inputs.artifactBindings[0] as unknown as
      Record<string, string>;
    binding[field] = field === "publicationId"
      ? "00000000-0000-7000-8000-000000000999"
      : "e".repeat(64);
    writeJson(fixture.reportPath, fixture.report);

    expect(() =>
      validateExistingV3Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("stale evaluator or input bindings");
  });

  it("rejects a wrong but well-formed database fingerprint", () => {
    const fixture = reportFixture();
    (
      fixture.report.inputs as unknown as { databaseFingerprint: string }
    ).databaseFingerprint = `postgres-sha256:${"e".repeat(64)}`;
    writeJson(fixture.reportPath, fixture.report);

    expect(() =>
      validateExistingV3Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("stale evaluator or input bindings");
  });

  it("rejects capture identity and freshness fields not bound to the manifest", () => {
    const fixture = reportFixture();
    (
      fixture.report.inputs as unknown as {
        capturedAt: string;
        currentAtCapture: boolean;
      }
    ).capturedAt = "2026-07-21T00:11:00.000Z";
    writeJson(fixture.reportPath, fixture.report);

    expect(() =>
      validateExistingV3Report({
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
      validateExistingV3Report({
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
      validateExistingV3Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("corpus hash is stale");
  });

  it("rejects stale reviewed annotation provenance", () => {
    const fixture = reportFixture();
    writeFileSync(fixture.annotationPath, "changed annotations\n");

    expect(() =>
      validateExistingV3Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("annotation manifest hash is stale");
  });

  it("rejects an unknown evaluator contract version", () => {
    const fixture = reportFixture();
    (
      fixture.report.inputs as unknown as {
        evaluatorContractVersion: string;
      }
    ).evaluatorContractVersion = "stale-evaluator";
    writeJson(fixture.reportPath, fixture.report);

    expect(() =>
      validateExistingV3Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("unsupported evaluator contract identity");
  });
  it("rejects a report that omits a required quality gate", () => {
    const fixture = reportFixture();
    delete (fixture.report.qualityGates as unknown as Record<string, boolean>)
      .orderedRankingAccuracy;
    writeJson(fixture.reportPath, fixture.report);

    expect(() =>
      validateExistingV3Report({
        outputPath: fixture.reportPath,
        goldPath: fixture.goldPath,
        targetManifestPath: fixture.targetPath,
      }),
    ).toThrow("failed exact v3 report validation");
  });
});


function reportFixture(targetVersion: 2 | 3 | 4 = 4) {
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
  const target = targetVersion === 4
    ? targetManifestV4(dates, actualDays)
    : targetVersion === 3
      ? targetManifestV3(dates, actualDays)
      : targetManifest(dates, actualDays);
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
    ...(target.schemaVersion === 4
      ? { capturedCurrentPublicArtifactBindings: true }
      : {}),
    currentInputFileHashesBound: true,
    goldContractV2: true,
    noRawSecretFragments: true,
  };
  const report = {
    schemaVersion: 3,
    artifactFormat: "reader-summary-multi-day-quality-report-v3",
    generatedBy: readerSummaryMultiDayQualityReportGeneratedBy,
    model: readerSummaryMultiDayQualityReportModelV3,
    blockingPassed: true,
    inputs: {
      databaseFingerprint: target.schemaVersion === 4
        ? target.databaseFingerprint
        : "local-postgres",
      capturedAt: target.schemaVersion === 4 ? target.capturedAt : null,
      currentAtCapture: target.schemaVersion === 4
        ? target.currentAtCapture
        : false,
      goldPath,
      goldSha256: sha256File(goldPath),
      goldContractVersion: 2,
      goldProvenance: gold.schemaVersion === 2 ? gold.provenance : null,
      targetManifestPath: targetPath,
      targetManifestSha256: sha256File(targetPath),
      evaluatorContractVersion,
      generationProfile: target.generationProfile,
      collectionDates: target.targets.map((item) => item.collectionDate),
      artifactBindings: target.schemaVersion === 2
        ? target.targets.map((item) => ({
            collectionDate: item.collectionDate,
            artifactId: item.artifactId,
            artifactPayloadSha256: item.artifactPayloadSha256,
            actualDayProjectionSha256: item.actualDayProjectionSha256,
          }))
        : target.targets,
      actualDays,
    },
    thresholds: gold.thresholds,
    metrics: evaluation.metrics,
    days: evaluation.days,
    qualityGates,
  };
  writeJson(reportPath, report);

  return {
    goldPath,
    targetPath,
    reportPath,
    corpusPath,
    annotationPath,
    report,
  };
}

function validateFixture(fixture: ReturnType<typeof reportFixture>): void {
  validateExistingV3Report({
    outputPath: fixture.reportPath,
    goldPath: fixture.goldPath,
    targetManifestPath: fixture.targetPath,
  });
}

function rewriteAsLegacyV2Report(
  fixture: ReturnType<typeof reportFixture>,
): void {
  const report = fixture.report as unknown as Record<string, unknown>;
  report.schemaVersion = 2;
  report.artifactFormat = "reader-summary-multi-day-quality-report-v2";
  report.model = {
    liveNetwork: false,
    persistedArtifacts: true,
    mutableLatestArtifacts: false,
    rawPostTextPersistedInReport: false,
    rawProviderPayloadPersistedInReport: false,
  };
  const inputs = fixture.report.inputs as unknown as Record<string, unknown>;
  delete inputs.databaseFingerprint;
  delete inputs.capturedAt;
  delete inputs.currentAtCapture;
  inputs.database = "local-postgres";
  inputs.evaluatorContractVersion =
    "reader-summary-multi-day-quality-evaluator-v3";
  const gates = fixture.report.qualityGates as unknown as Record<string, boolean>;
  gates.currentPublicArtifactBindings = true;
  writeJson(fixture.reportPath, report);
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

function targetManifestV4(
  dates: readonly string[],
  actualDays: readonly ReaderSummaryMultiDayActualDay[] = dates.map(actualDay),
): TargetManifestV4 {
  return {
    schemaVersion: 4,
    artifactFormat: "reader-summary-multi-day-quality-target-manifest-v4",
    databaseFingerprint: `postgres-sha256:${"f".repeat(64)}`,
    capturedAt: "2026-07-21T00:10:00.000Z",
    currentAtCapture: true,
    generationProfile: generationProfile(),
    scope: {
      tenantId: "00000000-0000-7000-8000-000000000001",
      workspaceId: "00000000-0000-7000-8000-000000000002",
      scopeType: "workspace",
      scopeKey: "workspace",
    },
    targets: dates.map((collectionDate, index) => ({
      collectionDate,
      periodKey: dailyPeriodKey(collectionDate),
      publicationId: `00000000-0000-7000-8000-${String(index + 100).padStart(12, "0")}`,
      artifactId: `00000000-0000-7000-8000-${String(index + 10).padStart(12, "0")}`,
      reportSha256: "b".repeat(64),
      proofSha256: "c".repeat(64),
      exactProofSha256: "c".repeat(64),
      artifactPayloadSha256: "a".repeat(64),
      actualDayProjectionSha256: actualDayProjectionSha256(actualDays[index]!),
    })),
  };
}

function targetManifestV3(
  dates: readonly string[],
  actualDays: readonly ReaderSummaryMultiDayActualDay[] = dates.map(actualDay),
): TargetManifestV3 {
  const v4 = targetManifestV4(dates, actualDays);
  return {
    schemaVersion: 3,
    artifactFormat: "reader-summary-multi-day-quality-target-manifest-v3",
    generationProfile: v4.generationProfile,
    scope: v4.scope,
    targets: v4.targets,
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
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
