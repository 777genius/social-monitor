import {
  evaluateReaderSummaryMultiDayQuality,
  type ReaderSummaryMultiDayActualDay,
  type ReaderSummaryMultiDayGenerationProfile,
  type ReaderSummaryMultiDayGoldDay,
  type ReaderSummaryMultiDayQualityThresholds,
} from "@social-monitor/summary/domain";
import { assertValidReaderSummaryMultiDayQualityInputs } from "@social-monitor/summary/domain/policies/reader-summary-multi-day-quality-input-validation";

import {
  noRawSecretFragments,
} from "./yesterday-social-replay-support";
import {
  canonicalJson,
  canonicalJsonSha256,
} from "./reader-summary-quality-eval-support";

export const readerSummaryMultiDayQualityReportGeneratedBy =
  "npm run check:reader-summary-multi-day-quality";

export const readerSummaryMultiDayQualityReportModel = {
  liveNetwork: false,
  persistedArtifacts: true,
  mutableLatestArtifacts: false,
  rawPostTextPersistedInReport: false,
  rawProviderPayloadPersistedInReport: false,
} as const;

export type HashBoundQualityTarget = {
  readonly collectionDate: string;
  readonly artifactId: string;
  readonly artifactPayloadSha256: string;
  readonly actualDayProjectionSha256: string;
};

export type HashBoundArtifactBinding = HashBoundQualityTarget;

export function validateReaderSummaryMultiDayQualityReportV2(params: {
  readonly value: unknown;
  readonly expectedInputsWithoutActualDays: Readonly<Record<string, unknown>>;
  readonly goldDays: readonly ReaderSummaryMultiDayGoldDay[];
  readonly thresholds: ReaderSummaryMultiDayQualityThresholds;
  readonly generationProfile: ReaderSummaryMultiDayGenerationProfile;
  readonly targets: readonly HashBoundQualityTarget[];
  readonly expectedQualityGateNames: readonly string[];
  readonly label: string;
}): void {
  const { value, label } = params;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "artifactFormat",
      "generatedBy",
      "model",
      "inputs",
      "thresholds",
      "metrics",
      "days",
      "qualityGates",
      "blockingPassed",
    ]) ||
    value.schemaVersion !== 2 ||
    value.artifactFormat !== "reader-summary-multi-day-quality-report-v2" ||
    value.generatedBy !== readerSummaryMultiDayQualityReportGeneratedBy ||
    canonicalJson(value.model) !==
      canonicalJson(readerSummaryMultiDayQualityReportModel) ||
    value.blockingPassed !== true ||
    !isRecord(value.inputs) ||
    !Array.isArray(value.inputs.actualDays) ||
    !isRecord(value.qualityGates) ||
    !sameStringSet(
      Object.keys(value.qualityGates),
      params.expectedQualityGateNames,
    ) ||
    !noRawSecretFragments(value)
  ) {
    throw new Error(`${label} failed exact v2 report validation`);
  }

  const { actualDays: rawActualDays, ...inputsWithoutActualDays } = value.inputs;
  if (
    canonicalJson(inputsWithoutActualDays) !==
    canonicalJson(params.expectedInputsWithoutActualDays)
  ) {
    throw new Error(`${label} has stale evaluator or input bindings`);
  }
  const actualDays = validateActualDayProjections(
    rawActualDays,
    params.targets,
    label,
  );
  assertValidReaderSummaryMultiDayQualityInputs(actualDays, params.goldDays);
  const evaluation = evaluateReaderSummaryMultiDayQuality({
    actualDays,
    goldDays: params.goldDays,
    thresholds: params.thresholds,
    expectedGenerationProfile: params.generationProfile,
  });
  const expectedGates = {
    ...evaluation.qualityGates,
    exactReviewedArtifactBindings: true,
    ...(params.expectedQualityGateNames.includes("currentPublicArtifactBindings")
      ? { currentPublicArtifactBindings: true }
      : {}),
    currentInputFileHashesBound: true,
    goldContractV2: true,
    noRawSecretFragments: true,
  };
  if (
    !sameStringSet(
      Object.keys(expectedGates),
      params.expectedQualityGateNames,
    ) ||
    !Object.values(expectedGates).every(Boolean) ||
    artifactCanonicalJson(value.thresholds) !==
      artifactCanonicalJson(params.thresholds) ||
    artifactCanonicalJson(value.metrics) !==
      artifactCanonicalJson(evaluation.metrics) ||
    artifactCanonicalJson(value.days) !== artifactCanonicalJson(evaluation.days) ||
    artifactCanonicalJson(value.qualityGates) !==
      artifactCanonicalJson(expectedGates)
  ) {
    throw new Error(`${label} evaluation evidence is stale or forged`);
  }
}

