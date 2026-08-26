#!/usr/bin/env node

import { Buffer } from "node:buffer";
import {
  chmodSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
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
const retryDispositions = ["none", "immediate", "deferred"];
const collectionArtifactFormat = "reader-summary-clean-real-day-collection-v1";
const collectionGeneratedBy =
  "npm run run:reader-summary-clean-real-day-collection";
const receiptArtifactFormat = "social-monitor-rolling-summary-receipt-v1";
const evidenceArtifactFormat = "durable-reader-summary-postgres-evidence-v1";
const frontendArtifactFormat = "frontend-reader-summary-live-fixture-v1";
const requiredQualityGates = [
  "targetBindingsPresent",
  "everyRequestedProviderSucceeded",
  "targetWindowFeedItemsAvailable",
  "everyRequestedProviderHasTargetItems",
  "noFreshOrphanInterestReferences",
  "noFreshOrphanSourceBindingReferences",
  "targetInterestSnapshotsPersisted",
  "targetSourceBindingSnapshotsPersisted",
  "freshSourceQueryLaneCoverageComplete",
  "freshMultipleQueryLanesObserved",
  "targetSourceQueryLaneCoverageComplete",
  "targetMultipleQueryLanesObserved",
  "providerCollectionObservabilityComplete",
  "providerAcquisitionModesAreConsistent",
  "everyRequestedProviderMeetsBlockingCoveragePolicy",
  "providerRetriesAreBounded",
  "durableSnapshotReuseIsSingleAttempt",
  "durableSnapshotProofMatchesRequestedDay",
  "partialProviderCoverageIsExplicit",
  "noRawSecretFragments",
];
const productionScope = {
  tenantId: "00000000-0000-7000-8000-000000006101",
  workspaceId: "00000000-0000-7000-8000-000000006102",
};

const [command, ...args] = process.argv.slice(2);

if (command === "validate-collection") {
  const [path, date] = args;
  validateCollection(readJson(path), date);
} else if (command === "validate-collection-result") {
  const [path, date, exitCode] = args;
  validateCollectionResult(readJson(path), date, exitCode);
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
    !isValidSummaryResult(receipt.summary) ||
    !isSafeRedaction(receipt.redaction) ||
    !isSha256(receipt.publication?.evidenceSha256) ||
    !isSha256(receipt.publication?.frontendSha256) ||
    receipt.publication?.evidenceArtifactFormat !== evidenceArtifactFormat ||
    receipt.publication?.frontendArtifactFormat !== frontendArtifactFormat ||
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
    !hasProductionScope(report.inputs?.scope) ||
    typeof report.inputs?.xCollectorConfigured !== "boolean" ||
    report.inputs?.targetPublishedWindow?.startInclusive !==
      `${date}T00:00:00.000Z` ||
    report.inputs?.targetPublishedWindow?.endExclusive !== nextUtcDate(date) ||
    !hasExactProviderKeys(report.inputs?.providerKeys) ||
    !hasExactAcquisitionModel(report.model) ||
    report.model?.rawProviderPayloadPersistedInReport !== false ||
    report.model?.rawPostTextPersistedInReport !== false ||
    report.model?.rawProviderConfigPersistedInReport !== false ||
    !hasExactQualityGates(report.qualityGates, report.blockingPassed) ||
    typeof report.blockingPassed !== "boolean" ||
    !hasExactTargets(report.targets) ||
    !hasExactTerminalProviders(
      report.scans,
      false,
      date,
      report.run?.completedAt,
    ) ||
    !hasConsistentCollectionBindings(
      report.model,
      report.targets,
      report.scans,
      report.targetWindow,
    ) ||
    !isCompleteWindow(report.freshWindow) ||
    !isCompleteWindow(report.targetWindow)
  ) {
    throw new Error("rolling collection contract is invalid");
  }
}

function validateCollectionResult(report, date, exitCodeValue) {
  validateCollection(report, date);
  const exitCode = parseCommandExitCode(exitCodeValue);
  if ((exitCode === 0) !== report.blockingPassed) {
    throw new Error("rolling collection exit code contradicts quality gate");
  }
}

