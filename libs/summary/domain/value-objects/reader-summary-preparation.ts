import { createHash } from "node:crypto";

export const readerSummarySelectionStrategies = [
  "legacy_v2",
  "jev_shadow",
  "jev_primary_v3",
] as const;

export type ReaderSummarySelectionStrategy =
  typeof readerSummarySelectionStrategies[number];

export const READER_SUMMARY_PREPARATION_CONFIG_VERSION =
  "reader_summary_preparation_config.v1" as const;
export const READER_SUMMARY_PREPARATION_MANIFEST_VERSION =
  "reader_summary_preparation_manifest.v1" as const;

export type ReaderSummaryInterestPreparationConfig = {
  readonly schemaVersion: typeof READER_SUMMARY_PREPARATION_CONFIG_VERSION;
  readonly interestId: string;
  readonly interestSha256: string;
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  readonly inputBuilderVersion: string;
  readonly modelConfigVersion: string;
};

export type ReaderSummaryWorkspacePreparationConfig = {
  readonly schemaVersion: "reader_summary_preparation_config.v2";
  readonly interests: readonly ReaderSummaryInterestPreparationConfig[];
};

export type ReaderSummaryPreparationConfig = ReaderSummaryInterestPreparationConfig |
  ReaderSummaryWorkspacePreparationConfig;

export type ReaderSummaryPreparationCandidate = {
  readonly candidateId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly sourceItemId: string;
  readonly sourceRevisionKey: string;
  readonly sourceSnapshotSha256: string;
  readonly assessmentId: string;
  readonly inputSha256: string;
  readonly publishedAt: string;
  readonly observedAt: string;
  readonly sourceKind: string;
  readonly canonicalIdentity: string;
  readonly storyId?: string;
};

export type ReaderSummaryInterestPreparationManifest = {
  readonly schemaVersion: typeof READER_SUMMARY_PREPARATION_MANIFEST_VERSION;
  readonly cutoffAt: string;
  readonly interestSha256: string;
  readonly rubricSha256: string;
  readonly inputBuilderVersion: string;
  readonly modelConfigVersion: string;
  readonly candidates: readonly ReaderSummaryPreparationCandidate[];
};

export type ReaderSummaryWorkspacePreparationManifest = {
  readonly schemaVersion: "reader_summary_preparation_manifest.v2";
  readonly cutoffAt: string;
  /** Includes cadence, exact window boundaries, and timezone. */
  readonly periodKey: string;
  readonly interests: readonly ReaderSummaryInterestPreparationConfig[];
  readonly candidates: readonly (ReaderSummaryPreparationCandidate & {
    readonly interestId: string;
  })[];
};

export type ReaderSummaryPreparationManifest = ReaderSummaryInterestPreparationManifest |
  ReaderSummaryWorkspacePreparationManifest;

/** Stable across PostgreSQL JSONB object-key reordering; array order stays frozen. */
export const readerSummaryWorkspaceManifestSha256 = (
  manifest: ReaderSummaryWorkspacePreparationManifest,
): string => createHash("sha256").update(JSON.stringify(sortManifestJson(manifest)),
  "utf8").digest("hex");

const sortManifestJson = (value: unknown): unknown => Array.isArray(value)
  ? value.map(sortManifestJson)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => Buffer.compare(Buffer.from(left, "utf8"),
        Buffer.from(right, "utf8")))
      .map(([key, child]) => [key, sortManifestJson(child)]))
    : value;

export const readerSummaryPreparationCandidates = (
  manifest: ReaderSummaryPreparationManifest,
): readonly (ReaderSummaryPreparationCandidate & { readonly interestId: string })[] =>
  manifest.schemaVersion === READER_SUMMARY_PREPARATION_MANIFEST_VERSION
    ? []
    : manifest.candidates;

export const sameReaderSummaryPreparationIdentity = (
  frozen: ReaderSummaryPreparationConfig,
  prepared: ReaderSummaryPreparationConfig,
  manifest: ReaderSummaryPreparationManifest,
): boolean => {
  if (!sameReaderSummaryPreparationConfig(frozen, prepared)) return false;
  if (frozen.schemaVersion === "reader_summary_preparation_config.v2") {
    return manifest.schemaVersion === "reader_summary_preparation_manifest.v2" &&
      manifest.interests.length === frozen.interests.length &&
      manifest.interests.every((entry, index) =>
        sameReaderSummaryPreparationConfig(entry, frozen.interests[index]!));
  }
  return manifest.schemaVersion === "reader_summary_preparation_manifest.v1" &&
    manifest.interestSha256 === frozen.interestSha256 &&
    manifest.rubricSha256 === frozen.rubricSha256 &&
    manifest.inputBuilderVersion === frozen.inputBuilderVersion &&
    manifest.modelConfigVersion === frozen.modelConfigVersion;
};

export const sameReaderSummaryPreparationConfig = (
  left: ReaderSummaryPreparationConfig,
  right: ReaderSummaryPreparationConfig,
): boolean => {
  if (left.schemaVersion !== right.schemaVersion) return false;
  if (left.schemaVersion === "reader_summary_preparation_config.v2") {
    return right.schemaVersion === "reader_summary_preparation_config.v2" &&
      left.interests.length === right.interests.length &&
      left.interests.every((entry, index) =>
        sameReaderSummaryPreparationConfig(entry, right.interests[index]!));
  }
  if (right.schemaVersion !== "reader_summary_preparation_config.v1") return false;
  return left.interestId === right.interestId &&
    left.interestSha256 === right.interestSha256 &&
    left.rubricVersion === right.rubricVersion &&
    left.rubricSha256 === right.rubricSha256 &&
    left.inputBuilderVersion === right.inputBuilderVersion &&
    left.modelConfigVersion === right.modelConfigVersion;
};