export function actualDayProjectionSha256(
  day: ReaderSummaryMultiDayActualDay,
): string {
  return canonicalJsonSha256(day);
}

function validateActualDayProjections(
  values: readonly unknown[],
  targets: readonly HashBoundQualityTarget[],
  label: string,
): readonly ReaderSummaryMultiDayActualDay[] {
  if (values.length !== targets.length) {
    throw new Error(`${label} actual-day projection count is invalid`);
  }
  const days: ReaderSummaryMultiDayActualDay[] = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const value = values[index];
    if (
      target === undefined ||
      !isActualDay(value) ||
      value.collectionDate !== target.collectionDate ||
      actualDayProjectionSha256(value) !== target.actualDayProjectionSha256
    ) {
      throw new Error(`${label} actual-day projection hash is stale`);
    }
    days.push(value);
  }
  return days;
}

function isActualDay(value: unknown): value is ReaderSummaryMultiDayActualDay {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "collectionDate",
      "modelVersion",
      "promptVersion",
      "rankingPolicyVersion",
      "storyClusters",
      "topReadEntries",
      "narrativeSections",
    ]) ||
    !isDate(value.collectionDate) ||
    !isNonEmptyString(value.modelVersion) ||
    !isNonEmptyString(value.promptVersion) ||
    !isNonEmptyString(value.rankingPolicyVersion) ||
    !Array.isArray(value.topReadEntries) ||
    !Array.isArray(value.storyClusters) ||
    !Array.isArray(value.narrativeSections)
  ) {
    return false;
  }
  return value.topReadEntries.every(isActualTopReadEntry) &&
    value.storyClusters.every(isActualStoryCluster) &&
    value.narrativeSections.every(isActualNarrativeSection);
}

function isActualTopReadEntry(value: unknown): boolean {
  return isRecord(value) &&
    hasExactKeys(value, ["citationFeedItemIds", "qualityEligible"]) &&
    isUniqueNonEmptyStringArray(value.citationFeedItemIds) &&
    typeof value.qualityEligible === "boolean";
}

function isActualStoryCluster(value: unknown): boolean {
  return isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "representativeFeedItemId",
      "duplicateFeedItemIds",
      "providerKeys",
    ]) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.representativeFeedItemId) &&
    isUniqueStringArray(value.duplicateFeedItemIds) &&
    !value.duplicateFeedItemIds.includes(value.representativeFeedItemId) &&
    isUniqueNonEmptyStringArray(value.providerKeys);
}

function isActualNarrativeSection(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const expectedKeys = value.storyClusterId === undefined
    ? ["kind", "citationFeedItemIds"]
    : ["kind", "storyClusterId", "citationFeedItemIds"];
  return hasExactKeys(value, expectedKeys) &&
    ["lead", "main_signal", "why_it_matters", "secondary_signal", "watch"].includes(
      String(value.kind),
    ) &&
    (value.storyClusterId === undefined || isNonEmptyString(value.storyClusterId)) &&
    isUniqueNonEmptyStringArray(value.citationFeedItemIds);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && right.every((value) => left.includes(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isUniqueStringArray(value: unknown): value is readonly string[] {
  return isStringArray(value) && new Set(value).size === value.length;
}

function isUniqueNonEmptyStringArray(
  value: unknown,
): value is readonly string[] {
  return isUniqueStringArray(value) && value.length > 0;
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function artifactCanonicalJson(value: unknown): string {
  return canonicalJson(JSON.parse(JSON.stringify(value)) as unknown);
}