function writeReceipt(args) {
  const [
    receiptPath,
    evidencePath,
    frontendPath,
    collectionPath,
    runId,
    date,
    endedAt,
    collectionExit,
  ] = args;
  const evidenceBytes = readFileSync(evidencePath);
  const frontendBytes = readFileSync(frontendPath);
  const evidence = JSON.parse(evidenceBytes.toString("utf8"));
  const frontend = JSON.parse(frontendBytes.toString("utf8"));
  const collection = readJson(collectionPath);
  validateCollectionResult(collection, date, collectionExit);
  if (!isValidSummaryEvidence(evidence, frontend, date)) {
    throw new Error("rolling summary evidence contract is invalid");
  }
  const collectionExitCode = parseCommandExitCode(collectionExit);
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
      evidenceArtifactFormat,
      evidenceSha256: sha256(evidenceBytes),
      frontendArtifactFormat,
      frontendSha256: sha256(frontendBytes),
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

function hasProductionScope(scope) {
  return (
    isRecord(scope) &&
      scope.tenantId === productionScope.tenantId &&
      scope.workspaceId === productionScope.workspaceId
  );
}

function hasExactQualityGates(qualityGates, blockingPassed) {
  if (!isRecord(qualityGates) || typeof blockingPassed !== "boolean") {
    return false;
  }
  const keys = Object.keys(qualityGates);
  return (
    keys.length === requiredQualityGates.length &&
    requiredQualityGates.every(
      (gate) => typeof qualityGates[gate] === "boolean",
    ) &&
    keys.every((gate) => requiredQualityGates.includes(gate)) &&
    blockingPassed === requiredQualityGates.every((gate) => qualityGates[gate])
  );
}

function hasConsistentCollectionBindings(model, targets, scans, targetWindow) {
  if (
    !isRecord(model) ||
    !Array.isArray(targets) ||
    !Array.isArray(scans) ||
    !isRecord(targetWindow?.providerCounts)
  ) {
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
      scan.acquisitionMode === expectedAcquisitionMode &&
      scan.observability?.slo?.evaluatedItemCount ===
        (targetWindow.providerCounts[providerKey] ?? 0)
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

function hasExactTerminalProviders(
  providers,
  receipt,
  collectionDate,
  collectionCompletedAt,
) {
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
              : isCompleteCollectionScan(
                  entry,
                  collectionDate,
                  collectionCompletedAt,
                )),
        ).length === 1,
    )
  );
}

function isCompleteCollectionScan(scan, collectionDate, collectionCompletedAt) {
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
    isCompleteObservation(
      scan.observability,
      scan.acquisitionMode,
      collectionDate,
      collectionCompletedAt,
    )
  );
}

function isCompleteObservation(
  observation,
  acquisitionMode,
  collectionDate,
  collectionCompletedAt,
) {
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
    isCompleteSlo(observation.slo, observation) &&
    isCompleteFreshness(
      observation.freshness,
      observation.slo,
      observation.acceptedItemCount,
      collectionDate,
      collectionCompletedAt,
    )
  );
}

function isCompleteSlo(slo, observation) {
  if (
    !isRecord(slo) ||
    slo.targetItemCount !== observation.targetItemCount ||
    slo.evaluatedItemCount !== observation.acceptedItemCount
  ) {
    return false;
  }
  const targetItemCount = observation.targetItemCount;
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
    stableJson(reasons) === stableJson(expectedSloReasons(observation, slo)) &&
    slo.met === (reasons.length === 0) &&
    retryDispositions.includes(slo.retryDisposition) &&
    slo.retryDisposition === expectedRetryDisposition(reasons)
  );
}

function expectedSloReasons(observation, slo) {
  const reasons = [];
  if (observation.targetItemCount === null || observation.targetItemCount <= 0) {
    reasons.push("target_missing");
  } else if (observation.acceptedItemCount < observation.targetItemCount) {
    reasons.push("target_shortfall");
  }
  if (observation.acceptedItemCount > 0) {
    if (slo.freshnessLagSeconds === undefined) {
      reasons.push("freshness_missing");
    } else if (slo.freshnessLagSeconds > slo.maxFreshnessLagSeconds) {
      reasons.push("freshness_lag_exceeded");
    }
  }
  if (
    observation.rateLimitEventCount > 0 ||
    observation.failureKind === "rate_limited"
  ) {
    reasons.push("rate_limited");
  }
  if (observation.paginationStopReason === "partial_retryable_failure") {
    reasons.push("partial_retryable_failure");
  }
  if (
    observation.acceptedItemCount === 0 &&
    ["failed", "skipped"].includes(observation.paginationStopReason)
  ) {
    reasons.push("provider_unavailable");
  }
  return reasons;
}