export type ReaderSummaryPreparationFailureCode =
  | "assessment_coverage_timeout"
  | "assessment_unavailable"
  | "assessment_snapshot_unavailable"
  | "assessment_inventory_over_budget"
  | "assessment_time_over_budget"
  | "config_unavailable"
  | "scope_changed"
  | "interest_changed"
  | "operator_cancelled"
  | "presentation_unavailable"
  | "presentation_dependency_unavailable";

export function assertReaderSummarySelectionStrategy(
  value: string,
): asserts value is ReaderSummarySelectionStrategy {
  if (!(readerSummarySelectionStrategies as readonly string[]).includes(value)) {
    throw new Error(`Unsupported reader summary selection strategy: ${value}`);
  }
}

export const assertReaderSummaryPreparationManifest = (
  manifest: ReaderSummaryPreparationManifest,
): void => {
  if (manifest.schemaVersion === "reader_summary_preparation_manifest.v2") {
    if (manifest.interests.length < 1 || manifest.interests.length > 32 ||
        typeof manifest.periodKey !== "string" ||
        manifest.periodKey.trim().length === 0 ||
        Buffer.byteLength(manifest.periodKey, "utf8") > 512 ||
        !Number.isFinite(Date.parse(manifest.cutoffAt)) ||
        Buffer.byteLength(JSON.stringify(manifest), "utf8") > 16 * 1024 * 1024) {
      throw new Error("Workspace reader summary preparation manifest is invalid");
    }
    const ids = new Set<string>();
    for (const entry of manifest.interests) {
      const id = entry.interestId;
      if (entry.schemaVersion !== READER_SUMMARY_PREPARATION_CONFIG_VERSION ||
          id.trim().length === 0 || ids.has(id) ||
          (ids.size > 0 && [...ids].at(-1)! >= id) ||
          !sha256(entry.interestSha256) || !sha256(entry.rubricSha256) ||
          entry.rubricVersion.trim().length === 0 ||
          entry.inputBuilderVersion.trim().length === 0 ||
          entry.modelConfigVersion.trim().length === 0) {
        throw new Error("Workspace reader summary interest manifest is invalid");
      }
      ids.add(id);
    }
    if (manifest.candidates.length > 20_000) {
      throw new Error("Workspace reader summary inventory exceeds budget");
    }
    const candidateIds = new Set<string>();
    for (const candidate of manifest.candidates) {
      if (!ids.has(candidate.interestId) || candidateIds.has(candidate.candidateId) ||
          candidate.sourceBindingId.trim().length === 0 ||
          candidate.sourceItemId.trim().length === 0 ||
          candidate.sourceRevisionKey.trim().length === 0 ||
          candidate.providerKey.trim().length === 0 ||
          !validTimestamp(candidate.publishedAt) ||
          !validTimestamp(candidate.observedAt) ||
          !sha256(candidate.sourceSnapshotSha256) ||
          !sha256(candidate.inputSha256) ||
          candidate.assessmentId.trim().length === 0) {
        throw new Error("Workspace reader summary candidate is invalid");
      }
      candidateIds.add(candidate.candidateId);
    }
    return;
  }
  if (manifest.schemaVersion !== READER_SUMMARY_PREPARATION_MANIFEST_VERSION ||
      !Number.isFinite(Date.parse(manifest.cutoffAt)) ||
      manifest.candidates.length > 20_000 ||
      !sha256(manifest.interestSha256) || !sha256(manifest.rubricSha256)) {
    throw new Error("Reader summary preparation manifest is invalid");
  }
  const bytes = Buffer.byteLength(JSON.stringify(manifest), "utf8");
  if (bytes > 16 * 1024 * 1024) {
    throw new Error("Reader summary preparation manifest exceeds 16 MiB");
  }
  const ids = new Set<string>();
  for (const candidate of manifest.candidates) {
    if (ids.has(candidate.candidateId) || candidate.sourceBindingId.trim().length === 0 ||
        candidate.providerKey.trim().length === 0 || !validTimestamp(candidate.publishedAt) ||
        !validTimestamp(candidate.observedAt) || !sha256(candidate.sourceSnapshotSha256) ||
        !sha256(candidate.inputSha256) || candidate.assessmentId.trim().length === 0) {
      throw new Error("Reader summary preparation manifest candidate is invalid");
    }
    ids.add(candidate.candidateId);
  }
};

const sha256 = (value: string): boolean => /^[0-9a-f]{64}$/u.test(value);
const validTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}(?:\+00|Z)$/u.test(value) &&
  Number.isFinite(Date.parse(value));

export const canonicalReaderSummaryPreparationTimestamp = (value: string | Date): string => {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Invalid preparation timestamp");
    return value.toISOString().replace(/\.(\d{3})Z$/u, ".$1000Z");
  }
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00(?::00)?)$/u
    .exec(value);
  if (match === null || !Number.isFinite(Date.parse(
    `${match[1]}T${match[2]}.${(match[3] ?? "").padEnd(3, "0").slice(0, 3)}Z`,
  ))) throw new Error("Invalid preparation timestamp");
  return `${match[1]}T${match[2]}.${(match[3] ?? "").padEnd(6, "0")}Z`;
};

export const compareReaderSummaryPreparationTimestamps = (
  left: string,
  right: string,
): number => {
  const micros = (value: string): bigint => {
    const canonical = canonicalReaderSummaryPreparationTimestamp(value);
    return BigInt(Date.parse(`${canonical.slice(0, 23)}Z`)) * 1_000n +
      BigInt(canonical.slice(23, 26));
  };
  const leftMicros = micros(left);
  const rightMicros = micros(right);
  return leftMicros === rightMicros ? 0 : leftMicros < rightMicros ? -1 : 1;
};
