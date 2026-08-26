#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import process from "node:process";

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
const providers = providerKeys.map((providerKey, index) => ({
  providerKey,
  bindingFingerprint: `binding-${index}`,
  acquisitionMode: "live_collection",
  attemptCount: 1,
  status: degraded && providerKey === "reddit" ? "failed" : "succeeded",
  fetched: degraded && providerKey === "reddit" ? 0 : 10,
  inserted: degraded && providerKey === "reddit" ? 0 : 5,
  projected: degraded && providerKey === "reddit" ? 0 : 10,
  skippedDuplicates: degraded && providerKey === "reddit" ? 0 : 5,
  warningCount: degraded && providerKey === "reddit" ? 1 : 0,
  coverageState:
    degraded && providerKey === "reddit" ? "unavailable" : "complete",
}));

if (kind === "collection") {
  write({
    schemaVersion: 1,
    artifactFormat: "reader-summary-clean-real-day-collection-v1",
    generatedBy: "npm run run:reader-summary-clean-real-day-collection",
    model: {
      mode: "targeted_real_binding_collection",
      liveNetwork: true,
      liveNetworkProviderKeys: providerKeys,
      durableSnapshotReuseProviderKeys: [],
      rawProviderPayloadPersistedInReport: false,
      rawPostTextPersistedInReport: false,
      rawProviderConfigPersistedInReport: false,
    },
    inputs: {
      database: "local-postgres",
      providerKeys,
      xCollectorConfigured: true,
      targetPublishedWindow: {
        startInclusive: `${collectionDate}T00:00:00.000Z`,
        endExclusive: nextUtcDate(collectionDate),
      },
    },
    run: {
      startedAt: `${collectionDate}T08:15:00.000Z`,
      completedAt: `${collectionDate}T08:16:00.000Z`,
      collectionDate,
    },
    targets: providerKeys.map((providerKey, index) => ({
      providerKey,
      bindingFingerprint: `binding-${index}`,
      interestFingerprint: "interest",
      workspaceFingerprint: "workspace",
      plannerEnabled: providerKey === "reddit" || providerKey === "x-twitter",
      canaryRollout: providerKey === "reddit" || providerKey === "x-twitter",
    })),
    scans: providers.map(({ coverageState, ...provider }) => ({
      ...provider,
      observability: observation(provider, coverageState),
    })),
    freshWindow: windowProof(),
    targetWindow: windowProof(),
    qualityGates: { noRawSecretFragments: true },
    blockingPassed: !degraded,
  });
} else if (kind === "evidence") {
  write({
    result: {
      readerSummaryJobId: `job-${runId}`,
      readerSummaryId: `summary-${runId}`,
      status: "completed",
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadIncluded: false,
      tokenValuesIncluded: false,
    },
  });
} else {
  throw new Error("fake rolling artifact kind is invalid");
}

function observation(provider, coverageState) {
  return {
    acquisitionMode: provider.acquisitionMode,
    targetItemCount: 10,
    collectedItemCount: provider.fetched,
    acceptedItemCount: provider.projected,
    insertedItemCount: provider.inserted,
    outsideWindowItemCount: 0,
    paginationDuplicateItemCount: 0,
    storageDuplicateItemCount: provider.skippedDuplicates,
    totalDuplicateItemCount: provider.skippedDuplicates,
    pageCount: provider.status === "failed" ? 0 : 1,
    paginationStopReason:
      provider.status === "failed" ? "failed" : "single_page",
    rateLimitEventCount: 0,
    coverageState,
    slo: {
      met: provider.status !== "failed",
      targetItemCount: 10,
      evaluatedItemCount: provider.projected,
      coverageRatio: provider.projected / 10,
      ...(provider.status === "failed" ? {} : { freshnessLagSeconds: 0 }),
      maxFreshnessLagSeconds: 21600,
      reasons:
        provider.status === "failed"
          ? ["target_shortfall", "provider_unavailable"]
          : [],
      retryDisposition: provider.status === "failed" ? "immediate" : "none",
    },
    freshness:
      provider.status === "failed"
        ? {}
        : {
            oldestAcceptedPublishedAt: `${collectionDate}T08:15:00.000Z`,
            newestAcceptedPublishedAt: `${collectionDate}T08:15:00.000Z`,
            lagToWindowEndSeconds: 0,
          },
  };
}

function windowProof() {
  return {
    feedItemCount: 0,
    providerCounts: {},
    newestItemAtByProvider: {},
    sourceQueryLaneCoverageByProvider: {},
    distinctSourceQueryLaneCountByProvider: {},
    orphanInterestCount: 0,
    orphanSourceBindingCount: 0,
    interestSnapshotCoverage: 1,
    sourceBindingSnapshotCoverage: 1,
    sourceQueryLaneCoverage: 1,
    distinctSourceQueryLaneCount: 0,
  };
}

function write(value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function nextUtcDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
