import { createHash } from "node:crypto";
import {
  installSecureRecoveryEvidenceFile,
  readSecureRecoveryEvidenceFile,
  resolveRecoveryEvidencePath,
} from "./reader-summary-recovery-evidence-secure-file";

export const historicalDegradedRecoveryAuthorityFormat =
  "reader-summary-historical-degraded-recovery-authority-v2";
export const historicalDegradedRecoveryTenantId =
  "00000000-0000-7000-8000-000000006101";
export const historicalDegradedRecoveryWorkspaceId =
  "00000000-0000-7000-8000-000000006102";
export const historicalDegradedRecoveryReason =
  "The requested UTC day has no canonical GitHub projection; publish the already collected non-GitHub summary with limited source disclosure.";
export const historicalDegradedRecoveryXBackfillReceiptFormat =
  "reader-summary-historical-x-backfill-receipt-v1";

const allowedDays = Object.freeze({
  "2026-08-18": Object.freeze({
    count: 277,
    xBackfillRowCount: 72,
    xBaseRowCount: 0,
    providerCounts: Object.freeze({
      "hacker-news": 100,
      reddit: 79,
      rss: 26,
      "x-twitter": 72,
    }),
  }),
  "2026-08-19": Object.freeze({
    count: 303,
    xBackfillRowCount: 77,
    xBaseRowCount: 10,
    providerCounts: Object.freeze({
      "hacker-news": 99,
      reddit: 90,
      rss: 27,
      "x-twitter": 87,
    }),
  }),
} as const);
const githubOnlyCodes = new Set([
  "github_projection_missing",
  "github_projection_mixed",
  "github_projection_gapped",
]);

export type HistoricalDegradedRecoveryDate = keyof typeof allowedDays;

export type HistoricalDegradedRecoveryEvidenceArtifact =
  | "authority"
  | "collection-artifact"
  | "collection-quality-report"
  | "dataset-manifest"
  | "x-backfill-receipt";

const evidenceFileNames: Readonly<
  Record<HistoricalDegradedRecoveryEvidenceArtifact, string>
> = Object.freeze({
  authority: "authority.json",
  "collection-artifact": "collection-artifact.json",
  "collection-quality-report": "collection-quality-report.json",
  "dataset-manifest": "dataset-manifest.json",
  "x-backfill-receipt": "x-backfill-receipt.json",
});

export const historicalDegradedRecoveryExpectedDataset = (value: string) =>
  allowedDays[exactAllowedDate(value)];

export type HistoricalDegradedRecoverySourceSnapshot = Readonly<{
  jobId: string;
  artifactId: string;
  jobStatus: "REJECTED";
  artifactStatus: "REJECTED";
  qualityFlags: readonly string[];
  publicationDecision: Readonly<{
    status: "rejected";
    reasonCodes: readonly string[];
    findings: readonly Readonly<{ code: string; reason: string }>[];
  }>;
  summaryText: string;
  sourceRecordSha256: string;
}>;

export type HistoricalDegradedRecoveryDatasetSnapshot = Readonly<{
  liveCount: number;
  uniqueCount: number;
  aggregateSha256: string;
  providerCounts: Readonly<Record<string, number>>;
}>;

export type HistoricalDegradedRecoveryGitHubZero = Readonly<{
  readerStatus: "ok";
  observedThrough: string;
  pageCount: number;
  scannedItemCount: number;
  touchingRequestedDayCount: 0;
  eligibleBindingIds: readonly string[];
  firstLaterObservation?: string;
  projectionSha256: string;
}>;

