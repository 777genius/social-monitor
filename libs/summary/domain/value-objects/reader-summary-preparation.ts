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

export type ReaderSummaryPreparationConfig = {
  readonly schemaVersion: typeof READER_SUMMARY_PREPARATION_CONFIG_VERSION;
  readonly interestId: string;
  readonly interestSha256: string;
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  readonly inputBuilderVersion: string;
  readonly modelConfigVersion: string;
};

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

export type ReaderSummaryPreparationManifest = {
  readonly schemaVersion: typeof READER_SUMMARY_PREPARATION_MANIFEST_VERSION;
  readonly cutoffAt: string;
  readonly interestSha256: string;
  readonly rubricSha256: string;
  readonly inputBuilderVersion: string;
  readonly modelConfigVersion: string;
  readonly candidates: readonly ReaderSummaryPreparationCandidate[];
};

export type ReaderSummaryPreparationFailureCode =
  | "assessment_coverage_timeout"
  | "assessment_unavailable"
  | "assessment_snapshot_unavailable"
  | "assessment_inventory_over_budget"
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
  if (manifest.schemaVersion !== READER_SUMMARY_PREPARATION_MANIFEST_VERSION ||
      !Number.isFinite(Date.parse(manifest.cutoffAt)) ||
      manifest.candidates.length > 1_000 ||
      !sha256(manifest.interestSha256) || !sha256(manifest.rubricSha256)) {
    throw new Error("Reader summary preparation manifest is invalid");
  }
  const bytes = Buffer.byteLength(JSON.stringify(manifest), "utf8");
  if (bytes > 4 * 1024 * 1024) {
    throw new Error("Reader summary preparation manifest exceeds 4 MiB");
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
