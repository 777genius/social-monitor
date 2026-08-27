#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
      scope: {
        tenantId: "00000000-0000-7000-8000-000000006101",
        workspaceId: "00000000-0000-7000-8000-000000006102",
      },
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
    freshWindow: windowProof(degraded),
    targetWindow: windowProof(degraded),
    qualityGates: qualityGates(degraded),
    blockingPassed: !degraded,
  });
} else if (kind === "evidence") {
  const frontendPath = degradedValue;
  const result = {
    readerSummaryJobId: "11111111-1111-4111-8111-111111111111",
    readerSummaryId: "22222222-2222-4222-8222-222222222222",
    status: "completed",
    headline: "Fixture rolling summary",
    selectedFeedItemCount: 10,
    topReadCount: 2,
    citationCount: 12,
    providerCount: 1,
    topProviderKeys: ["reddit"],
    qualityFlags: [],
  };
  const authority = {
    summaryGenerator: {
      mode: "agent-runtime",
      provider: "codex",
      physicalModel: "gpt-5.6-sol",
      reasoningPolicy: "xhigh",
    },
    topicLabeler: {
      mode: "deterministic",
      provider: "deterministic",
      physicalModel: "deterministic-reader-summary-topic-labeler-v1",
      reasoningPolicy: "not-applicable",
    },
    topicRelationVerifier: {
      mode: "deterministic",
      provider: "deterministic",
      physicalModel: "deterministic-reader-summary-topic-relation-verifier-v1",
      reasoningPolicy: "not-applicable",
    },
    runtime: {
      engine: "subscription-runtime-cli",
      packageVersion: "fixture-runtime-1",
      launcherSha256: "d".repeat(64),
    },
  };
  const executionAttestations = [
    {
      taskRole: "summary",
      attempt: "primary",
      normalizedOutputSha256: "b".repeat(64),
      attestation: {
        schemaVersion: 1,
        requestId: `fixture-${runId}`,
        purpose: "social_monitor.reader_summary.generate",
        canonicalRequestSha256: "c".repeat(64),
        provider: "codex",
        model: "gpt-5.6-sol",
        reasoningEffort: "xhigh",
        runtimeEngine: "subscription-runtime-cli",
        runtimePackageVersion: "fixture-runtime-1",
        launcherSha256: "d".repeat(64),
        selectedOutputKind: "structured_output",
        selectedOutputSha256: "e".repeat(64),
      },
    },
  ];
  const period = dailyPeriod(collectionDate);
  const content = { narrative: "fixture", topicMap: { nodes: [], edges: [] } };
  const redaction = {
    secretsIncluded: false,
    rawProviderPayloadIncluded: false,
    tokenValuesIncluded: false,
  };
  write({
    schemaVersion: 1,
    artifactId: "durable-reader-summary-postgres-evidence-v1",
    format: "durable-reader-summary-postgres-evidence-v1",
    generatedAt: `${collectionDate}T08:20:00.000Z`,
    provenance: {
      runner: "scripts/capture-durable-reader-summary-from-postgres.ts",
      fixtureOnly: false,
      database: "postgres",
      modelMode: "agent-runtime",
      servingAuthority: authority,
      productionDayAttempt: {
        schemaVersion: 1,
        identity: "a".repeat(64),
        requestCreated: true,
        reconciledFromDbPublication: false,
      },
    },
    scope: {
      tenantId: "00000000-0000-7000-8000-000000006101",
      workspaceId: "00000000-0000-7000-8000-000000006102",
      summaryScope: "workspace",
    },
    period,
    result: {
      ...result,
    },
    executionAttestations,
    durableReadback: {
      summaryContentSha256: canonicalJsonSha256(content),
      topicMapSha256: canonicalJsonSha256(content.topicMap),
      executionAttestationSetSha256:
        canonicalJsonSha256(executionAttestations),
    },
    redaction,
  });
  writeFileSync(
    frontendPath,
    `${JSON.stringify({
      schemaVersion: 1,
      format: "frontend-reader-summary-live-fixture-v1",
      generatedAt: `${collectionDate}T08:21:00.000Z`,
      tenantId: "00000000-0000-7000-8000-000000006101",
      workspaceId: "00000000-0000-7000-8000-000000006102",
      userId: "durable-reader-summary-live-user",
      readerSummaryArtifact: {
        readerSummaryId: result.readerSummaryId,
        period,
        scope: { type: "workspace" },
        lineage: {
          modelVersion: "codex:gpt-5.6-sol:xhigh",
          rulesVersion: "fixture-rules",
          promptVersion: "fixture-prompt",
          schemaVersion: "reader_summary.artifact.v1",
          providerVersion: "agent-runtime",
          evalDatasetVersion: "fixture-eval",
          rankingPolicyVersion: "fixture-ranking",
        },
        content,
      },
      evidence: result,
      redaction,
    })}\n`,
  );
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
      ...(provider.status === "failed" ? {} : { freshnessLagSeconds: 60 }),
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
            lagToWindowEndSeconds: 60,
          },
  };
}

function windowProof(degraded) {
  const activeProviderKeys = degraded
    ? providerKeys.filter((providerKey) => providerKey !== "reddit")
    : providerKeys;
  return {
    feedItemCount: activeProviderKeys.length * 10,
    providerCounts: Object.fromEntries(
      activeProviderKeys.map((providerKey) => [providerKey, 10]),
    ),
    newestItemAtByProvider: Object.fromEntries(
      activeProviderKeys.map((providerKey) => [
        providerKey,
        `${collectionDate}T08:15:00.000Z`,
      ]),
    ),
    sourceQueryLaneCoverageByProvider: Object.fromEntries(
      activeProviderKeys.map((providerKey) => [providerKey, 1]),
    ),
    distinctSourceQueryLaneCountByProvider: Object.fromEntries(
      activeProviderKeys.map((providerKey) => [providerKey, 1]),
    ),
    orphanInterestCount: 0,
    orphanSourceBindingCount: 0,
    interestSnapshotCoverage: 1,
    sourceBindingSnapshotCoverage: 1,
    sourceQueryLaneCoverage: 1,
    distinctSourceQueryLaneCount: activeProviderKeys.length,
  };
}

function qualityGates(degraded) {
  const gateNames = [
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
  return Object.fromEntries(
    gateNames.map((gate) => [
      gate,
      !degraded ||
        ![
          "everyRequestedProviderSucceeded",
          "everyRequestedProviderHasTargetItems",
          "everyRequestedProviderMeetsBlockingCoveragePolicy",
        ].includes(gate),
    ]),
  );
}

function dailyPeriod(value) {
  const startedAt = `${value}T00:00:00.000Z`;
  const endedAt = nextUtcDate(value);
  return {
    cadence: "daily",
    startedAt,
    endedAt,
    timezone: "UTC",
    periodKey: `daily:${startedAt}:${endedAt}:UTC`,
  };
}

function canonicalJsonSha256(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(canonicalJsonValue(value));
}

function canonicalJsonValue(value) {
  if (value === null || ["string", "boolean"].includes(typeof value)) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite fixture number");
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry === undefined ? null : canonicalJsonValue(entry),
    );
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJsonValue(entry)]),
    );
  }
  throw new Error("fixture value is not serializable");
}

function write(value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function nextUtcDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