function expectedRetryDisposition(reasons) {
  if (reasons.length === 0 || reasons.includes("target_missing")) return "none";
  return reasons.includes("rate_limited") ? "deferred" : "immediate";
}

function isCompleteFreshness(
  freshness,
  slo,
  acceptedItemCount,
  collectionDate,
  collectionCompletedAt,
) {
  if (
    !isRecord(freshness) ||
    !isNonemptyString(collectionDate) ||
    !isIsoTimestamp(collectionCompletedAt)
  ) {
    return false;
  }
  const oldest = freshness.oldestAcceptedPublishedAt;
  const newest = freshness.newestAcceptedPublishedAt;
  const lag = freshness.lagToWindowEndSeconds;
  const hasAnyFreshness =
    oldest !== undefined || newest !== undefined || lag !== undefined;
  if (acceptedItemCount === 0) {
    return !hasAnyFreshness && slo.freshnessLagSeconds === undefined;
  }
  const windowStartedAt = new Date(`${collectionDate}T00:00:00.000Z`);
  const windowEndedAt = new Date(
    Math.min(
      new Date(collectionCompletedAt).valueOf(),
      new Date(nextUtcDate(collectionDate)).valueOf(),
    ),
  );
  const newestAt = new Date(newest);
  const expectedLag = Math.max(
    0,
    Math.round((windowEndedAt.valueOf() - newestAt.valueOf()) / 1000),
  );
  return (
    (oldest === undefined || isIsoTimestamp(oldest)) &&
    isIsoTimestamp(newest) &&
    newestAt.valueOf() >= windowStartedAt.valueOf() &&
    newestAt.valueOf() <= windowEndedAt.valueOf() &&
    (oldest === undefined ||
      (new Date(oldest).valueOf() >= windowStartedAt.valueOf() &&
        new Date(oldest).valueOf() <= windowEndedAt.valueOf())) &&
    (oldest === undefined ||
      new Date(oldest).valueOf() <= new Date(newest).valueOf()) &&
    isNonnegativeInteger(lag) &&
    lag === expectedLag &&
    lag === slo.freshnessLagSeconds
  );
}

