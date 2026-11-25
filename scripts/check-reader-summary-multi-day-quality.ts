import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "pg";

import {
  evaluateReaderSummaryMultiDayQuality,
  type ReaderSummaryMultiDayActualDay,
  type ReaderSummaryMultiDayGenerationProfile,
  type ReaderSummaryMultiDayGoldDay,
  type ReaderSummaryMultiDayQualityThresholds,
} from "@social-monitor/summary/domain";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  readExactReaderSummaryArtifact,
} from "./lib/reader-summary-quality-eval-support";
import {
  projectReaderSummaryMultiDayTopReadEntries,
  readerSummaryMultiDayActualDayFromRecord,
} from "./lib/reader-summary-multi-day-actual-day";
import {
  databaseFingerprintLabel,
  readCurrentPublicArtifactSnapshot,
} from "./lib/reader-summary-current-publication-bindings";
import { parseReaderSummaryMultiDayQualityCli } from "./lib/reader-summary-multi-day-quality-cli";
import { assertReaderSummaryMultiDayGoldStatisticalFloor } from "./lib/reader-summary-multi-day-quality-statistical-floor";
import {
  readJsonArtifactBinding,
  type JsonArtifactBinding,
} from "./lib/read-json-artifact-binding";
import { assertPrivateEvaluationFile } from "./lib/private-evaluation-file";
import { validateReaderSummaryMultiDayGoldProvenanceFiles } from "./lib/reader-summary-multi-day-quality-provenance";
import {
  actualDayProjectionSha256,
  readerSummaryMultiDayQualityReportGeneratedBy,
  readerSummaryMultiDayQualityReportModelV3,
  validateReaderSummaryMultiDayQualityReportV3,
} from "./lib/reader-summary-multi-day-quality-report";
import {
  validateTargetManifestV2 as validateTargetManifestV2Contract,
  validateTargetManifestV3 as validateTargetManifestV3Contract,
  validateTargetManifestV4 as validateTargetManifestV4Contract,
  type TargetManifest,
  type TargetManifestV2,
  type TargetManifestV3,
  type TargetManifestV4,
} from "./lib/reader-summary-multi-day-target-manifest";
import { writePrivateJsonAtomically } from "./lib/private-json-artifact";
import {
  noRawSecretFragments,
  normalizeLineEndings,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";

export { projectReaderSummaryMultiDayTopReadEntries };
export type { TargetManifestV2, TargetManifestV3, TargetManifestV4 };

export type GoldFileV1 = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-multi-day-quality-gold-v1";
  readonly thresholds: ReaderSummaryMultiDayQualityThresholds;
  readonly generationProfile: ReaderSummaryMultiDayGenerationProfile;
  readonly days: readonly ReaderSummaryMultiDayGoldDay[];
};

export type GoldFileV2 = {
  readonly schemaVersion: 2;
  readonly artifactFormat: "reader-summary-multi-day-quality-gold-v2";
  readonly thresholds: ReaderSummaryMultiDayQualityThresholds;
  readonly provenance: {
    readonly corpus: {
      readonly path: string;
      readonly artifactFormat: string;
      readonly sha256: string;
    };
    readonly annotationManifest: {
      readonly path: string;
      readonly sha256: string;
    };
    readonly annotatorCount: number;
    readonly blindToGeneratedOutputs: true;
    readonly adjudication: {
      readonly strategy: string;
      readonly version: string;
    };
  };
  readonly days: readonly ReaderSummaryMultiDayGoldDay[];
};

export type GoldFile = GoldFileV1 | GoldFileV2;

type BoundActualDays = {
  readonly days: readonly ReaderSummaryMultiDayActualDay[];
  readonly artifactBindings: readonly Record<string, unknown>[];
  readonly databaseFingerprint: string;
  readonly capturedAt: string | null;
  readonly currentAtCapture: boolean;
  readonly capturedCurrentPublicArtifactBindings: boolean;
};

export const evaluatorContractVersion =
  "reader-summary-multi-day-quality-evaluator-v4" as const;

export const legacyTargetManifestV3Diagnostic =
  "LEGACY/NONBLOCKING: target manifest v3 uses current-at-validation semantics; recapture as target manifest v4";
export const legacyEvaluatorV3Diagnostic =
  "LEGACY/NONBLOCKING: evaluator v3 uses current-at-validation semantics; regenerate with evaluator v4";
