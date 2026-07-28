import { readFileSync } from "node:fs";

import type { ReaderSummaryTimestampPolicy } from "@social-monitor/summary/ports";

import {
  inspectDurableEvidenceArtifact,
  isRecord,
  productionDayUtcPeriod,
  sha256Hex,
} from "./reader-summary-production-day-provenance";
import {
  validateLiveProductionDayReport,
  type HistoricalReuseProvenance,
} from "./reader-summary-production-day-report";

const reuseSourceReportOption = "--reuse-source-report";
const reuseSourceArtifactIdOption = "--reuse-source-artifact-id";
const reuseSourceArtifactSha256Option = "--reuse-source-artifact-sha256";
const reuseEvidenceArtifactIdOption = "--reuse-evidence-artifact-id";
const reuseEvidenceArtifactSha256Option = "--reuse-evidence-artifact-sha256";
const reuseCollectionArtifactOption = "--reuse-collection-artifact";
const reuseCollectionArtifactSha256Option =
  "--reuse-collection-artifact-sha256";
const reuseCollectionQualityReportOption = "--reuse-collection-quality-report";
const reuseCollectionQualityReportSha256Option =
  "--reuse-collection-quality-report-sha256";
const reuseDatasetManifestOption = "--reuse-dataset-manifest";
const reuseDatasetManifestSha256Option = "--reuse-dataset-manifest-sha256";
const recoveryTimestampPolicyOption = "--recovery-timestamp-policy";

export type ProductionDayExecutionRequest =
  | { readonly mode: "live-production" }
  | {
      readonly mode: "historical-regeneration";
      readonly sourceReportPath: string;
      readonly sourceReportSha256: string;
      readonly collectionArtifactPath: string;
      readonly collectionArtifactSha256: string;
      readonly collectionQualityReportPath: string;
      readonly collectionQualityReportSha256: string;
      readonly datasetManifestPath: string;
      readonly datasetManifestSha256: string;
      readonly timestampPolicy: ReaderSummaryTimestampPolicy;
      readonly allowHistoricalGitHubOmission: boolean;
    }
  | {
      readonly mode: "historical-reuse";
      readonly sourceReportPath: string;
      readonly sourceReportArtifactId: string;
      readonly sourceReportSha256: string;
      readonly evidenceArtifactId: string;
      readonly evidenceArtifactSha256: string;
    };

export function resolveProductionDayExecutionRequest(
  args: readonly string[],
): ProductionDayExecutionRequest {
  const skipLiveCollection = args.includes("--skip-live-collection");
  const reuseExistingArtifacts = args.includes("--reuse-existing-artifacts");
  const allowHistorical = args.includes("--allow-historical");
  const regenerateAfterPassedCollection = args.includes(
    "--regenerate-after-passed-collection",
  );
  const allowHistoricalGitHubOmission = args.includes(
    "--allow-historical-github-omission",
  );
  const suppliedRegenerationOption = [
    reuseCollectionArtifactOption,
    reuseCollectionArtifactSha256Option,
    reuseCollectionQualityReportOption,
    reuseCollectionQualityReportSha256Option,
    reuseDatasetManifestOption,
    reuseDatasetManifestSha256Option,
    recoveryTimestampPolicyOption,
  ].some((option) => args.includes(option));
  const suppliedReuseOption = [
    reuseSourceReportOption,
    reuseSourceArtifactIdOption,
    reuseSourceArtifactSha256Option,
    reuseEvidenceArtifactIdOption,
    reuseEvidenceArtifactSha256Option,
  ].some((option) => args.includes(option));
  const anyHistoricalIntent =
    skipLiveCollection || reuseExistingArtifacts || suppliedReuseOption;

  if (regenerateAfterPassedCollection || suppliedRegenerationOption) {
    if (
      !regenerateAfterPassedCollection ||
      skipLiveCollection ||
      reuseExistingArtifacts ||
      allowHistorical ||
      args.includes(reuseSourceArtifactIdOption) ||
      args.includes(reuseEvidenceArtifactIdOption) ||
      args.includes(reuseEvidenceArtifactSha256Option)
    ) {
      throw new Error(
        "Historical regeneration requires its bounded mode and fresh summary capture",
      );
    }
    return {
      mode: "historical-regeneration",
      sourceReportPath: requiredOption(args, reuseSourceReportOption),
      sourceReportSha256: requiredSha256(args, reuseSourceArtifactSha256Option),
      collectionArtifactPath: requiredOption(
        args,
        reuseCollectionArtifactOption,
      ),
      collectionArtifactSha256: requiredSha256(
        args,
        reuseCollectionArtifactSha256Option,
      ),
      collectionQualityReportPath: requiredOption(
        args,
        reuseCollectionQualityReportOption,
      ),
      collectionQualityReportSha256: requiredSha256(
        args,
        reuseCollectionQualityReportSha256Option,
      ),
      datasetManifestPath: requiredOption(args, reuseDatasetManifestOption),
      datasetManifestSha256: requiredSha256(
        args,
        reuseDatasetManifestSha256Option,
      ),
      timestampPolicy: optionalTimestampPolicy(args),
      allowHistoricalGitHubOmission,
    };
  }

  if (!anyHistoricalIntent) {
    if (
      allowHistoricalGitHubOmission ||
      args.includes(recoveryTimestampPolicyOption)
    ) {
      throw new Error(
        "Historical recovery options are restricted to historical regeneration",
      );
    }
    return { mode: "live-production" };
  }
  if (!skipLiveCollection || !reuseExistingArtifacts || !allowHistorical) {
    throw new Error(
      "Historical artifact reuse requires --skip-live-collection, --reuse-existing-artifacts and --allow-historical",
    );
  }

  return {
    mode: "historical-reuse",
    sourceReportPath: requiredOption(args, reuseSourceReportOption),
    sourceReportArtifactId: requiredOption(args, reuseSourceArtifactIdOption),
    sourceReportSha256: requiredSha256(args, reuseSourceArtifactSha256Option),
    evidenceArtifactId: requiredOption(args, reuseEvidenceArtifactIdOption),
    evidenceArtifactSha256: requiredSha256(
      args,
      reuseEvidenceArtifactSha256Option,
    ),
  };
}

