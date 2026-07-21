import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { ReaderSummaryMultiDayGoldDay } from "@social-monitor/summary/domain";

import {
  compareUtf16CodeUnits,
  readerSummaryMultiDayQualityCorpusFormat,
} from "../capture-reader-summary-multi-day-quality-corpus";
import {
  validateCaptureCorpusDay,
  validateCaptureSelectionRule,
} from "./reader-summary-multi-day-corpus-selection";
import {
  assertPrivateCorpusFileOutsideGitWorktree,
  assertPrivateCorpusSerializedSafe,
} from "./reader-summary-multi-day-corpus-security";
import { assertPrivateEvaluationFile } from "./private-evaluation-file";
import { canonicalJson } from "./reader-summary-quality-eval-support";

export const readerSummaryMultiDayAnnotationManifestFormat =
  "reader-summary-multi-day-quality-annotation-manifest-v2";

type GoldV2Provenance = {
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

export type GoldV2WithProvenance = {
  readonly provenance: GoldV2Provenance;
  readonly days: readonly ReaderSummaryMultiDayGoldDay[];
};

type ValidatedCorpus = {
  readonly corpusSha256: string;
  readonly dates: readonly string[];
  readonly itemIdsByDate: ReadonlyMap<string, ReadonlySet<string>>;
  readonly providerByItemId: ReadonlyMap<string, string>;
};

export function validateReaderSummaryMultiDayGoldProvenanceFiles(params: {
  readonly gold: GoldV2WithProvenance;
  readonly label: string;
}): void {
  const { gold, label } = params;
  assertPrivateCorpusFileOutsideGitWorktree(gold.provenance.corpus.path);
  const corpus = validateSourceCorpusV2(
    readSha256BoundJsonFile(
      gold.provenance.corpus.path,
      gold.provenance.corpus.sha256,
      `${label} corpus`,
    ),
    `${label} corpus`,
  );
  if (
    gold.provenance.corpus.artifactFormat !==
    readerSummaryMultiDayQualityCorpusFormat
  ) {
    throw new Error(`${label} corpus provenance format is invalid`);
  }

  const annotationLabel = `${label} annotation manifest`;
  const annotationRealPath = assertPrivateEvaluationFile(
    gold.provenance.annotationManifest.path,
    annotationLabel,
  );
  validateAnnotationManifestV2({
    value: readSha256BoundJsonFile(
      annotationRealPath,
      gold.provenance.annotationManifest.sha256,
      annotationLabel,
    ),
    corpus,
    gold,
    label: annotationLabel,
  });
}

export function validateSourceCorpusV2(
  value: unknown,
  label = "source corpus",
): ValidatedCorpus {
  assertPrivateCorpusSerializedSafe(value);
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "format",
      "dates",
      "scope",
      "selectionRule",
      "redaction",
      "days",
      "handling",
      "corpusSha256",
    ]) ||
    value.schemaVersion !== 2 ||
    value.format !== readerSummaryMultiDayQualityCorpusFormat ||
    !isSha256(value.corpusSha256) ||
    !Array.isArray(value.dates) ||
    !Array.isArray(value.days)
  ) {
    throw new Error(`${label} has an unsupported source-corpus-v2 contract`);
  }
  const dates = validateDates(value.dates, label);
  validateCorpusScope(value.scope, label);
  const selectionRule = validateCaptureSelectionRule(
    value.selectionRule,
    label,
  );
  validateCorpusRedaction(value.redaction, label);
  validatePrivateHandling(value.handling, label);
  const payload = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "corpusSha256"),
  );
  if (sha256(canonicalJson(payload)) !== value.corpusSha256) {
    throw new Error(`${label} internal corpus SHA-256 is stale`);
  }

  const itemIdsByDate = new Map<string, ReadonlySet<string>>();
  const providerByItemId = new Map<string, string>();
  if (value.days.length !== dates.length) {
    throw new Error(`${label} must contain exactly one day for every date`);
  }
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index];
    const day = value.days[index];
    if (date === undefined || !isRecord(day) || day.collectionDate !== date) {
      throw new Error(`${label} day order does not match dates`);
    }
    itemIdsByDate.set(
      date,
      validateCaptureCorpusDay({
        day,
        date,
        providerByItemId,
        selectionRule,
        label,
      }),
    );
  }

  return {
    corpusSha256: value.corpusSha256,
    dates,
    itemIdsByDate,
    providerByItemId,
  };
}

