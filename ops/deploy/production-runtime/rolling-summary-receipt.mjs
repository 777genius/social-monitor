#!/usr/bin/env node

import {
  chmodSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import process from "node:process";

const requiredProviders = [
  "github-trending-page",
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
];
const terminalStatuses = ["succeeded", "failed", "skipped"];
const coverageStates = ["complete", "partial", "degraded", "unavailable"];
const acquisitionModes = ["live_collection", "durable_snapshot_reuse"];
const paginationStopReasons = [
  "single_page",
  "target_items",
  "no_next_cursor",
  "cursor_not_advanced",
  "low_new_item_yield",
  "high_duplicate_rate",
  "max_pages",
  "partial_retryable_failure",
  "durable_snapshot_reuse",
  "failed",
  "skipped",
];
const sloReasons = [
  "target_missing",
  "target_shortfall",
  "freshness_missing",
  "freshness_lag_exceeded",
  "rate_limited",
  "partial_retryable_failure",
  "provider_unavailable",
];
const retryDispositions = ["none", "immediate", "deferred"];
const collectionArtifactFormat = "reader-summary-clean-real-day-collection-v1";
const collectionGeneratedBy =
  "npm run run:reader-summary-clean-real-day-collection";
const receiptArtifactFormat = "social-monitor-rolling-summary-receipt-v1";
const productionScope = {
  tenantId: "00000000-0000-7000-8000-000000006101",
  workspaceId: "00000000-0000-7000-8000-000000006102",
};

const [command, ...args] = process.argv.slice(2);

if (command === "validate-collection") {
  const [path, date] = args;
  validateCollection(readJson(path), date);
} else if (command === "write-receipt") {
  writeReceipt(args);
} else if (command === "validate-receipt") {
  const [path, runId, date] = args;
  validateReceipt(readJson(path), runId, date);
} else {
  throw new Error("rolling summary receipt command is invalid");
}

function validateReceipt(receipt, runId, date) {
  if (!isRecord(receipt)) {
    throw new Error("rolling summary receipt is inconsistent");
  }
  const publicationStatus = receipt.publication?.status;
  if (
    receipt.schemaVersion !== 1 ||
    receipt.artifactFormat !== receiptArtifactFormat ||
    receipt.runId !== runId ||
    receipt.collectionDate !== date ||
    receipt.status !== "SUCCESS" ||
    !isValidReceiptPeriod(receipt.period, receipt.completedAt, date) ||
    !isValidCommandExitCode(receipt.collection?.commandExitCode) ||
    typeof receipt.collection?.finalDayQualityGatePassed !== "boolean" ||
    receipt.collection.finalDayQualityGatePassed !==
      (receipt.collection.commandExitCode === 0) ||
    !hasExactTerminalProviders(receipt.collection?.providers, true) ||
    !isNonemptyString(receipt.publication?.readerSummaryJobId) ||
    !isNonemptyString(receipt.publication?.readerSummaryId) ||
    !["completed", "no_signal"].includes(publicationStatus) ||
    !isValidSummaryEvidence({
      result: receipt.summary,
      redaction: receipt.redaction,
    }) ||
    receipt.summary.readerSummaryJobId !==
      receipt.publication.readerSummaryJobId ||
    receipt.summary.readerSummaryId !== receipt.publication.readerSummaryId ||
    receipt.summary.status !== publicationStatus
  ) {
    throw new Error("rolling summary receipt is inconsistent");
  }
}

function validateCollection(report, date) {
  if (
    !isRecord(report) ||
    report.schemaVersion !== 1 ||
    report.artifactFormat !== collectionArtifactFormat ||
    report.generatedBy !== collectionGeneratedBy ||
    report.run?.collectionDate !== date ||
    !isOrderedIsoPeriod(report.run?.startedAt, report.run?.completedAt) ||
    report.inputs?.database !== "local-postgres" ||
    !hasValidOptionalScope(report.inputs?.scope) ||
    typeof report.inputs?.xCollectorConfigured !== "boolean" ||
    report.inputs?.targetPublishedWindow?.startInclusive !==
      `${date}T00:00:00.000Z` ||
    report.inputs?.targetPublishedWindow?.endExclusive !== nextUtcDate(date) ||
    !hasExactProviderKeys(report.inputs?.providerKeys) ||
    !hasExactAcquisitionModel(report.model) ||
    report.model?.rawProviderPayloadPersistedInReport !== false ||
    report.model?.rawPostTextPersistedInReport !== false ||
    report.model?.rawProviderConfigPersistedInReport !== false ||
    report.qualityGates?.noRawSecretFragments !== true ||
    typeof report.blockingPassed !== "boolean" ||
    !hasExactTargets(report.targets) ||
    !hasExactTerminalProviders(report.scans, false) ||
    !hasConsistentCollectionBindings(
      report.model,
      report.targets,
      report.scans,
    ) ||
    !isCompleteWindow(report.freshWindow) ||
    !isCompleteWindow(report.targetWindow)
  ) {
    throw new Error("rolling collection contract is invalid");
  }
}

function writeReceipt(args) {
  const [
    receiptPath,
    evidencePath,
    collectionPath,
    runId,
    date,
    endedAt,
    collectionExit,
  ] = args;
  const evidence = readJson(evidencePath);
  const collection = readJson(collectionPath);
  validateCollection(collection, date);
  if (!isValidSummaryEvidence(evidence)) {
    throw new Error("rolling summary evidence contract is invalid");
  }
  const collectionExitCode = parseCommandExitCode(collectionExit);
  if ((collectionExitCode === 0) !== collection.blockingPassed) {
    throw new Error("rolling collection exit code contradicts quality gate");
  }
  const receipt = {
    schemaVersion: 1,
    artifactFormat: receiptArtifactFormat,
    runId,
    collectionDate: date,
    period: { startedAt: `${date}T00:00:00.000Z`, endedAt },
    completedAt: new Date().toISOString(),
    status: "SUCCESS",
    collection: {
      commandExitCode: collectionExitCode,
      finalDayQualityGatePassed: collection.blockingPassed === true,
      providers: collection.scans.map((scan) => ({
        providerKey: scan.providerKey,
        status: scan.status,
        fetched: scan.fetched,
        inserted: scan.inserted,
        skippedDuplicates: scan.skippedDuplicates,
        coverageState: scan.observability?.coverageState ?? null,
      })),
    },
    summary: evidence.result,
    publication: {
      readerSummaryJobId: evidence.result.readerSummaryJobId,
      readerSummaryId: evidence.result.readerSummaryId,
      status: evidence.result.status,
    },
    redaction: evidence.redaction,
  };
  validateReceipt(receipt, runId, date);
  const next = `${receiptPath}.next`;
  rmSync(next, { force: true });
  writeFileSync(next, `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(next, 0o444);
  renameSync(next, receiptPath);
}

function hasValidOptionalScope(scope) {
  return (
    scope === undefined ||
    (isRecord(scope) &&
      scope.tenantId === productionScope.tenantId &&
      scope.workspaceId === productionScope.workspaceId)
  );
}

function hasConsistentCollectionBindings(model, targets, scans) {
  if (!isRecord(model) || !Array.isArray(targets) || !Array.isArray(scans)) {
    return false;
  }
  return requiredProviders.every((providerKey) => {
    const target = targets.find((entry) => entry.providerKey === providerKey);
    const scan = scans.find((entry) => entry.providerKey === providerKey);
    if (!isRecord(target) || !isRecord(scan)) return false;
    const expectedAcquisitionMode = model.liveNetworkProviderKeys.includes(
      providerKey,
    )
      ? "live_collection"
      : "durable_snapshot_reuse";
    return (
      scan.bindingFingerprint === target.bindingFingerprint &&
      scan.acquisitionMode === expectedAcquisitionMode
    );
  });
}

function hasExactAcquisitionModel(model) {
  if (
    !isRecord(model) ||
    model.mode !== "targeted_real_binding_collection" ||
    typeof model.liveNetwork !== "boolean" ||
    !Array.isArray(model.liveNetworkProviderKeys) ||
    !Array.isArray(model.durableSnapshotReuseProviderKeys)
  ) {
    return false;
  }
  const providerKeys = [
    ...model.liveNetworkProviderKeys,
    ...model.durableSnapshotReuseProviderKeys,
  ];
  return (
    model.liveNetwork === model.liveNetworkProviderKeys.length > 0 &&
    hasExactProviderKeys(providerKeys)
  );
}

function hasExactTargets(targets) {
  return (
    Array.isArray(targets) &&
    targets.length === requiredProviders.length &&
    requiredProviders.every(
      (provider) =>
        targets.filter(
          (target) =>
            isRecord(target) &&
            target.providerKey === provider &&
            isNonemptyString(target.bindingFingerprint) &&
            isNonemptyString(target.interestFingerprint) &&
            isNonemptyString(target.workspaceFingerprint) &&
            typeof target.plannerEnabled === "boolean" &&
            typeof target.canaryRollout === "boolean",
        ).length === 1,
    )
  );
}

function hasExactProviderKeys(providerKeys) {
  return (
    Array.isArray(providerKeys) &&
    providerKeys.length === requiredProviders.length &&
    requiredProviders.every(
      (provider) =>
        providerKeys.filter((providerKey) => providerKey === provider)
          .length === 1,
    )
  );
}

function hasExactTerminalProviders(providers, receipt) {
  return (
    Array.isArray(providers) &&
    providers.length === requiredProviders.length &&
    requiredProviders.every(
      (provider) =>
        providers.filter(
          (entry) =>
            isRecord(entry) &&
            entry.providerKey === provider &&
            terminalStatuses.includes(entry.status) &&
            (receipt
              ? isCompleteProviderReceipt(entry)
              : isCompleteCollectionScan(entry)),
        ).length === 1,
    )
  );
}

function isCompleteCollectionScan(scan) {
  return (
    isNonemptyString(scan.bindingFingerprint) &&
    acquisitionModes.includes(scan.acquisitionMode) &&
    Number.isInteger(scan.attemptCount) &&
    scan.attemptCount >= 1 &&
    scan.attemptCount <= 3 &&
    isNonnegativeInteger(scan.fetched) &&
    isNonnegativeInteger(scan.inserted) &&
    isNonnegativeInteger(scan.projected) &&
    isNonnegativeInteger(scan.skippedDuplicates) &&
    isNonnegativeInteger(scan.warningCount) &&
    isCompleteObservation(scan.observability, scan.acquisitionMode)
  );
}

function isCompleteObservation(observation, acquisitionMode) {
  if (!isRecord(observation)) return false;
  const targetItemCount = observation.targetItemCount;
  return (
    (targetItemCount === null || isNonnegativeInteger(targetItemCount)) &&
    observation.acquisitionMode === acquisitionMode &&
    isNonnegativeInteger(observation.collectedItemCount) &&
    isNonnegativeInteger(observation.acceptedItemCount) &&
    isNonnegativeInteger(observation.insertedItemCount) &&
    isNonnegativeInteger(observation.outsideWindowItemCount) &&
    isNonnegativeInteger(observation.paginationDuplicateItemCount) &&
    isNonnegativeInteger(observation.storageDuplicateItemCount) &&
    isNonnegativeInteger(observation.totalDuplicateItemCount) &&
    observation.totalDuplicateItemCount ===
      observation.paginationDuplicateItemCount +
        observation.storageDuplicateItemCount &&
    isNonnegativeInteger(observation.pageCount) &&
    paginationStopReasons.includes(observation.paginationStopReason) &&
    isNonnegativeInteger(observation.rateLimitEventCount) &&
    coverageStates.includes(observation.coverageState) &&
    isCompleteSlo(observation.slo, targetItemCount) &&
    isCompleteFreshness(observation.freshness, observation.slo)
  );
}

function isCompleteSlo(slo, targetItemCount) {
  if (!isRecord(slo) || slo.targetItemCount !== targetItemCount) return false;
  const reasons = slo.reasons;
  const expectedCoverage =
    targetItemCount === null || targetItemCount <= 0
      ? 0
      : Math.min(1, slo.evaluatedItemCount / targetItemCount);
  return (
    typeof slo.met === "boolean" &&
    isNonnegativeInteger(slo.evaluatedItemCount) &&
    isRatio(slo.coverageRatio) &&
    Math.abs(slo.coverageRatio - expectedCoverage) < Number.EPSILON * 4 &&
    (slo.freshnessLagSeconds === undefined ||
      isNonnegativeInteger(slo.freshnessLagSeconds)) &&
    isNonnegativeInteger(slo.maxFreshnessLagSeconds) &&
    Array.isArray(reasons) &&
    reasons.every((reason) => sloReasons.includes(reason)) &&
    new Set(reasons).size === reasons.length &&
    slo.met === (reasons.length === 0) &&
    retryDispositions.includes(slo.retryDisposition)
  );
}

function isCompleteFreshness(freshness, slo) {
  if (!isRecord(freshness)) return false;
  const oldest = freshness.oldestAcceptedPublishedAt;
  const newest = freshness.newestAcceptedPublishedAt;
  const lag = freshness.lagToWindowEndSeconds;
  return (
    (oldest === undefined || isIsoTimestamp(oldest)) &&
    (newest === undefined || isIsoTimestamp(newest)) &&
    (oldest === undefined ||
      newest === undefined ||
      new Date(oldest).valueOf() <= new Date(newest).valueOf()) &&
    (newest === undefined
      ? lag === undefined
      : isNonnegativeInteger(lag) && lag === slo.freshnessLagSeconds)
  );
}

function isCompleteWindow(window) {
  return (
    isRecord(window) &&
    isNonnegativeInteger(window.feedItemCount) &&
    isNumericRecord(window.providerCounts, true) &&
    isStringRecord(window.newestItemAtByProvider) &&
    isNumericRecord(window.sourceQueryLaneCoverageByProvider, false) &&
    isNumericRecord(window.distinctSourceQueryLaneCountByProvider, true) &&
    isNonnegativeInteger(window.orphanInterestCount) &&
    isNonnegativeInteger(window.orphanSourceBindingCount) &&
    isNonnegativeNumber(window.interestSnapshotCoverage) &&
    isNonnegativeNumber(window.sourceBindingSnapshotCoverage) &&
    isNonnegativeNumber(window.sourceQueryLaneCoverage) &&
    isNonnegativeInteger(window.distinctSourceQueryLaneCount)
  );
}

function isNumericRecord(value, integersOnly) {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) =>
      integersOnly ? isNonnegativeInteger(entry) : isNonnegativeNumber(entry),
    )
  );
}

function isStringRecord(value) {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => isNonemptyString(entry))
  );
}

function isCompleteProviderReceipt(provider) {
  return (
    isNonnegativeInteger(provider.fetched) &&
    isNonnegativeInteger(provider.inserted) &&
    isNonnegativeInteger(provider.skippedDuplicates) &&
    coverageStates.includes(provider.coverageState)
  );
}

function isValidSummaryEvidence(evidence) {
  return (
    isRecord(evidence) &&
    isRecord(evidence.result) &&
    isNonemptyString(evidence.result.readerSummaryJobId) &&
    isNonemptyString(evidence.result.readerSummaryId) &&
    ["completed", "no_signal"].includes(evidence.result.status) &&
    isRecord(evidence.redaction) &&
    evidence.redaction.secretsIncluded === false &&
    evidence.redaction.rawProviderPayloadIncluded === false &&
    evidence.redaction.tokenValuesIncluded === false
  );
}

function isValidReceiptPeriod(period, completedAt, date) {
  return (
    isRecord(period) &&
    period.startedAt === `${date}T00:00:00.000Z` &&
    isOrderedIsoPeriod(period.startedAt, period.endedAt) &&
    new Date(period.endedAt).valueOf() <
      new Date(nextUtcDate(date)).valueOf() &&
    isOrderedIsoPeriod(period.endedAt, completedAt)
  );
}

function isOrderedIsoPeriod(startedAt, completedAt) {
  return (
    isIsoTimestamp(startedAt) &&
    isIsoTimestamp(completedAt) &&
    new Date(startedAt).valueOf() <= new Date(completedAt).valueOf()
  );
}

function isIsoTimestamp(value) {
  if (!isNonemptyString(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isValidCommandExitCode(value) {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

function parseCommandExitCode(value) {
  if (!/^(0|[1-9][0-9]*)$/u.test(value ?? "")) {
    throw new Error("rolling collection exit code is invalid");
  }
  const parsed = Number(value);
  if (!isValidCommandExitCode(parsed)) {
    throw new Error("rolling collection exit code is invalid");
  }
  return parsed;
}

function isNonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isNonnegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRatio(value) {
  return isNonnegativeNumber(value) && value <= 1;
}

function isNonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nextUtcDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date ?? "")) {
    throw new Error("rolling collection date is invalid");
  }
  const value = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(value.valueOf()) ||
    value.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("rolling collection date is invalid");
  }
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
}

function readJson(path) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("rolling summary artifact path is required");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}