export function loadHistoricalReuseProvenance(params: {
  readonly request: Extract<
    ProductionDayExecutionRequest,
    { readonly mode: "historical-reuse" }
  >;
  readonly evidencePath: string;
  readonly frontendFixturePath: string;
  readonly collectionDate: string;
}): {
  readonly provenance: HistoricalReuseProvenance;
  readonly evidence: unknown;
  readonly evidenceBytes: Uint8Array;
} {
  const sourceReportBytes = readFileSync(params.request.sourceReportPath);
  const actualSourceReportSha256 = sha256Hex(sourceReportBytes);
  if (actualSourceReportSha256 !== params.request.sourceReportSha256) {
    throw new Error("Historical source report content hash does not match");
  }
  const sourceReport = parseJson(sourceReportBytes, "historical source report");

  const evidenceBytes = readFileSync(params.evidencePath);
  const actualEvidenceSha256 = sha256Hex(evidenceBytes);
  if (actualEvidenceSha256 !== params.request.evidenceArtifactSha256) {
    throw new Error("Historical evidence artifact content hash does not match");
  }
  const evidence = parseJson(evidenceBytes, "historical evidence artifact");
  const frontendBytes = readFileSync(params.frontendFixturePath);
  const frontendArtifact = parseJson(
    frontendBytes,
    "historical frontend artifact",
  );
  const inspection = inspectDurableEvidenceArtifact({
    evidence,
    evidenceBytes,
    frontendArtifact,
    frontendBytes,
    expectedDate: params.collectionDate,
  });
  if (inspection.binding === null) {
    throw new Error(
      `Historical evidence artifact is invalid: ${inspection.violations.join("; ")}`,
    );
  }
  if (inspection.binding.artifactId !== params.request.evidenceArtifactId) {
    throw new Error("Historical evidence artifact identity does not match");
  }

  const sourceViolations = validateLiveProductionDayReport({
    report: sourceReport,
    binding: inspection.binding,
    expectedDate: params.collectionDate,
  });
  if (sourceViolations.length > 0) {
    throw new Error(
      `Historical source report is not reusable: ${sourceViolations.join("; ")}`,
    );
  }
  if (
    !isRecord(sourceReport) ||
    !isRecord(sourceReport.reportIdentity) ||
    sourceReport.reportIdentity.artifactId !==
      params.request.sourceReportArtifactId
  ) {
    throw new Error("Historical source report identity does not match");
  }

  const requestedUtcPeriod = productionDayUtcPeriod(params.collectionDate);
  return {
    provenance: {
      mode: "historical-reuse",
      nonLive: true,
      requestedUtcPeriod,
      collectionUtcPeriod: requestedUtcPeriod,
      sourceReport: {
        artifactId: params.request.sourceReportArtifactId,
        sha256: actualSourceReportSha256,
      },
      sourceEvidence: inspection.binding,
    },
    evidence,
    evidenceBytes,
  };
}

function requiredOption(args: readonly string[], name: string): string {
  const indexes = args.flatMap((arg, index) => (arg === name ? [index] : []));
  if (indexes.length !== 1) {
    throw new Error(`${name} must be provided exactly once`);
  }
  const value = args[(indexes[0] as number) + 1];
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function requiredSha256(args: readonly string[], name: string): string {
  const value = requiredOption(args, name);
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${name} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function optionalTimestampPolicy(
  args: readonly string[],
): ReaderSummaryTimestampPolicy {
  if (!args.includes(recoveryTimestampPolicyOption)) {
    return "published_at";
  }
  const value = requiredOption(args, recoveryTimestampPolicyOption);
  if (value !== "published_at" && value !== "observed_at") {
    throw new Error(
      `${recoveryTimestampPolicyOption} must be published_at or observed_at`,
    );
  }
  return value;
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}
