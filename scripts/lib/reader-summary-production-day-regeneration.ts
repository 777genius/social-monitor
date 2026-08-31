import { readFileSync } from "node:fs";

import type { ReaderSummaryTimestampPolicy } from "@social-monitor/summary/ports";

import {
  requiredProductionDayStepIds,
  type ProductionDayStepReport,
} from "./reader-summary-production-day-collection-barrier";
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
import { historicalPromotionRebuildIdentity } from
  "./reader-summary-promotion-v2-historical-classification";
import { buildHistoricalPromotionCanonicalInput } from
  "./reader-summary-promotion-v2-historical-input";
import { historicalPromotionGenerationAuthority } from
  "./reader-summary-promotion-v2-historical-generation-authority";

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
  } | null;
  readonly activeSourcePublicationProof: Readonly<{
    readonly artifactFormat: "reader-summary-active-database-publication-v1";
    readonly publicationId: string;
    readonly artifactId: string;
    readonly reportSha256: string;
    readonly proofSha256: string;
  }> | null;
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
  readonly promotionRebuild?: Readonly<{
    rebuildIdentity: string;
    authoritativeInputDigest: string;
    policyVersion: "reader_post_promotion.v2";
    sourceAuthorityKind:
      | "active-database-publication"
      | "preserved-production-day-report";
    sourcePublicationId: string;
    sourceArtifactId: string;
    sourcePublicationReportSha256: string;
    sourcePublicationProofSha256: string;
  }>;
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
      ...(params.request.sourceEvidence.kind ===
        "preserved-production-day-report"
        ? [
            params.request.sourceEvidence.sourceReportPath,
            params.request.sourceEvidence.collectionArtifactPath,
            params.request.sourceEvidence.collectionQualityReportPath,
          ]
        : []),
      params.request.datasetManifestPath,
    ],
    forbiddenOutputPaths: params.forbiddenOutputPaths,
  });
  const preserved = params.request.sourceEvidence.kind ===
    "preserved-production-day-report"
    ? loadPreservedSourceEvidence(
        params.request.sourceEvidence,
        params.collectionDate,
        params.request.promotionRebuild,
      )
    : null;
  const activeSourcePublicationProof = params.request.sourceEvidence.kind ===
    "active-database-publication"
    ? activePublicationProof(
        params.request.promotionRebuild,
        params.collectionDate,
      )
    : null;
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
  if (params.request.timestampPolicy === "published_at" && preserved !== null) {
    validateManifestProviderCounts(preserved.collection.value, datasetManifest);
  }
  const githubPolicy = historicalGitHubPolicy({
    allowOmission: params.request.allowHistoricalGitHubOmission,
    omissionReason: params.githubOmissionReason,
    collectedRowCount:
      datasetManifest.dataset.providerCounts["github-trending-page"] ?? 0,
  });
  assertPromotionCanonicalInput({
    request: params.request,
    datasetManifest,
    datasetManifestFileSha256,
    githubPolicy,
  });

  const requestedUtcPeriod = productionDayUtcPeriod(params.collectionDate);
  const provenance: HistoricalRegenerationSourceProvenance = {
    mode: "historical-regeneration",
    timestampPolicy: params.request.timestampPolicy,
    requestedUtcPeriod,
    collectionUtcPeriod: requestedUtcPeriod,
    priorCollectionProof: preserved === null
      ? null
      : {
          sourceAttempt: {
            artifactFormat: "reader-summary-production-day-run-v1",
            sha256: preserved.attempt.sha256,
          },
          collectionArtifact: {
            artifactFormat: "reader-summary-clean-real-day-collection-v1",
            sha256: preserved.collection.sha256,
          },
          collectionQualityReport: {
            artifactFormat: "yesterday-social-collection-quality-report-v1",
            sha256: preserved.quality.sha256,
          },
        },
    activeSourcePublicationProof,
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
    ...(params.request.promotionRebuild === undefined
      ? {}
      : { promotionRebuild: params.request.promotionRebuild }),
  };

  return {
    provenance,
    verifiedCollectionStep: {
      id: "collect",
      command: [
        preserved === null
          ? "verify active database publication and fresh canonical dataset"
          : "verify hash-bound prior collection attempt",
        ...(preserved === null
          ? [
              `sourcePublication=${activeSourcePublicationProof!.publicationId}`,
              `sourceProof=${activeSourcePublicationProof!.proofSha256}`,
            ]
          : [
              `attempt=${preserved.attempt.sha256}`,
              `collection=${preserved.collection.sha256}`,
              `quality=${preserved.quality.sha256}`,
            ]),
        `dataset=${datasetManifest.dataset.aggregateSha256}`,
        `timestampPolicy=${params.request.timestampPolicy}`,
      ].join(" "),
      status: "passed",
      durationMs: 0,
      exitCode: 0,
    },
  };
}