function validateAnnotationManifestV2(params: {
  readonly value: unknown;
  readonly corpus: ValidatedCorpus;
  readonly gold: GoldV2WithProvenance;
  readonly label: string;
}): void {
  const { value, corpus, gold, label } = params;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "artifactFormat",
      "corpus",
      "dates",
      "annotations",
      "adjudication",
    ]) ||
    value.schemaVersion !== 2 ||
    value.artifactFormat !== readerSummaryMultiDayAnnotationManifestFormat ||
    canonicalJson(value.dates) !== canonicalJson(corpus.dates) ||
    !isRecord(value.corpus) ||
    !hasExactKeys(value.corpus, ["artifactFormat", "corpusSha256"]) ||
    value.corpus.artifactFormat !== readerSummaryMultiDayQualityCorpusFormat ||
    value.corpus.corpusSha256 !== corpus.corpusSha256 ||
    !Array.isArray(value.annotations) ||
    value.annotations.length < 2
  ) {
    throw new Error(
      `${label} has an unsupported annotation-manifest-v2 contract`,
    );
  }
  const annotators = new Set<string>();
  for (const annotation of value.annotations) {
    if (
      !isRecord(annotation) ||
      !hasExactKeys(annotation, [
        "annotatorIdSha256",
        "independent",
        "blindToGeneratedOutputs",
        "days",
      ]) ||
      !isSha256(annotation.annotatorIdSha256) ||
      annotators.has(annotation.annotatorIdSha256) ||
      annotation.independent !== true ||
      annotation.blindToGeneratedOutputs !== true ||
      !Array.isArray(annotation.days)
    ) {
      throw new Error(`${label} contains an invalid independent annotation`);
    }
    annotators.add(annotation.annotatorIdSha256);
    validateReviewedDays(annotation.days, corpus, `${label} annotation`);
  }
  if (
    gold.provenance.annotatorCount !== value.annotations.length ||
    gold.provenance.blindToGeneratedOutputs !== true ||
    !isRecord(value.adjudication) ||
    !hasExactKeys(value.adjudication, [
      "strategy",
      "version",
      "adjudicatorIdSha256",
      "days",
    ]) ||
    value.adjudication.strategy !== gold.provenance.adjudication.strategy ||
    value.adjudication.version !== gold.provenance.adjudication.version ||
    !isSha256(value.adjudication.adjudicatorIdSha256) ||
    !Array.isArray(value.adjudication.days)
  ) {
    throw new Error(`${label} adjudication provenance is invalid`);
  }
  validateReviewedDays(
    value.adjudication.days,
    corpus,
    `${label} adjudication`,
  );
  if (
    artifactCanonicalJson(value.adjudication.days) !==
    artifactCanonicalJson(gold.days)
  ) {
    throw new Error(`${label} adjudicated output does not match gold v2`);
  }
}

function validateReviewedDays(
  values: readonly unknown[],
  corpus: ValidatedCorpus,
  label: string,
): void {
  if (values.length !== corpus.dates.length) {
    throw new Error(`${label} must cover every corpus date`);
  }
  for (let index = 0; index < corpus.dates.length; index += 1) {
    const date = corpus.dates[index];
    const day = values[index];
    if (date === undefined || !isRecord(day) || day.collectionDate !== date) {
      throw new Error(`${label} date order is invalid`);
    }
    validateReviewedDay(day, date, corpus, label);
  }
}

