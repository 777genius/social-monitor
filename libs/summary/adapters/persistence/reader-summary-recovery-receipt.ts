import { createHash } from "node:crypto";

import type {
  ReaderSummaryRecoveryArtifactDigest,
  ReaderSummaryRecoveryProvenance,
} from "../../ports/reader-summary-recovery-finalization.port";
import {
  stablePublicationJson,
  type ReaderSummaryPublicationPayload,
} from "./reader-summary-publication-proof";

export type ReaderSummaryRecoveryReceiptPayload = Readonly<{
  schemaVersion: "reader_summary.recovery_receipt.v1";
  recoveryKind: "SUMMARY_ONLY";
  tenantId: string;
  workspaceId: string;
  publicationId: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  reportSha256: string;
  proofSha256: string;
  recordedAt: string;
  provenance: ReaderSummaryRecoveryProvenance;
  provenanceCanonical: string;
  provenanceSha256: string;
  exactReceipt: Readonly<Record<string, unknown>>;
  receiptCanonical: string;
  receiptSha256: string;
}>;

export type ReaderSummaryRecoveryFinalizationSqlRow = Readonly<{
  outcome: "published" | "replayed";
  publication_id: string;
  receipt_id: string;
  report_sha256: string;
  proof_sha256: string;
  provenance_sha256: string;
  receipt_sha256: string;
}>;

export const buildReaderSummaryRecoveryReceiptPayload = (params: {
  readonly publication: ReaderSummaryPublicationPayload;
  readonly provenance: ReaderSummaryRecoveryProvenance;
}): ReaderSummaryRecoveryReceiptPayload => {
  const provenance = normalizeProvenance(params.provenance);
  assertPublicationPeriod(provenance, params.publication);
  const provenanceCanonical = stablePublicationJson(provenance);
  const provenanceSha256 = sha256(provenanceCanonical);
  const exactReceipt = receiptObject({
    schemaVersion: "reader_summary.recovery_receipt.v1",
    recoveryKind: "SUMMARY_ONLY",
    tenantId: params.publication.tenantId,
    workspaceId: params.publication.workspaceId,
    publicationId: params.publication.readerSummaryArtifactId,
    readerSummaryJobId: params.publication.readerSummaryJobId,
    readerSummaryArtifactId: params.publication.readerSummaryArtifactId,
    reportSha256: params.publication.reportSha256,
    proofSha256: params.publication.proofSha256,
    recordedAt: params.publication.publishedAt,
    provenance,
    provenanceSha256,
  });
  const receiptCanonical = stablePublicationJson(exactReceipt);

  return {
    schemaVersion: "reader_summary.recovery_receipt.v1",
    recoveryKind: "SUMMARY_ONLY",
    tenantId: params.publication.tenantId,
    workspaceId: params.publication.workspaceId,
    publicationId: params.publication.readerSummaryArtifactId,
    readerSummaryJobId: params.publication.readerSummaryJobId,
    readerSummaryArtifactId: params.publication.readerSummaryArtifactId,
    reportSha256: params.publication.reportSha256,
    proofSha256: params.publication.proofSha256,
    recordedAt: params.publication.publishedAt,
    provenance,
    provenanceCanonical,
    provenanceSha256,
    exactReceipt,
    receiptCanonical,
    receiptSha256: sha256(receiptCanonical),
  };
};

const normalizeProvenance = (
  value: ReaderSummaryRecoveryProvenance,
): ReaderSummaryRecoveryProvenance => {
  if (
    value.schemaVersion !==
      "reader_summary.summary_only_recovery_provenance.v1" ||
    value.mode !== "summary-only"
  ) {
    throw new Error("Reader summary recovery provenance schema is invalid");
  }
  const normalized: ReaderSummaryRecoveryProvenance = {
    schemaVersion: value.schemaVersion,
    mode: value.mode,
    collectionUtcPeriod: {
      startedAt: exactText(
        value.collectionUtcPeriod?.startedAt,
        "collection period start",
      ),
      endedAt: exactText(
        value.collectionUtcPeriod?.endedAt,
        "collection period end",
      ),
      timezone: exactText(
        value.collectionUtcPeriod?.timezone,
        "collection period timezone",
      ),
    },
    priorCollectionProof: {
      sourceAttempt: artifactDigest(
        value.priorCollectionProof?.sourceAttempt,
        "source attempt",
      ),
      collectionArtifact: artifactDigest(
        value.priorCollectionProof?.collectionArtifact,
        "collection artifact",
      ),
      collectionQualityReport: artifactDigest(
        value.priorCollectionProof?.collectionQualityReport,
        "collection quality report",
      ),
    },
    regenerationInputManifest: {
      ...artifactDigest(
        value.regenerationInputManifest,
        "regeneration input manifest",
      ),
      datasetSha256: exactSha256(
        value.regenerationInputManifest?.datasetSha256,
        "regeneration dataset",
      ),
    },
  };
  if (stablePublicationJson(value) !== stablePublicationJson(normalized)) {
    throw new Error("Reader summary recovery provenance has unknown fields");
  }
  return normalized;
};

const artifactDigest = (
  value:
    | { readonly artifactFormat?: string; readonly sha256?: string }
    | undefined,
  label: string,
): ReaderSummaryRecoveryArtifactDigest => {
  const artifactFormat = exactText(value?.artifactFormat, `${label} format`);
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/u.test(artifactFormat)) {
    throw new Error(`Reader summary recovery ${label} format is invalid`);
  }
  return {
    artifactFormat,
    sha256: exactSha256(value?.sha256, label),
  };
};

const assertPublicationPeriod = (
  provenance: ReaderSummaryRecoveryProvenance,
  publication: ReaderSummaryPublicationPayload,
): void => {
  if (
    provenance.collectionUtcPeriod.startedAt !== publication.periodStartedAt ||
    provenance.collectionUtcPeriod.endedAt !== publication.periodEndedAt ||
    provenance.collectionUtcPeriod.timezone !== publication.periodTimezone
  ) {
    throw new Error(
      "Reader summary recovery provenance does not match the publication period",
    );
  }
};

const exactText = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    value.length > 256 ||
    /[\r\n]/u.test(value)
  ) {
    throw new Error(`Reader summary recovery ${label} is invalid`);
  }
  return value;
};

const exactSha256 = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`Reader summary recovery ${label} SHA-256 is invalid`);
  }
  return value;
};

const receiptObject = (
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  JSON.parse(stablePublicationJson(value)) as Readonly<Record<string, unknown>>;

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