export type HistoricalDegradedRecoveryAuthority = Readonly<{
  artifactFormat: typeof historicalDegradedRecoveryAuthorityFormat;
  tenantId: typeof historicalDegradedRecoveryTenantId;
  workspaceId: typeof historicalDegradedRecoveryWorkspaceId;
  requestedUtcDate: HistoricalDegradedRecoveryDate;
  period: Readonly<{
    cadence: "daily";
    startedAt: string;
    endedAt: string;
    timezone: "UTC";
    scopeType: "workspace";
    scopeKey: "workspace";
  }>;
  expectedCounts: Readonly<{ live: number; unique: number }>;
  source: Omit<HistoricalDegradedRecoverySourceSnapshot, "summaryText"> &
    Readonly<{ rejectionSnapshotSha256: string }>;
  inputs: Readonly<{
    collectionArtifactSha256: string;
    collectionQualityReportSha256: string;
    datasetManifestSha256: string;
    xBackfillReceipt: Readonly<{
      artifactFormat: typeof historicalDegradedRecoveryXBackfillReceiptFormat;
      rowCount: number;
      sha256: string;
    }>;
  }>;
  dataset: HistoricalDegradedRecoveryDatasetSnapshot;
  githubZero: HistoricalDegradedRecoveryGitHubZero;
  servingAuthority: Readonly<Record<string, unknown>>;
  servingAuthoritySha256: string;
  safeReason: typeof historicalDegradedRecoveryReason;
  authorizedAt: string;
  attempt: Readonly<{
    kind: "historical-degraded-recovery";
    identity: string;
  }>;
}>;

export type HistoricalDegradedRecoveryPreparation = Readonly<{
  requestedUtcDate: string;
  sourceCandidates: readonly HistoricalDegradedRecoverySourceSnapshot[];
  existingPublicationCount: number;
  activeSlotCount: number;
  collectionArtifactBytes: Buffer;
  collectionQualityReportBytes: Buffer;
  datasetManifestBytes: Buffer;
  xBackfillReceiptBytes: Buffer;
  dataset: HistoricalDegradedRecoveryDatasetSnapshot;
  githubZero: HistoricalDegradedRecoveryGitHubZero;
  servingAuthority: Readonly<Record<string, unknown>>;
  authorizedAt: Date;
}>;

export const prepareHistoricalDegradedRecoveryAuthority = (
  input: HistoricalDegradedRecoveryPreparation,
): Readonly<{ authority: HistoricalDegradedRecoveryAuthority; bytes: Buffer; sha256: string }> => {
  const requestedUtcDate = exactAllowedDate(input.requestedUtcDate);
  const expected = allowedDays[requestedUtcDate];
  const xBackfillReceipt = verifyHistoricalDegradedRecoveryXBackfillReceiptBytes({
    requestedUtcDate,
    bytes: input.xBackfillReceiptBytes,
  });
  if (input.sourceCandidates.length !== 1) {
    throw new Error("Historical degraded recovery requires exactly one linked rejected source job/artifact");
  }
  const source = input.sourceCandidates[0]!;
  assertSource(source);
  if (input.existingPublicationCount !== 0 || input.activeSlotCount !== 0) {
    throw new Error("Historical degraded recovery requires an empty public slot");
  }
  if (
    input.dataset.liveCount !== expected.count ||
    input.dataset.uniqueCount !== expected.count ||
    stableJson(input.dataset.providerCounts) !==
      stableJson(expected.providerCounts) ||
    !sha256Pattern.test(input.dataset.aggregateSha256)
  ) {
    throw new Error("Historical degraded recovery live dataset does not match the bounded expected count");
  }
  assertGitHubZero(input.githubZero, requestedUtcDate);
  const authorizedAt = exactDate(input.authorizedAt, "authorizedAt");
  const startedAt = `${requestedUtcDate}T00:00:00.000Z`;
  const endedAt = new Date(Date.parse(startedAt) + 86_400_000).toISOString();
  const servingAuthority = canonicalObject(input.servingAuthority);
  const rejectionSnapshot = canonicalObject({
    jobId: source.jobId,
    artifactId: source.artifactId,
    jobStatus: source.jobStatus,
    artifactStatus: source.artifactStatus,
    qualityFlags: source.qualityFlags,
    publicationDecision: source.publicationDecision,
    sourceRecordSha256: source.sourceRecordSha256,
  });
  const core = {
    artifactFormat: historicalDegradedRecoveryAuthorityFormat,
    tenantId: historicalDegradedRecoveryTenantId,
    workspaceId: historicalDegradedRecoveryWorkspaceId,
    requestedUtcDate,
    period: {
      cadence: "daily" as const,
      startedAt,
      endedAt,
      timezone: "UTC" as const,
      scopeType: "workspace" as const,
      scopeKey: "workspace" as const,
    },
    expectedCounts: { live: expected.count, unique: expected.count },
    source: {
      ...rejectionSnapshot,
      rejectionSnapshotSha256: sha256(stableJson(rejectionSnapshot)),
    },
    inputs: {
      collectionArtifactSha256: sha256(input.collectionArtifactBytes),
      collectionQualityReportSha256: sha256(input.collectionQualityReportBytes),
      datasetManifestSha256: sha256(input.datasetManifestBytes),
      xBackfillReceipt: {
        artifactFormat: xBackfillReceipt.artifactFormat,
        rowCount: xBackfillReceipt.insertedRowCount,
        sha256: sha256(input.xBackfillReceiptBytes),
      },
    },
    dataset: canonicalObject(input.dataset),
    githubZero: canonicalObject(input.githubZero),
    servingAuthority,
    servingAuthoritySha256: sha256(stableJson(servingAuthority)),
    safeReason: historicalDegradedRecoveryReason,
    authorizedAt,
  };
  const attemptIdentity = sha256(stableJson({
    kind: "historical-degraded-recovery",
    authority: core,
  }));
  const authority = canonicalObject({
    ...core,
    attempt: { kind: "historical-degraded-recovery", identity: attemptIdentity },
  }) as HistoricalDegradedRecoveryAuthority;
  const bytes = Buffer.from(`${stableJson(authority)}\n`, "utf8");
  return Object.freeze({ authority, bytes, sha256: sha256(bytes) });
};

