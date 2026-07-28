import { readFileSync } from "node:fs";

import type { ReaderSummaryTimestampPolicy } from "@social-monitor/summary/ports";

import type { ProductionDayStepReport } from "./reader-summary-production-day-collection-barrier";
import {
  isRecord,
  productionDayUtcPeriod,
  sha256Hex,
  type ProductionDayUtcPeriod,
} from "./reader-summary-production-day-provenance";
import type { ProductionDayExecutionRequest } from "./reader-summary-production-day-reuse-provenance";
import { readReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-guard";
import { assertImmutableRecoveryInputs } from "./reader-summary-recovery-files";
import { noRawSecretFragments } from "./yesterday-social-replay-support";

type HashBoundArtifact = {
  readonly artifactFormat: string;
  readonly sha256: string;
};

const expectedProviders = [
  "github-trending-page",
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
] as const;

export type HistoricalRegenerationSourceProvenance = {
  readonly mode: "historical-regeneration";
  readonly timestampPolicy: ReaderSummaryTimestampPolicy;
  readonly requestedUtcPeriod: ProductionDayUtcPeriod;
  readonly collectionUtcPeriod: ProductionDayUtcPeriod;
  readonly priorCollectionProof: {
    readonly sourceAttempt: HashBoundArtifact;
    readonly collectionArtifact: HashBoundArtifact;
    readonly collectionQualityReport: HashBoundArtifact;
  };
  readonly regenerationInputManifest: HashBoundArtifact & {
    readonly generatedAt: string;
    readonly datasetSha256: string;
    readonly feedRowCount: number;
    readonly githubEligibilityRowCount: number;
    readonly providerCounts: Readonly<Record<string, number>>;
    readonly timestampPolicy: ReaderSummaryTimestampPolicy;
  };
  readonly githubPolicy:
    | {
        readonly mode: "historical_unavailable";
        readonly reason: string;
        readonly collectedRowCount: 0;
      }
    | {
        readonly mode: "verified_collected_rows";
        readonly collectedRowCount: number;
      };
  readonly freshnessOverride: {
    readonly mode: "historical_regeneration_current_snapshot";
    readonly generalAllowHistorical: false;
    readonly maxManifestAgeSeconds: 1800;
  };
};

type HistoricalRegenerationRequest = Extract<
  ProductionDayExecutionRequest,
  { readonly mode: "historical-regeneration" }
>;

export function loadHistoricalRegeneration(params: {
  readonly request: HistoricalRegenerationRequest;
  readonly collectionDate: string;
  readonly githubOmissionReason?: string;
  readonly recoveryRoot: string;
  readonly forbiddenOutputPaths: readonly string[];
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly now: Date;
}): {
  readonly provenance: HistoricalRegenerationSourceProvenance;
  readonly verifiedCollectionStep: ProductionDayStepReport;
} {
  assertImmutableRecoveryInputs({
    recoveryRoot: params.recoveryRoot,
    inputPaths: [
      params.request.sourceReportPath,
      params.request.collectionArtifactPath,
      params.request.collectionQualityReportPath,
      params.request.datasetManifestPath,
    ],
    forbiddenOutputPaths: params.forbiddenOutputPaths,
  });
  const sourceAttempt = loadHashBoundJson({
    path: params.request.sourceReportPath,
    expectedSha256: params.request.sourceReportSha256,
    label: "source production attempt",
  });
  const sourceCollection = loadHashBoundJson({
    path: params.request.collectionArtifactPath,
    expectedSha256: params.request.collectionArtifactSha256,
    label: "source collection artifact",
  });
  const sourceCollectionQuality = loadHashBoundJson({
    path: params.request.collectionQualityReportPath,
    expectedSha256: params.request.collectionQualityReportSha256,
    label: "source collection quality report",
  });
  validateSourceAttempt(sourceAttempt.value, params.collectionDate);
  validateSourceCollection(sourceCollection.value, params.collectionDate);
  validateSourceCollectionQuality(
    sourceCollectionQuality.value,
    params.collectionDate,
  );
  validateProviderCountsMatch(
    sourceCollection.value,
    sourceCollectionQuality.value,
  );
  const { manifest: datasetManifest, fileSha256: datasetManifestFileSha256 } =
    readReaderSummaryDayDatasetManifest({
      path: params.request.datasetManifestPath,
      expectedFileSha256: params.request.datasetManifestSha256,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      startedAt: new Date(`${params.collectionDate}T00:00:00.000Z`),
      endedAt: new Date(productionDayUtcPeriod(params.collectionDate).endedAt),
      now: params.now,
      expectedTimestampPolicy: params.request.timestampPolicy,
    });
  if (params.request.timestampPolicy === "published_at") {
    validateManifestProviderCounts(sourceCollection.value, datasetManifest);
  }
  const githubPolicy = historicalGitHubPolicy({
    allowOmission: params.request.allowHistoricalGitHubOmission,
    omissionReason: params.githubOmissionReason,
    collectedRowCount:
      datasetManifest.dataset.providerCounts["github-trending-page"] ?? 0,
  });

  const requestedUtcPeriod = productionDayUtcPeriod(params.collectionDate);
  const provenance: HistoricalRegenerationSourceProvenance = {
    mode: "historical-regeneration",
    timestampPolicy: params.request.timestampPolicy,
    requestedUtcPeriod,
    collectionUtcPeriod: requestedUtcPeriod,
    priorCollectionProof: {
      sourceAttempt: {
        artifactFormat: "reader-summary-production-day-run-v1",
        sha256: sourceAttempt.sha256,
      },
      collectionArtifact: {
        artifactFormat: "reader-summary-clean-real-day-collection-v1",
        sha256: sourceCollection.sha256,
      },
      collectionQualityReport: {
        artifactFormat: "yesterday-social-collection-quality-report-v1",
        sha256: sourceCollectionQuality.sha256,
      },
    },
    regenerationInputManifest: {
      artifactFormat: datasetManifest.format,
      sha256: datasetManifestFileSha256,
      generatedAt: datasetManifest.generatedAt,
      datasetSha256: datasetManifest.dataset.aggregateSha256,
      feedRowCount: datasetManifest.dataset.feedRowCount,
      githubEligibilityRowCount:
        datasetManifest.dataset.githubEligibilityRowCount,
      providerCounts: datasetManifest.dataset.providerCounts,
      timestampPolicy: datasetManifest.policy.timestampPolicy,
    },
    githubPolicy,
    freshnessOverride: {
      mode: "historical_regeneration_current_snapshot",
      generalAllowHistorical: false,
      maxManifestAgeSeconds: 1800,
    },
  };

  return {
    provenance,
    verifiedCollectionStep: {
      id: "collect",
      command: [
        "verify hash-bound prior collection attempt",
        `attempt=${sourceAttempt.sha256}`,
        `collection=${sourceCollection.sha256}`,
        `quality=${sourceCollectionQuality.sha256}`,
        `dataset=${datasetManifest.dataset.aggregateSha256}`,
        `timestampPolicy=${params.request.timestampPolicy}`,
      ].join(" "),
      status: "passed",
      durationMs: 0,
      exitCode: 0,
    },
  };
}

function historicalGitHubPolicy(params: {
  readonly allowOmission: boolean;
  readonly omissionReason?: string;
  readonly collectedRowCount: number;
}): HistoricalRegenerationSourceProvenance["githubPolicy"] {
  const reason = params.omissionReason?.trim();
  if (params.collectedRowCount > 0) {
    if (params.allowOmission || reason !== undefined) {
      throw new Error(
        "Historical GitHub omission is forbidden when collected GitHub rows exist",
      );
    }
    return {
      mode: "verified_collected_rows",
      collectedRowCount: params.collectedRowCount,
    };
  }
  if (
    !params.allowOmission ||
    reason === undefined ||
    reason.length < 20 ||
    reason.length > 500 ||
    /[\r\n]/u.test(reason) ||
    !noRawSecretFragments(reason)
  ) {
    throw new Error(
      "GitHub0 requires one safe explicit historical_unavailable omission policy",
    );
  }
  return {
    mode: "historical_unavailable",
    reason,
    collectedRowCount: 0,
  };
}

function validateManifestProviderCounts(
  collection: unknown,
  manifest: {
    readonly dataset: {
      readonly providerCounts: Readonly<Record<string, number>>;
    };
  },
): void {
  if (
    !isRecord(collection) ||
    !isRecord(collection.targetWindow) ||
    !isRecord(collection.targetWindow.providerCounts) ||
    JSON.stringify(
      normalizedProviderCounts(collection.targetWindow.providerCounts),
    ) !==
      JSON.stringify(normalizedProviderCounts(manifest.dataset.providerCounts))
  ) {
    throw new Error(
      "Dataset manifest provider counts do not match collection proof",
    );
  }
}

function loadHashBoundJson(params: {
  readonly path: string;
  readonly expectedSha256: string;
  readonly label: string;
}): { readonly value: unknown; readonly sha256: string } {
  const bytes = readFileSync(params.path);
  const sha256 = sha256Hex(bytes);
  if (sha256 !== params.expectedSha256) {
    throw new Error(`${params.label} content hash does not match`);
  }
  try {
    return {
      value: JSON.parse(bytes.toString("utf8")) as unknown,
      sha256,
    };
  } catch {
    throw new Error(`${params.label} is not valid JSON`);
  }
}

function validateSourceAttempt(value: unknown, collectionDate: string): void {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.artifactFormat !== "reader-summary-production-day-run-v1" ||
    value.generatedBy !== "npm run run:reader-summary-production-day" ||
    value.requestedDate !== collectionDate ||
    value.collectionDate !== collectionDate ||
    value.blockingPassed !== false ||
    !isRecord(value.model) ||
    value.model.liveCollection !== true ||
    value.model.allowDegraded !== false ||
    value.model.allowHistorical !== false ||
    !Array.isArray(value.steps)
  ) {
    throw new Error("Source production attempt is not a strict failed run");
  }
  for (const id of ["migrate", "collect", "collection-quality"] as const) {
    const matchingSteps = value.steps.filter(
      (step) => isRecord(step) && step.id === id,
    );
    if (
      matchingSteps.length !== 1 ||
      matchingSteps[0]?.status !== "passed" ||
      matchingSteps[0]?.exitCode !== 0
    ) {
      throw new Error(`Source production attempt did not pass ${id}`);
    }
  }
  const summaryStep = value.steps.find(
    (step) => isRecord(step) && step.id === "durable-reader-summary",
  );
  if (!isRecord(summaryStep) || summaryStep.status !== "failed") {
    throw new Error("Source production attempt is not a summary-stage failure");
  }
}

