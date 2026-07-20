import { createHash } from "node:crypto";

import { readReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-guard";
import type { ReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-manifest";

const regenerationFlag = "--historical-regeneration-current-snapshot";
const manifestPathOption = "--regeneration-dataset-manifest";
const manifestShaOption = "--regeneration-dataset-manifest-sha256";
const tenantOption = "--regeneration-tenant-id";
const workspaceOption = "--regeneration-workspace-id";
const boundedOptions = [
  regenerationFlag,
  manifestPathOption,
  manifestShaOption,
  tenantOption,
  workspaceOption,
] as const;

export type CollectionQualityRegenerationFreshnessEvidence = {
  readonly mode: "historical_regeneration_current_snapshot";
  readonly generalAllowHistorical: false;
  readonly manifestFormat: string;
  readonly manifestFileSha256: string;
  readonly manifestGeneratedAt: string;
  readonly datasetSha256: string;
  readonly scopeSha256: string;
  readonly maxManifestAgeSeconds: 1800;
};

export type CollectionQualityRegenerationFreshness = {
  readonly manifest: ReaderSummaryDayDatasetManifest;
  readonly evidence: CollectionQualityRegenerationFreshnessEvidence;
};

export function collectionQualityRegenerationFreshnessArgs(params: {
  readonly manifestPath: string;
  readonly manifestSha256: string;
  readonly tenantId: string;
  readonly workspaceId: string;
}): readonly string[] {
  return [
    regenerationFlag,
    manifestPathOption,
    params.manifestPath,
    manifestShaOption,
    params.manifestSha256,
    tenantOption,
    params.tenantId,
    workspaceOption,
    params.workspaceId,
  ];
}

export function resolveCollectionQualityRegenerationFreshness(params: {
  readonly argv: readonly string[];
  readonly collectionDate: string;
  readonly now: Date;
  readonly update: boolean;
  readonly allowHistorical: boolean;
}): CollectionQualityRegenerationFreshness | null {
  const requested = boundedOptions.some((option) =>
    params.argv.includes(option),
  );
  if (!requested) {
    return null;
  }
  if (
    !params.argv.includes(regenerationFlag) ||
    !params.update ||
    params.allowHistorical
  ) {
    throw new Error(
      "Historical regeneration freshness requires update mode and forbids generic --allow-historical",
    );
  }
  const manifestPath = requiredOption(params.argv, manifestPathOption);
  const manifestSha256 = requiredSha256(
    requiredOption(params.argv, manifestShaOption),
  );
  const tenantId = requiredOption(params.argv, tenantOption);
  const workspaceId = requiredOption(params.argv, workspaceOption);
  const startedAt = new Date(`${params.collectionDate}T00:00:00.000Z`);
  const endedAt = new Date(startedAt.getTime() + 86_400_000);
  const { manifest, fileSha256 } = readReaderSummaryDayDatasetManifest({
    path: manifestPath,
    expectedFileSha256: manifestSha256,
    tenantId,
    workspaceId,
    startedAt,
    endedAt,
    now: params.now,
  });

  return {
    manifest,
    evidence: {
      mode: "historical_regeneration_current_snapshot",
      generalAllowHistorical: false,
      manifestFormat: manifest.format,
      manifestFileSha256: fileSha256,
      manifestGeneratedAt: manifest.generatedAt,
      datasetSha256: manifest.dataset.aggregateSha256,
      scopeSha256: createHash("sha256")
        .update(`${tenantId}\u0000${workspaceId}`, "utf8")
        .digest("hex"),
      maxManifestAgeSeconds: 1800,
    },
  };
}

export function assertCollectionQualityMatchesRegenerationManifest(params: {
  readonly providerCounts: Readonly<Record<string, number>>;
  readonly freshness: CollectionQualityRegenerationFreshness;
}): void {
  if (
    JSON.stringify(sortedCounts(params.providerCounts)) !==
    JSON.stringify(
      sortedCounts(params.freshness.manifest.dataset.providerCounts),
    )
  ) {
    throw new Error(
      "Collection quality provider counts do not match regeneration dataset manifest",
    );
  }
}

function requiredOption(argv: readonly string[], name: string): string {
  const indexes = argv.flatMap((value, index) =>
    value === name ? [index] : [],
  );
  if (indexes.length !== 1) {
    throw new Error(`${name} must be provided exactly once`);
  }
  const value = argv[indexes[0]! + 1]?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function requiredSha256(value: string): string {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${manifestShaOption} must be a lowercase SHA-256`);
  }
  return value;
}

function sortedCounts(
  value: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}