function validateReviewedDay(
  day: Record<string, unknown>,
  date: string,
  corpus: ValidatedCorpus,
  label: string,
): void {
  if (
    !hasExactKeys(day, [
      "collectionDate",
      "storyExpectations",
      "crossSourceExpectations",
      "rankingExpectations",
      "narrativeExpectations",
    ]) ||
    !Array.isArray(day.storyExpectations) ||
    !Array.isArray(day.crossSourceExpectations) ||
    !Array.isArray(day.rankingExpectations) ||
    !Array.isArray(day.narrativeExpectations)
  ) {
    throw new Error(`${label} contains an invalid reviewed day`);
  }
  const corpusIds = corpus.itemIdsByDate.get(date) ?? new Set<string>();
  const rankedIds = new Set<string>();
  for (const expectation of day.rankingExpectations) {
    if (!isRecord(expectation) || !isNonEmptyString(expectation.feedItemId)) {
      throw new Error(`${label} contains an invalid ranking annotation`);
    }
    const allowedKeys =
      expectation.expected === "top_read"
        ? expectation.expectedRank === undefined
          ? ["feedItemId", "expected"]
          : ["feedItemId", "expected", "expectedRank"]
        : ["feedItemId", "expected"];
    if (
      !hasExactKeys(expectation, allowedKeys) ||
      !corpusIds.has(expectation.feedItemId) ||
      rankedIds.has(expectation.feedItemId) ||
      !["top_read", "exclude"].includes(String(expectation.expected)) ||
      (expectation.expected === "top_read" &&
        expectation.expectedRank !== undefined &&
        (!Number.isSafeInteger(expectation.expectedRank) ||
          Number(expectation.expectedRank) < 1))
    ) {
      throw new Error(`${label} ranking annotations do not match corpus items`);
    }
    rankedIds.add(expectation.feedItemId);
  }
  if (!sameStringSet([...rankedIds], [...corpusIds])) {
    throw new Error(
      `${label} must rank every selected corpus item exactly once`,
    );
  }

  const storyKeys = new Set<string>();
  const storyFeedIds = new Set<string>();
  const providerKeysByStoryKey = new Map<string, Set<string>>();
  for (const expectation of day.storyExpectations) {
    if (
      !isRecord(expectation) ||
      !hasExactKeys(expectation, [
        "feedItemId",
        "expectedStoryKey",
        "providerKey",
      ]) ||
      !isNonEmptyString(expectation.feedItemId) ||
      !corpusIds.has(expectation.feedItemId) ||
      !isNonEmptyString(expectation.expectedStoryKey) ||
      storyFeedIds.has(expectation.feedItemId) ||
      expectation.providerKey !==
        corpus.providerByItemId.get(expectation.feedItemId)
    ) {
      throw new Error(`${label} story annotations do not match corpus items`);
    }
    storyFeedIds.add(expectation.feedItemId);
    storyKeys.add(expectation.expectedStoryKey);
    const providerKeys =
      providerKeysByStoryKey.get(expectation.expectedStoryKey) ??
      new Set<string>();
    providerKeys.add(String(expectation.providerKey));
    providerKeysByStoryKey.set(expectation.expectedStoryKey, providerKeys);
  }
  if (!sameStringSet([...storyFeedIds], [...corpusIds])) {
    throw new Error(
      `${label} must classify every selected corpus item exactly once`,
    );
  }
  const crossSourceStoryKeys = new Set<string>();
  for (const expectation of day.crossSourceExpectations) {
    if (
      !isRecord(expectation) ||
      !hasExactKeys(expectation, ["expectedStoryKey", "expected"]) ||
      !storyKeys.has(String(expectation.expectedStoryKey)) ||
      crossSourceStoryKeys.has(String(expectation.expectedStoryKey)) ||
      typeof expectation.expected !== "boolean"
    ) {
      throw new Error(`${label} contains an invalid cross-source annotation`);
    }
    const storyKey = String(expectation.expectedStoryKey);
    const expectedCrossSource =
      (providerKeysByStoryKey.get(storyKey)?.size ?? 0) >= 2;
    if (expectation.expected !== expectedCrossSource) {
      throw new Error(
        `${label} cross-source annotation contradicts reviewed providers`,
      );
    }
    crossSourceStoryKeys.add(storyKey);
  }
  if (!sameStringSet([...crossSourceStoryKeys], [...storyKeys])) {
    throw new Error(
      `${label} must classify every story key for cross-source evidence`,
    );
  }
  const narrativeKeys = new Set<string>();
  for (const expectation of day.narrativeExpectations) {
    const narrativeKey = isRecord(expectation)
      ? `${String(expectation.expectedStoryKey)}:${String(expectation.expectedKind)}`
      : "";
    if (
      !isRecord(expectation) ||
      !hasExactKeys(expectation, ["expectedStoryKey", "expectedKind"]) ||
      !storyKeys.has(String(expectation.expectedStoryKey)) ||
      !["lead", "secondary_signal"].includes(
        String(expectation.expectedKind),
      ) ||
      narrativeKeys.has(narrativeKey)
    ) {
      throw new Error(`${label} contains an invalid narrative annotation`);
    }
    narrativeKeys.add(narrativeKey);
  }
}

function validateCorpusScope(value: unknown, label: string): void {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "tenantFingerprintSha256",
      "workspaceFingerprintSha256",
    ]) ||
    !isSha256(value.tenantFingerprintSha256) ||
    !isSha256(value.workspaceFingerprintSha256)
  ) {
    throw new Error(`${label} scope is invalid`);
  }
}

function validateCorpusRedaction(value: unknown, label: string): void {
  if (
    !isRecord(value) ||
    canonicalJson(value) !==
      canonicalJson({
        rawProviderMetadataIncluded: false,
        generatedOutputsIncluded: false,
        urlCredentialsQueryAndFragmentIncluded: false,
        secretsIncluded: false,
        titleCharacterLimit: 240,
        bodyPreviewCharacterLimit: 1_200,
      })
  ) {
    throw new Error(`${label} redaction contract is invalid`);
  }
}

function validatePrivateHandling(value: unknown, label: string): void {
  if (
    !isRecord(value) ||
    canonicalJson(value) !==
      canonicalJson({
        classification: "private_evaluation_input",
        repositoryCommitAllowed: false,
        sensitiveFields: [
          "titles",
          "body_previews",
          "author_handles",
          "url_paths",
        ],
      })
  ) {
    throw new Error(`${label} must retain the private handling contract`);
  }
}

function validateDates(
  values: readonly unknown[],
  label: string,
): readonly string[] {
  if (values.length < 5 || values.some((value) => !isDate(value))) {
    throw new Error(`${label} must contain at least five valid dates`);
  }
  const dates = values as readonly string[];
  if (
    new Set(dates).size !== dates.length ||
    canonicalJson(dates) !==
      canonicalJson([...dates].sort(compareUtf16CodeUnits))
  ) {
    throw new Error(`${label} dates must be unique and sorted`);
  }
  return dates;
}

function readSha256BoundJsonFile(
  path: string,
  expected: string,
  label: string,
): unknown {
  const bytes = readFileSync(path);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    throw new Error(`${label} hash is stale`);
  }
  return JSON.parse(bytes.toString("utf8")) as unknown;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function artifactCanonicalJson(value: unknown): string {
  return canonicalJson(JSON.parse(JSON.stringify(value)) as unknown);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return sameStringSet(Object.keys(value), keys);
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length && right.every((value) => left.includes(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