export const legacyReportV2Diagnostic =
  "LEGACY/NONBLOCKING: report v2 predates captured-current artifact-only semantics; regenerate as report v3";

export const expectedQualityGateNames = [
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

const legacyReportPath =
  "ops/evals/reader-summary-multi-day-quality-report.v1.json";
const defaultOutputPath =
  "ops/evals/reader-summary-multi-day-quality-report.v3.json";
const defaultGoldPath =
  "ops/evals/reader-summary-multi-day-quality-gold.v2.json";

if (require.main === module) {
  void main();
}

async function main(): Promise<void> {
  const options = parseReaderSummaryMultiDayQualityCli({
    args: process.argv.slice(2),
    defaultOutputPath,
    defaultGoldPath,
  });
  if (options.mode === "legacy_observational") {
    validateLegacyObservationalReport();
    return;
  }
  if (options.mode === "artifact_only") {
    validateExistingV3Report({
      outputPath: options.outputPath,
      targetManifestPath: options.targetManifestPath,
      goldPath: options.goldPath,
    });
    return;
  }

  const goldBinding = readGoldBinding(options.goldPath);
  const gold = goldBinding.value;
  if (gold.schemaVersion === 1 && options.mode !== "migration_diagnostic") {
    throw new Error(
      "Gold v1 is nonblocking and requires --migration-diagnostic with an isolated output",
    );
  }
  if (gold.schemaVersion === 2 && options.mode === "migration_diagnostic") {
    throw new Error("--migration-diagnostic accepts only deprecated gold v1");
  }
  if (options.mode === "migration_diagnostic") {
    console.warn(
      "DEPRECATED/NONBLOCKING: gold v1 is accepted for migration diagnostics but cannot pass the v2 blocking gate; generation profile authority is the target manifest",
    );
  }
  const targetManifestBinding = readTargetManifestBinding(
    options.targetManifestPath,
    gold,
    options.mode,
  );
  const targetManifest = targetManifestBinding.value;
  const boundActual = await readBoundActualDays(targetManifest);
  const evaluation = evaluateReaderSummaryMultiDayQuality({
    actualDays: boundActual.days,
    goldDays: gold.days,
    thresholds: gold.thresholds,
    expectedGenerationProfile: targetManifest.generationProfile,
  });
  const reportWithoutSecretGate = {
    schemaVersion: 3,
    artifactFormat: "reader-summary-multi-day-quality-report-v3",
    generatedBy: readerSummaryMultiDayQualityReportGeneratedBy,
    model: readerSummaryMultiDayQualityReportModelV3,
    inputs: {
      databaseFingerprint: boundActual.databaseFingerprint,
      capturedAt: boundActual.capturedAt,
      currentAtCapture: boundActual.currentAtCapture,
      goldPath: options.goldPath,
      goldSha256: goldBinding.sha256,
      goldContractVersion: gold.schemaVersion,
      goldProvenance: gold.schemaVersion === 2 ? gold.provenance : null,
      targetManifestPath: options.targetManifestPath,
      targetManifestSha256: targetManifestBinding.sha256,
      evaluatorContractVersion,
      generationProfile: targetManifest.generationProfile,
      collectionDates: targetManifest.targets.map(
        (target) => target.collectionDate,
      ),
      artifactBindings: boundActual.artifactBindings,
      actualDays: boundActual.days,
    },
    thresholds: gold.thresholds,
    ...evaluation,
    qualityGates: {
      ...evaluation.qualityGates,
      exactReviewedArtifactBindings: true,
      capturedCurrentPublicArtifactBindings:
        boundActual.capturedCurrentPublicArtifactBindings,
      currentInputFileHashesBound: true,
      goldContractV2: gold.schemaVersion === 2,
      noRawSecretFragments: true,
    },
    blockingPassed: false,
  } as const;
  const qualityGates = {
    ...reportWithoutSecretGate.qualityGates,
    noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
  };
  if (!sameStringSet(Object.keys(qualityGates), expectedQualityGateNames)) {
    throw new Error(
      "Evaluator quality gate inventory changed without a v4 contract update",
    );
  }
  const report = {
    ...reportWithoutSecretGate,
    qualityGates,
    blockingPassed: Object.values(qualityGates).every(Boolean),
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (options.update) {
    writePrivateJsonAtomically({
      path: options.outputPath,
      value: report,
      replace: true,
    });
    console.log(`Updated ${options.outputPath}`);
  } else if (!existsSync(options.outputPath)) {
    throw new Error(
      `${options.outputPath} is missing; review and run with --update`,
    );
  } else {
    const expected = normalizeLineEndings(
      readFileSync(options.outputPath, "utf8"),
    );
    if (expected !== serialized) {
      throw new Error(
        `${options.outputPath} is stale. Re-run with --update after reviewing the bound results.`,
      );
    }
  }

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Reader summary multi-day quality gates failed");
  }
  console.log(
    `Manual reader summary multi-day captured-current quality evidence passed (${report.metrics.dayCount} exact reviewed artifacts); CI and release status are not asserted`,
  );
}

async function readBoundActualDays(
  manifest: TargetManifest,
): Promise<BoundActualDays> {
  const databaseUrl = yesterdaySocialQualityDatabaseUrl();
  const pool = new Pool({
    connectionString: databaseUrl,
    min: 0,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    if (manifest.schemaVersion === 4) {
      const snapshot = await readCurrentPublicArtifactSnapshot({
        pool,
        databaseUrl,
        scope: manifest.scope,
        collectionDates: manifest.targets.map((target) => target.collectionDate),
        expectedManifest: manifest,
      });
      return {
        days: snapshot.actualDays,
        artifactBindings: snapshot.targets,
        databaseFingerprint: manifest.databaseFingerprint,
        capturedAt: manifest.capturedAt,
        currentAtCapture: manifest.currentAtCapture,
        capturedCurrentPublicArtifactBindings: true,
      };
    }

    if (manifest.schemaVersion === 3) {
      throw new Error(legacyTargetManifestV3Diagnostic);
    }

    const days: ReaderSummaryMultiDayActualDay[] = [];
    const artifactBindings: Record<string, unknown>[] = [];
    for (const target of manifest.targets) {
      const bound = await readExactReaderSummaryArtifact(pool, {
        ...target,
        tenantId: tenantId(manifest.scope.tenantId),
        workspaceId: workspaceId(manifest.scope.workspaceId),
        scopeType: manifest.scope.scopeType,
        scopeKey: manifest.scope.scopeKey,
        modelVersion: manifest.generationProfile.modelVersion,
        promptVersion: manifest.generationProfile.promptVersion,
        rankingPolicyVersion: manifest.generationProfile.rankingPolicyVersion,
      });
      if (bound === null) {
        throw new Error(
          `Reviewed artifact ${target.artifactId} for ${target.collectionDate} is missing or its exact scope, period, status, or generation profile drifted`,
        );
      }
      assertArtifactPayloadSha256({
        collectionDate: target.collectionDate,
        expected: target.artifactPayloadSha256,
        actual: bound.artifactPayloadSha256,
      });
      const actualDay = readerSummaryMultiDayActualDayFromRecord(
        target.collectionDate,
        bound.record,
      );
      assertActualDayProjectionSha256({
        collectionDate: target.collectionDate,
        expected: target.actualDayProjectionSha256,
        actual: actualDayProjectionSha256(actualDay),
      });
      artifactBindings.push({
        collectionDate: target.collectionDate,
        artifactId: target.artifactId,
        artifactPayloadSha256: bound.artifactPayloadSha256,
        actualDayProjectionSha256: target.actualDayProjectionSha256,
      });
      days.push(actualDay);
    }

    return {
      days,
      artifactBindings,
      databaseFingerprint: databaseFingerprintLabel(databaseUrl),
      capturedAt: null,
      currentAtCapture: false,
      capturedCurrentPublicArtifactBindings: false,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export function assertArtifactPayloadSha256(params: {
  readonly collectionDate: string;
  readonly expected: string;
  readonly actual: string;
}): void {
  if (params.actual !== params.expected) {
    throw new Error(
      `Reviewed artifact payload hash mismatch for ${params.collectionDate}`,
    );
  }
}

export function assertActualDayProjectionSha256(params: {
  readonly collectionDate: string;
  readonly expected: string;
  readonly actual: string;
}): void {
  if (params.actual !== params.expected) {
    throw new Error(
      `Reviewed actual-day projection hash mismatch for ${params.collectionDate}`,
    );
  }
}

export function readTargetManifestV2(
  path: string,
  gold: GoldFile,
): TargetManifestV2 {
  const realPath = assertPrivateEvaluationFile(path, path);
  return readJsonArtifactBinding({
    path: realPath,
    label: path,
    validate: (value, label) => validateTargetManifestV2(value, gold, label),
  }).value;
}

function readTargetManifestBinding(
  path: string,
  gold: GoldFile,
  mode: "blocking" | "migration_diagnostic" | "artifact_only",
): JsonArtifactBinding<TargetManifest> {
  const realPath = assertPrivateEvaluationFile(path, path);
  return readJsonArtifactBinding({
    path: realPath,
    label: path,
    validate: (value, label) => {
      if (
        isRecord(value) &&
        value.schemaVersion === 2 &&
        value.artifactFormat ===
          "reader-summary-multi-day-quality-target-manifest-v2"
      ) {
        if (mode !== "migration_diagnostic") {
          throw new Error(
            `${label} v2 is nonblocking; blocking and artifact-only validation require target manifest v4`,
          );
        }
        return validateTargetManifestV2(value, gold, label);
      }
      if (
        isRecord(value) &&
        value.schemaVersion === 3 &&
        value.artifactFormat ===
          "reader-summary-multi-day-quality-target-manifest-v3"
      ) {
        validateTargetManifestV3(value, gold, label);
        throw new Error(legacyTargetManifestV3Diagnostic);
      }
      if (
        isRecord(value) &&
        value.schemaVersion === 4 &&
        value.artifactFormat ===
          "reader-summary-multi-day-quality-target-manifest-v4"
      ) {
        return validateTargetManifestV4(value, gold, label);
      }
      throw new Error(
        `${label} has an unsupported target manifest contract identity; expected target manifest v4`,
      );
    },
  });
}

export function validateTargetManifestV2(
  value: unknown,
  gold: GoldFile,
  label = "target manifest",
): TargetManifestV2 {
  return validateTargetManifestV2Contract(
    value,
    gold.days.map((day) => day.collectionDate),
    label,
  );
}

export function validateTargetManifestV3(
  value: unknown,
  gold: GoldFile,
  label = "target manifest",
): TargetManifestV3 {
  return validateTargetManifestV3Contract(
    value,
    gold.days.map((day) => day.collectionDate),
    label,
  );
}

export function validateTargetManifestV4(
  value: unknown,
  gold: GoldFile,
  label = "target manifest",
): TargetManifestV4 {
  return validateTargetManifestV4Contract(
    value,
    gold.days.map((day) => day.collectionDate),
    label,
  );
}

export function readGold(path: string): GoldFile {
  return readGoldBinding(path).value;
}

function readGoldBinding(path: string): JsonArtifactBinding<GoldFile> {
  const binding = readJsonArtifactBinding({ path, validate: validateGold });
  const gold = binding.value;
  if (gold.schemaVersion === 2) {
    validateGoldProvenanceFiles(gold, path);
  }
  return binding;
}

export function validateGold(value: unknown, label = "gold file"): GoldFile {
  const isV1 =
    isRecord(value) &&
    value.schemaVersion === 1 &&
    value.artifactFormat === "reader-summary-multi-day-quality-gold-v1" &&
    isGenerationProfile(value.generationProfile);
  const isV2 =
    isRecord(value) &&
    value.schemaVersion === 2 &&
    value.artifactFormat === "reader-summary-multi-day-quality-gold-v2" &&
    value.generationProfile === undefined &&
    isGoldV2Provenance(value.provenance);
  if (
    !isRecord(value) ||
    (!isV1 && !isV2) ||
    !isRecord(value.thresholds) ||
    !Array.isArray(value.days)
  ) {
    throw new Error(`${label} has an unsupported contract`);
  }
  const dates = new Set<string>();
  const storyFeedIds = new Set<string>();
  const rankingFeedIds = new Set<string>();
  for (const rawDay of value.days) {
    validateGoldDay(rawDay, label, dates, storyFeedIds, rankingFeedIds, isV2);
  }
  if (isV2) {
    validateGoldV2StatisticalFloor(value, label);
  }
  return value as unknown as GoldFile;
}

function validateGoldDay(
  value: unknown,
  label: string,
  dates: Set<string>,
  storyFeedIds: Set<string>,
  rankingFeedIds: Set<string>,
  strictV2: boolean,
): void {
  if (
    !isRecord(value) ||
    !isDate(value.collectionDate) ||
    !Array.isArray(value.storyExpectations) ||
    !Array.isArray(value.crossSourceExpectations) ||
    !Array.isArray(value.rankingExpectations) ||
    !Array.isArray(value.narrativeExpectations)
  ) {
    throw new Error(`${label} contains an invalid gold day`);
  }
  if (dates.has(value.collectionDate)) {
    throw new Error(`${label} contains duplicate gold dates`);
  }
  dates.add(value.collectionDate);

  const storyKeyByFeedItemId = new Map<string, string>();
  for (const expectation of value.storyExpectations) {
    if (
      !isRecord(expectation) ||
      !isNonEmptyString(expectation.feedItemId) ||
      (strictV2 &&
        (!isNonEmptyString(expectation.expectedStoryKey) ||
          !isNonEmptyString(expectation.providerKey))) ||
      storyFeedIds.has(expectation.feedItemId)
    ) {
      throw new Error(`${label} contains duplicate or invalid story feed ids`);
    }
    storyFeedIds.add(expectation.feedItemId);
    if (strictV2) {
      storyKeyByFeedItemId.set(
        expectation.feedItemId,
        String(expectation.expectedStoryKey),
      );
    }
  }
  let orderedExpectationCount = 0;
  const storyKeyByExpectedRank = new Map<number, string>();
  const expectedRankByStoryKey = new Map<string, number>();
  for (const expectation of value.rankingExpectations) {
    if (!isRecord(expectation) || !isNonEmptyString(expectation.feedItemId)) {
      throw new Error(`${label} contains an invalid ranking expectation`);
    }
    if (rankingFeedIds.has(expectation.feedItemId)) {
      throw new Error(`${label} contains duplicate ranking feed ids`);
    }
    rankingFeedIds.add(expectation.feedItemId);
    if (expectation.expected === "exclude") {
      if (expectation.expectedRank !== undefined) {
        throw new Error(`${label} gives an excluded item an expected rank`);
      }
      continue;
    }
    if (expectation.expected !== "top_read") {
      throw new Error(`${label} contains an invalid ranking outcome`);
    }
    if (expectation.expectedRank !== undefined) {
      if (
        !Number.isSafeInteger(expectation.expectedRank) ||
        Number(expectation.expectedRank) < 1
      ) {
        throw new Error(`${label} contains an invalid expected rank`);
      }
      orderedExpectationCount += 1;
      if (strictV2) {
        assertCoherentSharedCardRank({
          expectation,
          storyKeyByFeedItemId,
          storyKeyByExpectedRank,
          expectedRankByStoryKey,
          label,
        });
      }
    }
  }
  if (strictV2 && orderedExpectationCount === 0) {
    throw new Error(
      `${label} requires at least one ordered ranking expectation per day`,
    );
  }
  if (strictV2) {
    validateCrossSourceExpectations(value.crossSourceExpectations, label);
    validateNarrativeExpectations(value.narrativeExpectations, label);
  }
}

function assertCoherentSharedCardRank(params: {
  readonly expectation: Record<string, unknown>;
  readonly storyKeyByFeedItemId: ReadonlyMap<string, string>;
  readonly storyKeyByExpectedRank: Map<number, string>;
  readonly expectedRankByStoryKey: Map<string, number>;
  readonly label: string;
}): void {
  const feedItemId = String(params.expectation.feedItemId);
  const expectedRank = Number(params.expectation.expectedRank);
  const storyKey = params.storyKeyByFeedItemId.get(feedItemId);
  if (storyKey === undefined) {
    throw new Error(
      `${params.label} ordered ranking feed item is missing a story expectation`,
    );
  }
  const rankStoryKey = params.storyKeyByExpectedRank.get(expectedRank);
  if (rankStoryKey !== undefined && rankStoryKey !== storyKey) {
    throw new Error(
      `${params.label} assigns unrelated stories to shared expected rank ${expectedRank}`,
    );
  }
  const storyRank = params.expectedRankByStoryKey.get(storyKey);
  if (storyRank !== undefined && storyRank !== expectedRank) {
    throw new Error(
      `${params.label} assigns story ${storyKey} to multiple expected ranks`,
    );
  }
  params.storyKeyByExpectedRank.set(expectedRank, storyKey);
  params.expectedRankByStoryKey.set(storyKey, expectedRank);
}

function validateCrossSourceExpectations(
  values: readonly unknown[],
  label: string,
): void {
  const storyKeys = new Set<string>();
  for (const value of values) {
    if (
      !isRecord(value) ||
      !isNonEmptyString(value.expectedStoryKey) ||
      typeof value.expected !== "boolean" ||
      storyKeys.has(value.expectedStoryKey)
    ) {
      throw new Error(
        `${label} contains duplicate or invalid cross-source expectations`,
      );
    }
    storyKeys.add(value.expectedStoryKey);
  }
}

function validateNarrativeExpectations(
  values: readonly unknown[],
  label: string,
): void {
  const keys = new Set<string>();
  for (const value of values) {
    const key = isRecord(value)
      ? `${String(value.expectedStoryKey)}:${String(value.expectedKind)}`
      : "";
    if (
      !isRecord(value) ||
      !isNonEmptyString(value.expectedStoryKey) ||
      !["lead", "secondary_signal"].includes(String(value.expectedKind)) ||
      keys.has(key)
    ) {
      throw new Error(
        `${label} contains duplicate or invalid narrative expectations`,
      );
    }
    keys.add(key);
  }
}

function validateGoldV2StatisticalFloor(
  value: Record<string, unknown>,
  label: string,
): void {
  const days = value.days as readonly unknown[];
  const thresholds = value.thresholds;
  if (!isQualityThresholds(thresholds)) {
    throw new Error(`${label} contains invalid quality thresholds`);
  }
  assertReaderSummaryMultiDayGoldStatisticalFloor({
    days,
    thresholds,
    label,
  });
}

function isQualityThresholds(
  value: unknown,
): value is ReaderSummaryMultiDayQualityThresholds {
  if (!isRecord(value)) {
    return false;
  }
  const minimumDayCount = value.minimumDayCount;
  const rates = [
    value.minimumStoryPairPrecision,
    value.minimumStoryPairRecall,
    value.minimumCrossSourcePrecision,
    value.minimumCrossSourceRecall,
    value.minimumRankingAccuracy,
    value.minimumNarrativeCoverage,
    value.maximumWeakTopReadRate,
  ];
  return (
    Number.isSafeInteger(minimumDayCount) &&
    Number(minimumDayCount) >= 1 &&
    rates.every(
      (rate) =>
        typeof rate === "number" &&
        Number.isFinite(rate) &&
        rate >= 0 &&
        rate <= 1,
    )
  );
}

function isGoldV2Provenance(value: unknown): value is GoldFileV2["provenance"] {
  return (
    isRecord(value) &&
    sameStringSet(Object.keys(value), [
      "corpus",
      "annotationManifest",
      "annotatorCount",
      "blindToGeneratedOutputs",
      "adjudication",
    ]) &&
    isRecord(value.corpus) &&
    sameStringSet(Object.keys(value.corpus), [
      "path",
      "artifactFormat",
      "sha256",
    ]) &&
    isNonEmptyString(value.corpus.path) &&
    value.corpus.artifactFormat ===
      "reader-summary-multi-day-quality-source-corpus-v2" &&
    isSha256(value.corpus.sha256) &&
    isRecord(value.annotationManifest) &&
    sameStringSet(Object.keys(value.annotationManifest), ["path", "sha256"]) &&
    isNonEmptyString(value.annotationManifest.path) &&
    isSha256(value.annotationManifest.sha256) &&
    Number.isSafeInteger(value.annotatorCount) &&
    Number(value.annotatorCount) >= 2 &&
    value.blindToGeneratedOutputs === true &&
    isRecord(value.adjudication) &&
    sameStringSet(Object.keys(value.adjudication), ["strategy", "version"]) &&
    isNonEmptyString(value.adjudication.strategy) &&
    isNonEmptyString(value.adjudication.version)
  );
}

function validateGoldProvenanceFiles(gold: GoldFileV2, label: string): void {
  validateReaderSummaryMultiDayGoldProvenanceFiles({ gold, label });
}

export function validateExistingV3Report(params: {
  readonly outputPath: string;
  readonly targetManifestPath: string;
  readonly goldPath?: string;
}): void {
  if (!existsSync(params.outputPath)) {
    throw new Error(`${params.outputPath} is missing`);
  }
  const parsed: unknown = JSON.parse(readFileSync(params.outputPath, "utf8"));
  assertArtifactOnlyReportContractIdentity(parsed, params.outputPath);
  if (!isRecord(parsed.inputs)) {
    throw new Error(`${params.outputPath} failed v3 artifact validation`);
  }
  const inputs = parsed.inputs;
  const expectedGoldPath = params.goldPath ?? defaultGoldPath;
  if (
    !isNonEmptyString(inputs.targetManifestPath) ||
    resolve(params.targetManifestPath) !== resolve(inputs.targetManifestPath)
  ) {
    throw new Error(`${params.outputPath} targets a different manifest path`);
  }
  const goldBinding = readGoldBinding(expectedGoldPath);
  const gold = goldBinding.value;
  if (gold.schemaVersion !== 2) {
    throw new Error(`${params.outputPath} requires a v2 gold contract`);
  }
  const manifestBinding = readTargetManifestBinding(
    params.targetManifestPath,
    gold,
    "artifact_only",
  );
  const manifest = manifestBinding.value;
  if (manifest.schemaVersion !== 4) {
    throw new Error(
      `${params.targetManifestPath} is nonblocking; artifact-only validation requires target manifest v4`,
    );
  }
  const expectedBindings = manifest.targets;
  const expectedDates = manifest.targets.map((target) => target.collectionDate);
  validateReaderSummaryMultiDayQualityReportV3({
    value: parsed,
    expectedInputsWithoutActualDays: {
      databaseFingerprint: manifest.databaseFingerprint,
      capturedAt: manifest.capturedAt,
      currentAtCapture: manifest.currentAtCapture,
      goldPath: expectedGoldPath,
      goldSha256: goldBinding.sha256,
      goldContractVersion: 2,
      goldProvenance: gold.provenance,
      targetManifestPath: params.targetManifestPath,
      targetManifestSha256: manifestBinding.sha256,
      evaluatorContractVersion,
      generationProfile: manifest.generationProfile,
      collectionDates: expectedDates,
      artifactBindings: expectedBindings,
    },
    goldDays: gold.days,
    thresholds: gold.thresholds,
    generationProfile: manifest.generationProfile,
    targets: manifest.targets,
    expectedQualityGateNames,
    label: params.outputPath,
  });
  console.log(
    "Manual reader summary multi-day captured-current artifact validation OK; CI and release status are not asserted",
  );
}

function assertArtifactOnlyReportContractIdentity(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (
    isRecord(value) &&
    value.schemaVersion === 2 &&
    value.artifactFormat === "reader-summary-multi-day-quality-report-v2"
  ) {
    throw new Error(legacyReportV2Diagnostic);
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 3 ||
    value.artifactFormat !== "reader-summary-multi-day-quality-report-v3"
  ) {
    throw new Error(
      `${label} has an unsupported report contract identity; expected report v3`,
    );
  }
  if (!isRecord(value.inputs)) {
    return;
  }
  if (
    value.inputs.evaluatorContractVersion ===
    "reader-summary-multi-day-quality-evaluator-v3"
  ) {
    throw new Error(legacyEvaluatorV3Diagnostic);
  }
  if (value.inputs.evaluatorContractVersion !== evaluatorContractVersion) {
    throw new Error(
      `${label} has an unsupported evaluator contract identity; expected evaluator v4`,
    );
  }
}

function validateLegacyObservationalReport(): void {
  if (!existsSync(legacyReportPath)) {
    throw new Error(`${legacyReportPath} is missing`);
  }
  const parsed: unknown = JSON.parse(readFileSync(legacyReportPath, "utf8"));
  if (
    !isRecord(parsed) ||
    parsed.artifactFormat !== "reader-summary-multi-day-quality-report-v1" ||
    !noRawSecretFragments(parsed)
  ) {
    throw new Error(`${legacyReportPath} failed legacy artifact validation`);
  }
  console.warn(
    "DEPRECATED/NONBLOCKING: v1 latest-artifact report is observational only; provide --target-manifest for the v2 blocking gate",
  );
}

function isGenerationProfile(
  value: unknown,
): value is ReaderSummaryMultiDayGenerationProfile {
  return (
    isRecord(value) &&
    isNonEmptyString(value.modelVersion) &&
    isNonEmptyString(value.promptVersion) &&
    isNonEmptyString(value.rankingPolicyVersion)
  );
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  return new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sameStringSet(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
