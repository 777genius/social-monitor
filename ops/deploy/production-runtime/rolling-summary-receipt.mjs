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

const [command, ...args] = process.argv.slice(2);

if (command === "validate-collection") {
  const [path, date] = args;
  const report = readJson(path);
  validateCollection(report, date);
} else if (command === "write-receipt") {
  writeReceipt(args);
} else if (command === "validate-receipt") {
  const [path, runId, date] = args;
  const receipt = readJson(path);
  const publicationStatus = receipt.publication?.status;
  if (
    receipt.runId !== runId ||
    receipt.collectionDate !== date ||
    receipt.status !== "SUCCESS" ||
    typeof receipt.publication?.readerSummaryJobId !== "string" ||
    typeof receipt.publication?.readerSummaryId !== "string" ||
    !["completed", "no_signal"].includes(publicationStatus)
  ) {
    throw new Error("rolling summary receipt is inconsistent");
  }
} else {
  throw new Error("rolling summary receipt command is invalid");
}

function validateCollection(report, date) {
  if (report?.run?.collectionDate !== date) {
    throw new Error("rolling collection date mismatch");
  }
  const scans = Array.isArray(report.scans) ? report.scans : [];
  for (const provider of requiredProviders) {
    if (
      !scans.some(
        (scan) =>
          scan?.providerKey === provider &&
          ["succeeded", "failed", "skipped"].includes(scan.status),
      )
    ) {
      throw new Error(`rolling collection lacks terminal ${provider} evidence`);
    }
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
  if (collectionExit !== "0") {
    throw new Error("rolling collection command did not succeed");
  }
  const evidence = readJson(evidencePath);
  const collection = readJson(collectionPath);
  validateCollection(collection, date);
  const receipt = {
    schemaVersion: 1,
    artifactFormat: "social-monitor-rolling-summary-receipt-v1",
    runId,
    collectionDate: date,
    period: { startedAt: `${date}T00:00:00.000Z`, endedAt },
    completedAt: new Date().toISOString(),
    status: "SUCCESS",
    collection: {
      commandExitCode: Number(collectionExit),
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

function readJson(path) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("rolling summary artifact path is required");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}
