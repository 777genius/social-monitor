import {
  durableEvidenceBindingEqual,
  isRecord,
  periodsEqual,
  type DurableEvidenceBinding,
  type ProductionDayUtcPeriod,
} from "./reader-summary-production-day-provenance";
import type { HistoricalRegenerationSourceProvenance } from "./reader-summary-production-day-regeneration";
import { completeDatasetGuardPhases } from "./reader-summary-day-dataset-guard";

type DurableEvidenceWithProvenance = {
  readonly provenance?: unknown;
};

export type HistoricalRegenerationProvenance =
  HistoricalRegenerationSourceProvenance & {
    readonly nonLive: false;
    readonly sourceEvidence: DurableEvidenceBinding | null;
    readonly datasetGuardEvidence: unknown;
  };

export function buildHistoricalRegenerationProvenance(params: {
  readonly source: HistoricalRegenerationSourceProvenance;
  readonly durableEvidence: DurableEvidenceWithProvenance | null;
  readonly evidenceBinding: DurableEvidenceBinding | null;
}): HistoricalRegenerationProvenance {
  return {
    ...params.source,
    nonLive: false,
    sourceEvidence: params.evidenceBinding,
    datasetGuardEvidence: datasetGuardEvidence(params.durableEvidence),
  };
}

export function validHistoricalRegenerationProvenance(params: {
  readonly value: unknown;
  readonly expectedPeriod: ProductionDayUtcPeriod;
  readonly evidenceBinding: DurableEvidenceBinding | null;
}): boolean {
  if (!isRecord(params.value) || params.evidenceBinding === null) {
    return false;
  }
  const priorCollectionProof = params.value.priorCollectionProof;
  const activeSourcePublicationProof =
    params.value.activeSourcePublicationProof;
  return (
    params.value.mode === "historical-regeneration" &&
    params.value.nonLive === false &&
    (params.value.timestampPolicy === "published_at" ||
      params.value.timestampPolicy === "observed_at") &&
    periodsEqual(params.value.requestedUtcPeriod, params.expectedPeriod) &&
    periodsEqual(params.value.collectionUtcPeriod, params.expectedPeriod) &&
    durableEvidenceBindingEqual(
      params.value.sourceEvidence,
      params.evidenceBinding,
    ) &&
    validRegenerationSourceAuthority({
      priorCollectionProof,
      activeSourcePublicationProof,
      promotionRebuild: params.value.promotionRebuild,
    }) &&
    isRecord(params.value.regenerationInputManifest) &&
    params.value.regenerationInputManifest.timestampPolicy ===
      params.value.timestampPolicy &&
    datasetGuardMatchesManifest(
      params.value.datasetGuardEvidence,
      params.value.regenerationInputManifest,
    ) &&
    isRecord(params.value.freshnessOverride) &&
    params.value.freshnessOverride.mode ===
      "historical_regeneration_current_snapshot" &&
    params.value.freshnessOverride.generalAllowHistorical === false &&
    params.value.freshnessOverride.maxManifestAgeSeconds === 1800 &&
    validHistoricalGitHubPolicy(
      params.value.githubPolicy,
      params.value.regenerationInputManifest,
    )
  );
}

