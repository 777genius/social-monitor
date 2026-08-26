#!/usr/bin/env node

import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
const collectionArtifactFormat =
  "reader-summary-clean-real-day-collection-v1";
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
  const publicationStatus = receipt.publication?.status;
  if (
    receipt.schemaVersion !== 1 ||
    receipt.artifactFormat !== receiptArtifactFormat ||
    receipt.runId !== runId ||
    receipt.collectionDate !== date ||
    receipt.status !== "SUCCESS" ||
    !isValidCommandExitCode(receipt.collection?.commandExitCode) ||
    typeof receipt.collection?.finalDayQualityGatePassed !== "boolean" ||
    receipt.collection.finalDayQualityGatePassed !==
      (receipt.collection.commandExitCode === 0) ||
    !hasExactTerminalProviders(receipt.collection?.providers, true) ||
    typeof receipt.publication?.readerSummaryJobId !== "string" ||
    typeof receipt.publication?.readerSummaryId !== "string" ||
    !["completed", "no_signal"].includes(publicationStatus)
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
    report.inputs?.database !== "local-postgres" ||
    !hasValidOptionalScope(report.inputs?.scope) ||
    report.inputs?.targetPublishedWindow?.startInclusive !==
      `${date}T00:00:00.000Z` ||
    report.inputs?.targetPublishedWindow?.endExclusive !== nextUtcDate(date) ||
    !hasExactProviderKeys(report.inputs?.providerKeys) ||
    report.model?.rawProviderPayloadPersistedInReport !== false ||
    report.model?.rawPostTextPersistedInReport !== false ||
    report.model?.rawProviderConfigPersistedInReport !== false ||
    report.qualityGates?.noRawSecretFragments !== true ||
    typeof report.blockingPassed !== "boolean" ||
    !hasExactTerminalProviders(report.scans, false)
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
  const next = `${receiptPath}.next`;
  writeFileSync(next, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o444 });
  chmodSync(next, 0o444);
  renameSync(next, receiptPath);
}

function hasValidOptionalScope(scope) {
  return (
    scope == null ||
    (isRecord(scope) &&
      scope.tenantId === productionScope.tenantId &&
      scope.workspaceId === productionScope.workspaceId)
  );
}

function hasExactProviderKeys(providerKeys) {
  return (
    Array.isArray(providerKeys) &&
    providerKeys.length === requiredProviders.length &&
    requiredProviders.every(
      (provider) =>
        providerKeys.filter((providerKey) => providerKey === provider).length ===
        1,
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
    isNonnegativeInteger(scan.fetched) &&
    isNonnegativeInteger(scan.inserted) &&
    isNonnegativeInteger(scan.skippedDuplicates) &&
    coverageStates.includes(scan.observability?.coverageState)
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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nextUtcDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date ?? "")) {
    throw new Error("rolling collection date is invalid");
  }
  const value = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(value.valueOf()) || value.toISOString().slice(0, 10) !== date) {
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
