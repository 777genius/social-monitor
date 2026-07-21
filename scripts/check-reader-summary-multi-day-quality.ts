import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { Pool } from "pg";

import { readerSummaryArtifactFromPrisma } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import {
  evaluateReaderSummaryMultiDayQuality,
  isReaderFacingQualityTopRead,
  type ReaderSummaryMultiDayActualDay,
  type ReaderSummaryMultiDayGenerationProfile,
  type ReaderSummaryMultiDayGoldDay,
  type ReaderSummaryMultiDayQualityThresholds,
  type ReaderSummaryMultiDayTopReadEntry,
} from "@social-monitor/summary/domain";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  dailyPeriodKey,
  isLocalDataSourceUnavailable,
  readExactReaderSummaryArtifact,
} from "./lib/reader-summary-quality-eval-support";
import { parseReaderSummaryMultiDayQualityCli } from "./lib/reader-summary-multi-day-quality-cli";
import { assertReaderSummaryMultiDayGoldStatisticalFloor } from "./lib/reader-summary-multi-day-quality-statistical-floor";
import {
  readJsonArtifactBinding,
  type JsonArtifactBinding,
} from "./lib/read-json-artifact-binding";
import { validateReaderSummaryMultiDayGoldProvenanceFiles } from "./lib/reader-summary-multi-day-quality-provenance";
import {
  actualDayProjectionSha256,
  readerSummaryMultiDayQualityReportGeneratedBy,
  readerSummaryMultiDayQualityReportModel,
  validateReaderSummaryMultiDayQualityReportV2,
} from "./lib/reader-summary-multi-day-quality-report";
import {
  message,
  noRawSecretFragments,
  normalizeLineEndings,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";

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

export type TargetManifestV2 = {
  readonly schemaVersion: 2;
  readonly artifactFormat: "reader-summary-multi-day-quality-target-manifest-v2";
  readonly generationProfile: ReaderSummaryMultiDayGenerationProfile;
  readonly scope: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly scopeType: "workspace";
    readonly scopeKey: string;
  };
  readonly targets: readonly {
    readonly collectionDate: string;
    readonly artifactId: string;
    readonly periodKey: string;
    readonly artifactPayloadSha256: string;
    readonly actualDayProjectionSha256: string;
  }[];
};

type ArtifactBinding = {
  readonly collectionDate: string;
  readonly artifactId: string;
  readonly artifactPayloadSha256: string;
  readonly actualDayProjectionSha256: string;
};

type BoundActualDays = {
  readonly days: readonly ReaderSummaryMultiDayActualDay[];
  readonly artifactBindings: readonly ArtifactBinding[];
};

export const evaluatorContractVersion =
  "reader-summary-multi-day-quality-evaluator-v2" as const;

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
  "currentInputFileHashesBound",
  "goldContractV2",
  "noRawSecretFragments",
] as const;

const legacyReportPath =
  "ops/evals/reader-summary-multi-day-quality-report.v1.json";