const assertPromotionCanonicalInput = (input: {
  readonly request: HistoricalRegenerationRequest;
  readonly datasetManifest: Parameters<
    typeof buildHistoricalPromotionCanonicalInput
  >[0]["datasetManifest"];
  readonly datasetManifestFileSha256: string;
  readonly githubPolicy: HistoricalRegenerationSourceProvenance["githubPolicy"];
}): void => {
  const promotion = input.request.promotionRebuild;
  if (promotion === undefined) return;
  const supportingEvidence = input.request.sourceEvidence.kind ===
    "active-database-publication"
    ? { kind: input.request.sourceEvidence.kind } as const
    : {
        kind: input.request.sourceEvidence.kind,
        sourceReportSha256: input.request.sourceEvidence.sourceReportSha256,
        collectionArtifactSha256:
          input.request.sourceEvidence.collectionArtifactSha256,
        collectionQualityReportSha256:
          input.request.sourceEvidence.collectionQualityReportSha256,
      } as const;
  const canonical = buildHistoricalPromotionCanonicalInput({
    date: input.datasetManifest.period.startedAt.slice(0, 10),
    sourcePublication: {
      kind: "active-database-publication",
      publicationId: promotion.sourcePublicationId,
      artifactId: promotion.sourceArtifactId,
      reportSha256: promotion.sourcePublicationReportSha256,
      proofSha256: promotion.sourcePublicationProofSha256,
    },
    datasetManifest: input.datasetManifest,
    datasetManifestSha256: input.datasetManifestFileSha256,
    supportingEvidence,
    generationAuthority: historicalPromotionGenerationAuthority({
      tenantId: input.datasetManifest.scope.tenantId,
      workspaceId: input.datasetManifest.scope.workspaceId,
      env: process.env,
    }),
    allowHistoricalGitHubOmission:
      input.githubPolicy.mode === "historical_unavailable",
    ...(input.githubPolicy.mode === "historical_unavailable"
      ? { historicalGitHubOmissionReason: input.githubPolicy.reason }
      : {}),
  });
  if (canonical.authoritativeInputDigest !==
      promotion.authoritativeInputDigest) {
    throw new Error(
      "Promotion rebuild canonical input digest does not match evidence",
    );
  }
};

const loadPreservedSourceEvidence = (
  source: Extract<HistoricalRegenerationRequest["sourceEvidence"], {
    readonly kind: "preserved-production-day-report";
  }>,
  collectionDate: string,
  promotionRebuild: HistoricalRegenerationRequest["promotionRebuild"],
) => {
  const attempt = loadHashBoundJson({
    path: source.sourceReportPath,
    expectedSha256: source.sourceReportSha256,
    label: "source production attempt",
  });
  const collection = loadHashBoundJson({
    path: source.collectionArtifactPath,
    expectedSha256: source.collectionArtifactSha256,
    label: "source collection artifact",
  });
  const quality = loadHashBoundJson({
    path: source.collectionQualityReportPath,
    expectedSha256: source.collectionQualityReportSha256,
    label: "source collection quality report",
  });
  validateSourceAttempt(attempt.value, collectionDate, promotionRebuild);
  validateSourceCollection(collection.value, collectionDate);
  validateSourceCollectionQuality(quality.value, collectionDate);
  validateProviderCountsMatch(collection.value, quality.value);
  return { attempt, collection, quality };
};

const activePublicationProof = (
  promotionRebuild: HistoricalRegenerationRequest["promotionRebuild"],
  collectionDate: string,
): NonNullable<
  HistoricalRegenerationSourceProvenance["activeSourcePublicationProof"]