function isCompleteWindow(window) {
  if (!isRecord(window) || !isNumericRecord(window.providerCounts, true)) {
    return false;
  }
  const providerTotal = Object.values(window.providerCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const presentProviders = Object.keys(window.providerCounts);
  return (
    isNonnegativeInteger(window.feedItemCount) &&
    window.feedItemCount === providerTotal &&
    presentProviders.every((key) =>
      requiredProviders.includes(key),
    ) &&
    hasExactWindowMap(window.newestItemAtByProvider, presentProviders, (value) =>
      isIsoTimestamp(normalizePostgresTimestamp(value)),
    ) &&
    hasExactWindowMap(
      window.sourceQueryLaneCoverageByProvider,
      presentProviders,
      isRatio,
    ) &&
    hasExactWindowMap(
      window.distinctSourceQueryLaneCountByProvider,
      presentProviders,
      isNonnegativeInteger,
    ) &&
    isNonnegativeInteger(window.orphanInterestCount) &&
    isNonnegativeInteger(window.orphanSourceBindingCount) &&
    isRatio(window.interestSnapshotCoverage) &&
    isRatio(window.sourceBindingSnapshotCoverage) &&
    isRatio(window.sourceQueryLaneCoverage) &&
    isNonnegativeInteger(window.distinctSourceQueryLaneCount)
  );
}

function hasExactWindowMap(value, providerKeys, validate) {
  return (
    isRecord(value) &&
    Object.keys(value).length === providerKeys.length &&
    providerKeys.every((providerKey) => validate(value[providerKey]))
  );
}

function normalizePostgresTimestamp(value) {
  if (!isNonemptyString(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
}

function isNumericRecord(value, integersOnly) {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) =>
      integersOnly ? isNonnegativeInteger(entry) : isNonnegativeNumber(entry),
    )
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

function isValidSummaryEvidence(evidence, frontend, date) {
  if (
    !isRecord(evidence) ||
    evidence.schemaVersion !== 1 ||
    evidence.artifactId !== evidenceArtifactFormat ||
    evidence.format !== evidenceArtifactFormat ||
    !isIsoTimestamp(evidence.generatedAt) ||
    !isProductionEvidenceProvenance(evidence.provenance) ||
    !hasProductionEvidenceScope(evidence.scope) ||
    !isExactDailyPeriod(evidence.period, date) ||
    !isValidSummaryResult(evidence.result) ||
    !isSafeRedaction(evidence.redaction) ||
    !isValidAttestationSet(
      evidence.executionAttestations,
      evidence.result,
      evidence.provenance.servingAuthority,
    ) ||
    !isRecord(evidence.durableReadback) ||
    !isSha256(evidence.durableReadback.summaryContentSha256) ||
    !isSha256(evidence.durableReadback.topicMapSha256) ||
    !isSha256(evidence.durableReadback.executionAttestationSetSha256) ||
    !isValidFrontendArtifact(frontend, evidence, date)
  ) {
    return false;
  }
  return (
    evidence.durableReadback.summaryContentSha256 ===
      canonicalJsonSha256(frontend.readerSummaryArtifact.content) &&
    evidence.durableReadback.topicMapSha256 ===
      canonicalJsonSha256(frontend.readerSummaryArtifact.content.topicMap) &&
    evidence.durableReadback.executionAttestationSetSha256 ===
      canonicalJsonSha256(evidence.executionAttestations)
  );
}

function isProductionEvidenceProvenance(provenance) {
  const authority = provenance?.servingAuthority;
  const summary = authority?.summaryGenerator;
  const runtime = authority?.runtime;
  const attempt = provenance?.productionDayAttempt;
  return (
    isRecord(provenance) &&
    provenance.runner ===
      "scripts/capture-durable-reader-summary-from-postgres.ts" &&
    provenance.fixtureOnly === false &&
    provenance.database === "postgres" &&
    provenance.modelMode === "agent-runtime" &&
    isRecord(authority) &&
    isRecord(summary) &&
    summary.mode === "agent-runtime" &&
    summary.provider === "codex" &&
    isNonemptyString(summary.physicalModel) &&
    isNonemptyString(summary.reasoningPolicy) &&
    isRecord(runtime) &&
    runtime.engine === "subscription-runtime-cli" &&
    isNonemptyString(runtime.packageVersion) &&
    isSha256(runtime.launcherSha256) &&
    isRecord(attempt) &&
    attempt.schemaVersion === 1 &&
    isSha256(attempt.identity) &&
    typeof attempt.requestCreated === "boolean" &&
    typeof attempt.reconciledFromDbPublication === "boolean" &&
    attempt.requestCreated !== attempt.reconciledFromDbPublication
  );
}

function hasProductionEvidenceScope(scope) {
  return (
    hasProductionScope(scope) &&
    scope.summaryScope === "workspace"
  );
}

function isExactDailyPeriod(period, date) {
  return (
    isRecord(period) &&
    period.cadence === "daily" &&
    period.startedAt === `${date}T00:00:00.000Z` &&
    period.endedAt === nextUtcDate(date) &&
    period.timezone === "UTC" &&
    period.periodKey ===
      `daily:${period.startedAt}:${period.endedAt}:UTC`
  );
}

function isValidSummaryResult(result) {
  return (
    isRecord(result) &&
    isUuid(result.readerSummaryJobId) &&
    isUuid(result.readerSummaryId) &&
    ["completed", "no_signal"].includes(result.status) &&
    isNonemptyString(result.headline) &&
    isNonnegativeInteger(result.selectedFeedItemCount) &&
    isNonnegativeInteger(result.topReadCount) &&
    result.topReadCount <= result.selectedFeedItemCount &&
    isNonnegativeInteger(result.citationCount) &&
    result.citationCount <= result.selectedFeedItemCount &&
    isNonnegativeInteger(result.providerCount) &&
    Array.isArray(result.topProviderKeys) &&
    result.topProviderKeys.length === result.providerCount &&
    new Set(result.topProviderKeys).size === result.topProviderKeys.length &&
    result.topProviderKeys.every((key) => requiredProviders.includes(key)) &&
    Array.isArray(result.qualityFlags) &&
    result.qualityFlags.every(isNonemptyString) &&
    (result.status === "completed"
      ? result.selectedFeedItemCount > 0
      : result.selectedFeedItemCount === 0)
  );
}

function isSafeRedaction(redaction) {
  return (
    isRecord(redaction) &&
    redaction.secretsIncluded === false &&
    redaction.rawProviderPayloadIncluded === false &&
    redaction.tokenValuesIncluded === false
  );
}

function isValidAttestationSet(attestations, result, authority) {
  if (!Array.isArray(attestations)) return false;
  if (result.status === "no_signal") return attestations.length === 0;
  const summaryRecords = attestations.filter(
    (record) => record?.taskRole === "summary",
  );
  return (
    summaryRecords.length === 1 &&
    attestations.every((record) => {
      const attestation = record?.attestation;
      return (
        isRecord(record) &&
        isNonemptyString(record.taskRole) &&
        isNonemptyString(record.attempt) &&
        isSha256(record.normalizedOutputSha256) &&
        isRecord(attestation) &&
        attestation.schemaVersion === 1 &&
        isNonemptyString(attestation.requestId) &&
        isNonemptyString(attestation.purpose) &&
        isSha256(attestation.canonicalRequestSha256) &&
        attestation.provider === authority.summaryGenerator.provider &&
        attestation.model === authority.summaryGenerator.physicalModel &&
        attestation.reasoningEffort ===
          authority.summaryGenerator.reasoningPolicy &&
        attestation.runtimeEngine === authority.runtime.engine &&
        attestation.runtimePackageVersion === authority.runtime.packageVersion &&
        attestation.launcherSha256 === authority.runtime.launcherSha256 &&
        isSha256(attestation.selectedOutputSha256)
      );
    })
  );
}

function isValidFrontendArtifact(frontend, evidence, date) {
  const artifact = frontend?.readerSummaryArtifact;
  const expectedModelVersion = [
    evidence.provenance.servingAuthority.summaryGenerator.provider,
    evidence.provenance.servingAuthority.summaryGenerator.physicalModel,
    evidence.provenance.servingAuthority.summaryGenerator.reasoningPolicy,
  ].join(":");
  return (
    isRecord(frontend) &&
    frontend.schemaVersion === 1 &&
    frontend.format === frontendArtifactFormat &&
    isIsoTimestamp(frontend.generatedAt) &&
    new Date(frontend.generatedAt).valueOf() >=
      new Date(evidence.generatedAt).valueOf() &&
    frontend.tenantId === productionScope.tenantId &&
    frontend.workspaceId === productionScope.workspaceId &&
    frontend.userId === "durable-reader-summary-live-user" &&
    isRecord(artifact) &&
    artifact.readerSummaryId === evidence.result.readerSummaryId &&
    isExactDailyPeriod(artifact.period, date) &&
    artifact.scope?.type === "workspace" &&
    isRecord(artifact.lineage) &&
    artifact.lineage.modelVersion === expectedModelVersion &&
    artifact.lineage.providerVersion === "agent-runtime" &&
    isNonemptyString(artifact.lineage.schemaVersion) &&
    isRecord(artifact.content) &&
    isRecord(artifact.content.topicMap) &&
    stableJson(frontend.evidence) === stableJson(evidence.result) &&
    stableJson(frontend.redaction) === stableJson(evidence.redaction)
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
  return value === 0 || value === 1;
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

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJsonSha256(value) {
  return sha256(Buffer.from(stableJson(value)));
}

function stableJson(value) {
  return JSON.stringify(canonicalJsonValue(value));
}

function canonicalJsonValue(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonical JSON does not allow non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry === undefined ? null : canonicalJsonValue(entry),
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJsonValue(entry)]),
    );
  }
  throw new Error("canonical JSON value is not serializable");
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
