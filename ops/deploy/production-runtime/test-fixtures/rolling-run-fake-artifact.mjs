#!/usr/bin/env node

import { writeFileSync } from "node:fs";

const [kind, path, runId, collectionDate, degradedValue] =
  process.argv.slice(2);
const degraded = degradedValue === "true";
const providerKeys = [
  "github-trending-page",
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
];
const providers = providerKeys.map((providerKey) => ({
  providerKey,
  status: degraded && providerKey === "reddit" ? "failed" : "succeeded",
  fetched: degraded && providerKey === "reddit" ? 0 : 10,
  inserted: degraded && providerKey === "reddit" ? 0 : 5,
  skippedDuplicates: degraded && providerKey === "reddit" ? 0 : 5,
  coverageState:
    degraded && providerKey === "reddit" ? "unavailable" : "complete",
}));

if (kind === "collection") {
  write({
    schemaVersion: 1,
    artifactFormat: "reader-summary-clean-real-day-collection-v1",
    generatedBy: "npm run run:reader-summary-clean-real-day-collection",
    model: {
      rawProviderPayloadPersistedInReport: false,
      rawPostTextPersistedInReport: false,
      rawProviderConfigPersistedInReport: false,
    },
    inputs: {
      database: "local-postgres",
      providerKeys,
      targetPublishedWindow: {
        startInclusive: `${collectionDate}T00:00:00.000Z`,
        endExclusive: nextUtcDate(collectionDate),
      },
    },
    run: { collectionDate },
    scans: providers.map(({ coverageState, ...provider }) => ({
      ...provider,
      observability: { coverageState },
    })),
    qualityGates: { noRawSecretFragments: true },
    blockingPassed: !degraded,
  });
} else if (kind === "receipt") {
  write({
    schemaVersion: 1,
    artifactFormat: "social-monitor-rolling-summary-receipt-v1",
    runId,
    collectionDate,
    period: {
      startedAt: `${collectionDate}T00:00:00.000Z`,
      endedAt: `${collectionDate}T20:15:00.000Z`,
    },
    completedAt: `${collectionDate}T20:16:00.000Z`,
    status: "SUCCESS",
    collection: {
      commandExitCode: degraded ? 1 : 0,
      finalDayQualityGatePassed: !degraded,
      providers,
    },
    summary: {
      readerSummaryJobId: "test-job",
      readerSummaryId: "test-summary",
      status: "completed",
    },
    publication: {
      readerSummaryJobId: "test-job",
      readerSummaryId: "test-summary",
      status: "completed",
    },
    redaction: { secretsIncluded: false },
  });
} else {
  throw new Error("fake rolling artifact kind is invalid");
}

function write(value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function nextUtcDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