export const installHistoricalDegradedRecoveryAuthority = (params: {
  readonly requestedUtcDate: string;
  readonly bytes: Buffer;
}): "installed" | "replayed" =>
  installHistoricalDegradedRecoveryEvidence({
    requestedUtcDate: params.requestedUtcDate,
    artifact: "authority",
    bytes: params.bytes,
  });

export const installHistoricalDegradedRecoveryEvidence = (params: {
  readonly requestedUtcDate: string;
  readonly artifact: HistoricalDegradedRecoveryEvidenceArtifact;
  readonly bytes: Buffer;
}): "installed" | "replayed" =>
  installSecureRecoveryEvidenceFile({
    relativePath: historicalDegradedRecoveryEvidenceRelativePath(
      params.requestedUtcDate,
      params.artifact,
    ),
    label: `Historical degraded recovery ${params.artifact}`,
    bytes: params.bytes,
  });

export const readSecureHistoricalDegradedRecoveryFile = (
  requestedUtcDate: string,
  artifact: HistoricalDegradedRecoveryEvidenceArtifact,
): Buffer =>
  readSecureRecoveryEvidenceFile({
    relativePath: historicalDegradedRecoveryEvidenceRelativePath(
      requestedUtcDate,
      artifact,
    ),
    label: `Historical degraded recovery ${artifact}`,
  });

export const historicalDegradedRecoveryEvidenceRelativePath = (
  requestedUtcDate: string,
  artifact: HistoricalDegradedRecoveryEvidenceArtifact,
): string =>
  `reader-summary/historical-degraded-recovery/${exactAllowedDate(requestedUtcDate)}/${evidenceFileNames[artifact]}`;

export const historicalDegradedRecoveryEvidencePath = (
  requestedUtcDate: string,
  artifact: HistoricalDegradedRecoveryEvidenceArtifact,
): string => resolveRecoveryEvidencePath(
  historicalDegradedRecoveryEvidenceRelativePath(requestedUtcDate, artifact),
);

export const assertHistoricalDegradedRecoveryXBackfillReceipt = (params: {
  readonly authority: HistoricalDegradedRecoveryAuthority;
  readonly bytes: Buffer;
}): void => {
  const expected = allowedDays[params.authority.requestedUtcDate];
  const receipt = verifyHistoricalDegradedRecoveryXBackfillReceiptBytes({
    requestedUtcDate: params.authority.requestedUtcDate,
    bytes: params.bytes,
  });
  if (
    params.authority.inputs.xBackfillReceipt.artifactFormat !==
      receipt.artifactFormat ||
    params.authority.inputs.xBackfillReceipt.rowCount !==
      expected.xBackfillRowCount ||
    params.authority.inputs.xBackfillReceipt.sha256 !== sha256(params.bytes)
  ) {
    throw new Error(
      "Historical degraded recovery X-backfill receipt binding is invalid",
    );
  }
};