function validateSourceCollection(
  value: unknown,
  collectionDate: string,
): void {
  const expectedPeriod = productionDayUtcPeriod(collectionDate);
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.artifactFormat !== "reader-summary-clean-real-day-collection-v1" ||
    value.generatedBy !==
      "npm run run:reader-summary-clean-real-day-collection" ||
    value.blockingPassed !== true ||
    !allBooleanGatesPass(value.qualityGates) ||
    !isRecord(value.run) ||
    value.run.collectionDate !== collectionDate ||
    !isRecord(value.inputs) ||
    !isRecord(value.inputs.targetPublishedWindow) ||
    value.inputs.targetPublishedWindow.startInclusive !==
      expectedPeriod.startedAt ||
    value.inputs.targetPublishedWindow.endExclusive !==
      expectedPeriod.endedAt ||
    !isRecord(value.targetWindow) ||
    !isRecord(value.targetWindow.providerCounts) ||
    !exactProviderKeys(value.targetWindow.providerCounts) ||
    !allExpectedScansSucceeded(value.scans)
  ) {
    throw new Error("Source collection artifact is not a passing exact day");
  }
}

function validateSourceCollectionQuality(
  value: unknown,
  collectionDate: string,
): void {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.artifactFormat !== "yesterday-social-collection-quality-report-v1" ||
    value.generatedBy !== "npm run check:yesterday-social-collection-quality" ||
    value.collectionDate !== collectionDate ||
    value.collectionBlockingPassed !== true ||
    !allBooleanGatesPass(value.qualityGates)
  ) {
    throw new Error("Source collection quality report is not passing");
  }
}