> => {
  if (promotionRebuild === undefined ||
      promotionRebuild.sourceAuthorityKind !==
        "active-database-publication") {
    throw new Error(
      "Active publication admission requires Promotion V2 source authority",
    );
  }
  validatePromotionRebuildAuthority(promotionRebuild, collectionDate);
  return {
    artifactFormat: "reader-summary-active-database-publication-v1",
    publicationId: promotionRebuild.sourcePublicationId,
    artifactId: promotionRebuild.sourceArtifactId,
    reportSha256: promotionRebuild.sourcePublicationReportSha256,
    proofSha256: promotionRebuild.sourcePublicationProofSha256,
  };
};

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

function validateSourceAttempt(
  value: unknown,
  collectionDate: string,
  promotionRebuild: HistoricalRegenerationRequest["promotionRebuild"],
): void {
  if (promotionRebuild !== undefined) {
    validatePromotionRebuildSourceAttempt(
      value,
      collectionDate,
      promotionRebuild,
    );
    return;
  }
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
  const steps = value.steps;
  for (const id of ["collect", "collection-quality"] as const) {
    const matchingSteps = steps.filter(
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
  const migrationSteps = steps.filter(
    (step) => isRecord(step) && step.id === "migrate",
  );
  if (
    migrationSteps.length > 0 &&
    (migrationSteps.length !== 1 ||
      migrationSteps[0]?.status !== "passed" ||
      migrationSteps[0]?.exitCode !== 0)
  ) {
    throw new Error("Source production attempt did not pass migrate");
  }
  const summaryStep = steps.find(
    (step) => isRecord(step) && step.id === "durable-reader-summary",
  );
  if (!isRecord(summaryStep) || summaryStep.status !== "failed") {
    throw new Error("Source production attempt is not a summary-stage failure");
  }
  const expectedStepIds = [
    ...requiredProductionDayStepIds,
    ...(migrationSteps.length === 1 ? ["migrate"] : []),
  ];
  if (
    steps.length !== expectedStepIds.length ||
    expectedStepIds.some(
      (id) =>
        steps.filter((step) => isRecord(step) && step.id === id).length !==
        1,
    )
  ) {
    throw new Error("Source production attempt has an invalid step inventory");
  }
}

function validatePromotionRebuildSourceAttempt(
  value: unknown,
  collectionDate: string,
  promotionRebuild: NonNullable<
    HistoricalRegenerationRequest["promotionRebuild"]
  >,
): void {
  if (promotionRebuild.sourceAuthorityKind !==
      "preserved-production-day-report") {
    throw new Error(
      "Preserved report admission has the wrong source authority kind",
    );
  }
  validatePromotionRebuildAuthority(promotionRebuild, collectionDate);
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.artifactFormat !== "reader-summary-production-day-run-v1" ||
    value.generatedBy !== "npm run run:reader-summary-production-day" ||
    value.requestedDate !== collectionDate ||
    value.collectionDate !== collectionDate ||
    value.blockingPassed !== true ||
    !isRecord(value.model) ||
    value.model.writesProductionData !== true ||
    value.model.freshSummaryCapture !== true ||
    value.model.allowDegraded !== false ||
    value.model.allowHistorical !== false ||
    !Array.isArray(value.steps) ||
    !isRecord(value.qualityGates) ||
    Object.values(value.qualityGates).some((gate) => gate !== true)
  ) {
    throw new Error(
      "Promotion rebuild source attempt is not a complete production receipt",
    );
  }
  for (const id of requiredProductionDayStepIds) {
    const matching = value.steps.filter(
      (step) => isRecord(step) && step.id === id,
    );
    if (matching.length !== 1 || matching[0]?.status !== "passed" ||
        matching[0]?.exitCode !== 0) {
      throw new Error(`Promotion rebuild source attempt did not complete ${id}`);
    }
  }
  const durable = value.steps.find(
    (step) => isRecord(step) && step.id === "durable-reader-summary",
  );
  if (!isRecord(durable) || durable.status !== "passed" ||
      durable.exitCode !== 0) {
    throw new Error(
      "Promotion rebuild source attempt lacks a durable successful publication",
    );
  }
}

function validatePromotionRebuildAuthority(
  promotionRebuild: NonNullable<
    HistoricalRegenerationRequest["promotionRebuild"]
  >,
  collectionDate: string,
): void {
  if (historicalPromotionRebuildIdentity({
    date: collectionDate,
    authoritativeInputDigest: promotionRebuild.authoritativeInputDigest,
    policyVersion: promotionRebuild.policyVersion,
  }) !== promotionRebuild.rebuildIdentity) {
    throw new Error("Promotion rebuild identity does not match its authority");
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