export const verifyHistoricalDegradedRecoveryXBackfillReceiptBytes = (params: {
  readonly requestedUtcDate: string;
  readonly bytes: Buffer;
}): Readonly<{
  artifactFormat: typeof historicalDegradedRecoveryXBackfillReceiptFormat;
  insertedRowCount: number;
}> => {
  const requestedUtcDate = exactAllowedDate(params.requestedUtcDate);
  const expected = allowedDays[requestedUtcDate];
  let value: unknown;
  try {
    value = JSON.parse(params.bytes.toString("utf8"));
  } catch {
    throw new Error("Historical degraded recovery X-backfill receipt is not JSON");
  }
  const receipt = canonicalObject(value);
  const rows = receipt.rows;
  if (
    receipt.artifactFormat !== historicalDegradedRecoveryXBackfillReceiptFormat ||
    receipt.tenantId !== historicalDegradedRecoveryTenantId ||
    receipt.workspaceId !== historicalDegradedRecoveryWorkspaceId ||
    receipt.requestedUtcDate !== requestedUtcDate ||
    receipt.providerKey !== "x-twitter" ||
    receipt.baseRowCount !== expected.xBaseRowCount ||
    receipt.insertedRowCount !== expected.xBackfillRowCount ||
    receipt.finalRowCount !== expected.providerCounts["x-twitter"] ||
    !Array.isArray(rows) ||
    rows.length !== expected.xBackfillRowCount ||
    rows.some((row) =>
      row === null || typeof row !== "object" || Array.isArray(row)) ||
    new Set(rows.map((row) => stableJson(row))).size !== rows.length
  ) {
    throw new Error(
      "Historical degraded recovery X-backfill receipt row contract is invalid",
    );
  }
  return Object.freeze({
    artifactFormat: historicalDegradedRecoveryXBackfillReceiptFormat,
    insertedRowCount: expected.xBackfillRowCount,
  });
};

export const verifyHistoricalDegradedRecoveryAuthorityBytes = (params: {
  readonly bytes: Buffer;
  readonly expectedSha256?: string;
}): HistoricalDegradedRecoveryAuthority => {
  if (params.expectedSha256 !== undefined && sha256(params.bytes) !== params.expectedSha256) {
    throw new Error("Historical degraded recovery authority SHA-256 mismatch");
  }
  let value: unknown;
  try { value = JSON.parse(params.bytes.toString("utf8")); } catch {
    throw new Error("Historical degraded recovery authority is not JSON");
  }
  const record = canonicalObject(value) as Partial<HistoricalDegradedRecoveryAuthority>;
  const date = exactAllowedDate(String(record.requestedUtcDate ?? ""));
  if (
    record.artifactFormat !== historicalDegradedRecoveryAuthorityFormat ||
    record.tenantId !== historicalDegradedRecoveryTenantId ||
    record.workspaceId !== historicalDegradedRecoveryWorkspaceId ||
    record.safeReason !== historicalDegradedRecoveryReason ||
    record.period?.startedAt !== `${date}T00:00:00.000Z` ||
    record.period?.endedAt !== new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString() ||
    record.expectedCounts?.live !== allowedDays[date].count ||
    record.expectedCounts.unique !== allowedDays[date].count ||
    record.attempt?.kind !== "historical-degraded-recovery" ||
    !sha256Pattern.test(record.attempt.identity)
  ) {
    throw new Error("Historical degraded recovery authority contract is invalid");
  }
  if (
    record.dataset === undefined ||
    record.githubZero === undefined ||
    record.dataset.liveCount !== allowedDays[date].count ||
    record.dataset.uniqueCount !== allowedDays[date].count ||
    stableJson(record.dataset.providerCounts) !==
      stableJson(allowedDays[date].providerCounts)
  ) {
    throw new Error("Historical degraded recovery authority dataset is invalid");
  }
  if (
    record.inputs === undefined ||
    record.inputs.xBackfillReceipt?.artifactFormat !==
      historicalDegradedRecoveryXBackfillReceiptFormat ||
    record.inputs.xBackfillReceipt?.rowCount !==
      allowedDays[date].xBackfillRowCount ||
    !sha256Pattern.test(record.inputs.xBackfillReceipt.sha256)
  ) {
    throw new Error(
      "Historical degraded recovery X-backfill receipt binding is invalid",
    );
  }
  assertGitHubZero(record.githubZero, date);
  const core = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== "attempt"),
  );
  const expectedIdentity = sha256(stableJson({
    kind: "historical-degraded-recovery",
    authority: core,
  }));
  if (record.attempt.identity !== expectedIdentity) {
    throw new Error("Historical degraded recovery authority identity is invalid");
  }
  const canonicalBytes = Buffer.from(`${stableJson(record)}\n`, "utf8");
  if (!canonicalBytes.equals(params.bytes)) {
    throw new Error("Historical degraded recovery authority bytes are not canonical");
  }
  return record as HistoricalDegradedRecoveryAuthority;
};