function validateProviderCountsMatch(
  collection: unknown,
  quality: unknown,
): void {
  if (
    !isRecord(collection) ||
    !isRecord(collection.targetWindow) ||
    !isRecord(collection.targetWindow.providerCounts) ||
    !isRecord(quality) ||
    !isRecord(quality.dayWindowAudit) ||
    !Array.isArray(quality.dayWindowAudit.providerBreakdown)
  ) {
    throw new Error("Collection provider count evidence is missing");
  }
  const qualityCounts = Object.fromEntries(
    quality.dayWindowAudit.providerBreakdown.flatMap((entry) =>
      isRecord(entry) &&
      typeof entry.providerKey === "string" &&
      typeof entry.publishedInsideWindowFeedItemCount === "number"
        ? [[entry.providerKey, entry.publishedInsideWindowFeedItemCount]]
        : [],
    ),
  );
  if (
    JSON.stringify(
      normalizedProviderCounts(collection.targetWindow.providerCounts),
    ) !== JSON.stringify(normalizedProviderCounts(qualityCounts))
  ) {
    throw new Error("Collection provider counts do not match quality evidence");
  }
}

function normalizedProviderCounts(
  value: Record<string, unknown>,
): readonly (readonly [string, number])[] {
  return Object.entries(value)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort(([left], [right]) => left.localeCompare(right));
}

function exactProviderKeys(value: Record<string, unknown>): boolean {
  return (
    JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...expectedProviders].sort())
  );
}

function allExpectedScansSucceeded(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    expectedProviders.every((providerKey) =>
      value.some(
        (scan) =>
          isRecord(scan) &&
          scan.providerKey === providerKey &&
          scan.status === "succeeded",
      ),
    )
  );
}

function allBooleanGatesPass(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((gate) => gate === true)
  );
}