const validRegenerationSourceAuthority = (input: {
  readonly priorCollectionProof: unknown;
  readonly activeSourcePublicationProof: unknown;
  readonly promotionRebuild: unknown;
}): boolean => {
  if (isRecord(input.priorCollectionProof)) {
    return input.activeSourcePublicationProof === null &&
      hashBoundArtifactMatches(
        input.priorCollectionProof.sourceAttempt,
        "reader-summary-production-day-run-v1",
      ) &&
      hashBoundArtifactMatches(
        input.priorCollectionProof.collectionArtifact,
        "reader-summary-clean-real-day-collection-v1",
      ) &&
      hashBoundArtifactMatches(
        input.priorCollectionProof.collectionQualityReport,
        "yesterday-social-collection-quality-report-v1",
      );
  }
  if (!isRecord(input.activeSourcePublicationProof) ||
      !isRecord(input.promotionRebuild)) {
    return false;
  }
  return input.priorCollectionProof === null &&
    input.activeSourcePublicationProof.artifactFormat ===
      "reader-summary-active-database-publication-v1" &&
    input.promotionRebuild.sourceAuthorityKind ===
      "active-database-publication" &&
    input.activeSourcePublicationProof.publicationId ===
      input.promotionRebuild.sourcePublicationId &&
    input.activeSourcePublicationProof.artifactId ===
      input.promotionRebuild.sourceArtifactId &&
    input.activeSourcePublicationProof.reportSha256 ===
      input.promotionRebuild.sourcePublicationReportSha256 &&
    input.activeSourcePublicationProof.proofSha256 ===
      input.promotionRebuild.sourcePublicationProofSha256 &&
    [
      input.activeSourcePublicationProof.reportSha256,
      input.activeSourcePublicationProof.proofSha256,
    ].every((value) =>
      typeof value === "string" && /^[0-9a-f]{64}$/u.test(value));
};

export function regenerationDatasetGuardMatches(params: {
  readonly evidence: DurableEvidenceWithProvenance | null;
  readonly provenance: HistoricalRegenerationSourceProvenance | null;
}): boolean {
  if (params.evidence === null || params.provenance === null) {
    return false;
  }
  const evidenceProvenance = params.evidence.provenance;
  if (!isRecord(evidenceProvenance)) {
    return false;
  }
  return datasetGuardMatchesManifest(
    evidenceProvenance.datasetManifest,
    params.provenance.regenerationInputManifest,
  );
}

function datasetGuardEvidence(
  evidence: DurableEvidenceWithProvenance | null,
): unknown {
  if (!isRecord(evidence?.provenance)) {
    return null;
  }
  return evidence.provenance.datasetManifest ?? null;
}

function datasetGuardMatchesManifest(
  guard: unknown,
  manifest: Record<string, unknown>,
): boolean {
  return (
    isRecord(guard) &&
    guard.manifestFormat === manifest.artifactFormat &&
    guard.manifestFileSha256 === manifest.sha256 &&
    guard.manifestGeneratedAt === manifest.generatedAt &&
    guard.datasetSha256 === manifest.datasetSha256 &&
    guard.timestampPolicy === manifest.timestampPolicy &&
    guard.feedRowCount === manifest.feedRowCount &&
    guard.githubEligibilityRowCount === manifest.githubEligibilityRowCount &&
    JSON.stringify(guard.providerCounts) ===
      JSON.stringify(manifest.providerCounts) &&
    JSON.stringify(guard.completedPhases) ===
      JSON.stringify(completeDatasetGuardPhases)
  );
}

function validHistoricalGitHubPolicy(
  value: unknown,
  manifest: Record<string, unknown>,
): boolean {
  if (
    !isRecord(value) ||
    !isRecord(manifest.providerCounts) ||
    typeof value.collectedRowCount !== "number" ||
    !Number.isInteger(value.collectedRowCount) ||
    value.collectedRowCount < 0
  ) {
    return false;
  }
  const manifestCount = manifest.providerCounts["github-trending-page"] ?? 0;
  if (value.collectedRowCount !== manifestCount) {
    return false;
  }
  if (value.mode === "verified_collected_rows") {
    return value.collectedRowCount > 0 && value.reason === undefined;
  }
  return (
    value.mode === "historical_unavailable" &&
    value.collectedRowCount === 0 &&
    typeof value.reason === "string" &&
    value.reason.trim().length >= 20
  );
}

function hashBoundArtifactMatches(
  value: unknown,
  artifactFormat: string,
): boolean {
  return (
    isRecord(value) &&
    value.artifactFormat === artifactFormat &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/u.test(value.sha256)
  );
}