const assertSource = (source: HistoricalDegradedRecoverySourceSnapshot): void => {
  const codes = [
    ...source.publicationDecision.reasonCodes,
    ...source.publicationDecision.findings.map((finding) => finding.code),
  ];
  if (
    source.jobStatus !== "REJECTED" ||
    source.artifactStatus !== "REJECTED" ||
    source.summaryText.trim().length === 0 ||
    source.qualityFlags.length !== 0 ||
    source.publicationDecision.status !== "rejected" ||
    codes.length === 0 ||
    codes.some((code) => !githubOnlyCodes.has(code)) ||
    !sha256Pattern.test(source.sourceRecordSha256)
  ) {
    throw new Error("Historical degraded recovery source rejection is not GitHub-projection-only");
  }
};

const assertGitHubZero = (
  proof: HistoricalDegradedRecoveryGitHubZero,
  requestedUtcDate: HistoricalDegradedRecoveryDate,
): void => {
  if (
    proof.readerStatus !== "ok" ||
    proof.touchingRequestedDayCount !== 0 ||
    proof.scannedItemCount < 0 ||
    !Number.isSafeInteger(proof.scannedItemCount) ||
    proof.pageCount < 1 ||
    !Number.isSafeInteger(proof.pageCount) ||
    !sha256Pattern.test(proof.projectionSha256) ||
    !validIsoDate(proof.observedThrough) ||
    Date.parse(proof.observedThrough) <
      Date.parse(`${requestedUtcDate}T24:00:00.000Z`) ||
    (proof.firstLaterObservation !== undefined &&
      (!validIsoDate(proof.firstLaterObservation) ||
        Date.parse(proof.observedThrough) <
          Date.parse(proof.firstLaterObservation) ||
        Date.parse(proof.firstLaterObservation) <
          Date.parse(`${requestedUtcDate}T24:00:00.000Z`)))
  ) {
    throw new Error("Historical degraded recovery requires the canonical requested-day GitHub zero proof");
  }
};

const validIsoDate = (value: string): boolean => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

const exactAllowedDate = (value: string): HistoricalDegradedRecoveryDate => {
  if (!(value in allowedDays)) throw new Error("Historical degraded recovery date is not allowlisted");
  return value as HistoricalDegradedRecoveryDate;
};

const exactDate = (value: Date, label: string): string => {
  if (!Number.isFinite(value.getTime())) throw new Error(`${label} is invalid`);
  return value.toISOString();
};

const sha256Pattern = /^[0-9a-f]{64}$/u;
export const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

export const stableJson = (value: unknown): string => JSON.stringify(sortJson(value));

type CanonicalJson =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

const canonicalObject = (
  value: unknown,
): Readonly<Record<string, CanonicalJson>> => {
  const normalized = sortJson(value);
  if (normalized === null || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new Error("Historical degraded recovery canonical value must be an object");
  }
  return normalized as Readonly<Record<string, CanonicalJson>>;
};

const sortJson = (value: unknown): CanonicalJson => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new Error("Historical degraded recovery JSON contains an invalid date");
    }
    return value.toISOString();
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Historical degraded recovery JSON contains a non-finite number");
    return value;
  }
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]));
  }
  throw new Error("Historical degraded recovery JSON contains an unsupported value");
};