const defaultOutputPath =
  "ops/evals/reader-summary-multi-day-quality-report.v2.json";
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
    validateExistingV2Report({
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
  const targetManifestBinding = readTargetManifestV2Binding(
    options.targetManifestPath,
    gold,
  );
  const targetManifest = targetManifestBinding.value;
  const boundActual = await tryReadActualDays(targetManifest);
  if (boundActual === undefined) {
    validateExistingV2Report({
      outputPath: options.outputPath,
      targetManifestPath: options.targetManifestPath,
      goldPath: options.goldPath,
    });
    return;
  }
  const evaluation = evaluateReaderSummaryMultiDayQuality({
    actualDays: boundActual.days,
    goldDays: gold.days,
    thresholds: gold.thresholds,
    expectedGenerationProfile: targetManifest.generationProfile,
  });
  const reportWithoutSecretGate = {
    schemaVersion: 2,
    artifactFormat: "reader-summary-multi-day-quality-report-v2",
    generatedBy: readerSummaryMultiDayQualityReportGeneratedBy,
    model: readerSummaryMultiDayQualityReportModel,
    inputs: {
      database: "local-postgres",
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
      "Evaluator quality gate inventory changed without a v2 contract update",
    );
  }
  const report = {
    ...reportWithoutSecretGate,
    qualityGates,
    blockingPassed: Object.values(qualityGates).every(Boolean),
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (options.update) {
    mkdirSync(dirname(options.outputPath), { recursive: true });
    writeFileSync(options.outputPath, serialized);
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
    `Reader summary multi-day quality OK (${report.metrics.dayCount} exact reviewed artifacts)`,
  );
}

async function tryReadActualDays(
  manifest: TargetManifestV2,
): Promise<BoundActualDays | undefined> {
  const pool = new Pool({
    connectionString: yesterdaySocialQualityDatabaseUrl(),
    min: 0,
    max: 2,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const days: ReaderSummaryMultiDayActualDay[] = [];
    const artifactBindings: ArtifactBinding[] = [];
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
      const actualDay = actualDayFromRecord(
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

    return { days, artifactBindings };
  } catch (error) {
    if (!isLocalDataSourceUnavailable(error)) {
      throw error;
    }
    console.warn(`Multi-day quality source unavailable: ${message(error)}`);
    return undefined;
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

function actualDayFromRecord(
  collectionDate: string,
  record: Parameters<typeof readerSummaryArtifactFromPrisma>[0],
): ReaderSummaryMultiDayActualDay {
  const snapshot = readerSummaryArtifactFromPrisma(record).toSnapshot();
  const citationById = new Map(
    snapshot.citationMap.map((citation) => [citation.citationId, citation]),
  );
  const topReads = snapshot.content?.topReads ?? [];
  const topReadEntries = projectReaderSummaryMultiDayTopReadEntries({
    collectionDate,
    topReads: topReads.map((topRead) => ({
      citationIds: topRead.citationIds,
      qualityEligible: isReaderFacingQualityTopRead(topRead),
    })),
    citationFeedItemIdByCitationId: new Map(
      [...citationById].map(([citationId, citation]) => [
        citationId,
        citation.feedItemId,
      ]),
    ),
  });

  return {
    collectionDate,
    modelVersion: record.modelVersion,
    promptVersion: record.promptVersion,
    rankingPolicyVersion: snapshot.lineage.rankingPolicyVersion ?? "unknown",
    storyClusters: snapshot.storyClusters.map((cluster) => ({
      id: cluster.id,
      representativeFeedItemId: cluster.representativeFeedItemId,
      duplicateFeedItemIds: cluster.duplicateFeedItemIds,
      providerKeys: cluster.providerKeys,
    })),
    topReadEntries,
    narrativeSections: (snapshot.content?.narrativeSections ?? []).map(
      (section) => ({
        kind: section.kind,
        ...(section.storyClusterId === undefined
          ? {}
          : { storyClusterId: section.storyClusterId }),
        citationFeedItemIds: section.citationIds
          .map((citationId) => citationById.get(citationId)?.feedItemId)
          .filter(
            (feedItemId): feedItemId is string => feedItemId !== undefined,
          ),
      }),
    ),
  };
}

export function projectReaderSummaryMultiDayTopReadEntries(params: {
  readonly collectionDate: string;
  readonly topReads: readonly {
    readonly citationIds: readonly string[];
    readonly qualityEligible: boolean;
  }[];
  readonly citationFeedItemIdByCitationId: ReadonlyMap<string, string>;
}): readonly ReaderSummaryMultiDayTopReadEntry[] {
  return params.topReads.map((topRead, index) => {
    const rank = index + 1;
    if (topRead.citationIds.length === 0) {
      throw new Error(
        `Reviewed top-read card ${rank} for ${params.collectionDate} has no citations`,
      );
    }
    const citationFeedItemIds = topRead.citationIds.map((citationId) => {
      const feedItemId = params.citationFeedItemIdByCitationId.get(citationId);
      if (feedItemId === undefined) {
        throw new Error(
          `Reviewed top-read card ${rank} for ${params.collectionDate} references unresolved citation ${citationId}`,
        );
      }
      return feedItemId;
    });
    return {
      citationFeedItemIds,
      qualityEligible: topRead.qualityEligible,
    };
  });
}

export function readTargetManifestV2(
  path: string,
  gold: GoldFile,
): TargetManifestV2 {
  return readTargetManifestV2Binding(path, gold).value;
}

function readTargetManifestV2Binding(
  path: string,
  gold: GoldFile,
): JsonArtifactBinding<TargetManifestV2> {
  return readJsonArtifactBinding({
    path,
    validate: (value, label) => validateTargetManifestV2(value, gold, label),
  });
}

export function validateTargetManifestV2(
  value: unknown,
  gold: GoldFile,
  label = "target manifest",
): TargetManifestV2 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    value.artifactFormat !==
      "reader-summary-multi-day-quality-target-manifest-v2" ||
    !isGenerationProfile(value.generationProfile) ||
    !isRecord(value.scope) ||
    value.scope.scopeType !== "workspace" ||
    !isUuid(value.scope.tenantId) ||
    !isUuid(value.scope.workspaceId) ||
    value.scope.scopeKey !== `workspace:${String(value.scope.workspaceId)}` ||
    !Array.isArray(value.targets)
  ) {
    throw new Error(`${label} has an unsupported v2 contract`);
  }
  const dates = new Set<string>();
  const artifactIds = new Set<string>();
  for (const rawTarget of value.targets) {
    if (
      !isRecord(rawTarget) ||
      !isDate(rawTarget.collectionDate) ||
      !isUuid(rawTarget.artifactId) ||
      !isSha256(rawTarget.artifactPayloadSha256) ||
      !isSha256(rawTarget.actualDayProjectionSha256) ||
      rawTarget.periodKey !== dailyPeriodKey(rawTarget.collectionDate)
    ) {
      throw new Error(`${label} contains an invalid target binding`);
    }
    if (dates.has(rawTarget.collectionDate)) {
      throw new Error(`${label} contains duplicate collection dates`);
    }
    if (artifactIds.has(rawTarget.artifactId)) {
      throw new Error(`${label} contains duplicate artifact ids`);
    }
    dates.add(rawTarget.collectionDate);
    artifactIds.add(rawTarget.artifactId);
  }
  const goldDates = gold.days.map((day) => day.collectionDate);
  if (
    value.targets.length !== goldDates.length ||
    goldDates.some((date) => !dates.has(date))
  ) {
    throw new Error(
      `${label} must bind exactly one artifact for every gold day`,
    );
  }

  return value as unknown as TargetManifestV2;
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

export function validateExistingV2Report(params: {
  readonly outputPath: string;
  readonly targetManifestPath: string;
  readonly goldPath?: string;
}): void {
  if (!existsSync(params.outputPath)) {
    throw new Error(`${params.outputPath} is missing`);
  }
  const parsed: unknown = JSON.parse(readFileSync(params.outputPath, "utf8"));
  if (!isRecord(parsed) || !isRecord(parsed.inputs)) {
    throw new Error(`${params.outputPath} failed v2 artifact validation`);
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
  const manifestBinding = readTargetManifestV2Binding(
    params.targetManifestPath,
    gold,
  );
  const manifest = manifestBinding.value;
  const expectedBindings = manifest.targets.map((target) => ({
    collectionDate: target.collectionDate,
    artifactId: target.artifactId,
    artifactPayloadSha256: target.artifactPayloadSha256,
    actualDayProjectionSha256: target.actualDayProjectionSha256,
  }));
  const expectedDates = manifest.targets.map((target) => target.collectionDate);
  validateReaderSummaryMultiDayQualityReportV2({
    value: parsed,
    expectedInputsWithoutActualDays: {
      database: "local-postgres",
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
  console.log("Reader summary multi-day quality v2 artifact OK");
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

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
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
