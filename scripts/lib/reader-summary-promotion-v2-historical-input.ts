import { createHash } from "node:crypto";

import type { ReaderSummaryDayDatasetManifest } from
  "./reader-summary-day-dataset-manifest";
import {
  readerSummaryPromotionV2HistoricalPolicyVersion,
} from "./reader-summary-promotion-v2-historical-classification";

export type HistoricalPromotionSourceAuthority = Readonly<{
  kind: "active-database-publication";
  publicationId: string;
  artifactId: string;
  reportSha256: string;
  proofSha256: string;
}>;

export type HistoricalPromotionSupportingEvidence =
  | Readonly<{
      kind: "active-database-publication";
    }>
  | Readonly<{
      kind: "preserved-production-day-report";
      sourceReportSha256: string;
      collectionArtifactSha256: string;
      collectionQualityReportSha256: string;
    }>;

export type HistoricalPromotionCanonicalInputEnvelope = Readonly<{
  schemaVersion: 1;
  format: "reader-summary-promotion-v2-canonical-input-v1";
  date: string;
  policyVersion: typeof readerSummaryPromotionV2HistoricalPolicyVersion;
  sourcePublication: HistoricalPromotionSourceAuthority;
  datasetManifest: Readonly<{
    format: "reader-summary-day-dataset-manifest-v1";
    aggregateSha256: string;
    feedRowsSha256: string;
    githubEligibilitySha256: string;
    feedRowCount: number;
    githubEligibilityRowCount: number;
    providerCounts: Readonly<Record<string, number>>;
    timestampPolicy: "published_at" | "observed_at";
  }>;
  supportingEvidence: HistoricalPromotionSupportingEvidence;
  githubPolicy:
    | Readonly<{ mode: "verified_collected_rows" }>
    | Readonly<{
        mode: "historical_unavailable";
        reason: string;
      }>;
}>;

export const buildHistoricalPromotionCanonicalInput = (input: {
  readonly date: string;
  readonly sourcePublication: HistoricalPromotionSourceAuthority;
  readonly datasetManifest: ReaderSummaryDayDatasetManifest;
  readonly datasetManifestSha256: string;
  readonly supportingEvidence: HistoricalPromotionSupportingEvidence;
  readonly allowHistoricalGitHubOmission: boolean;
  readonly historicalGitHubOmissionReason?: string;
}): Readonly<{
  envelope: HistoricalPromotionCanonicalInputEnvelope;
  authoritativeInputDigest: string;
}> => {
  assertDateMatchesManifest(input.date, input.datasetManifest);
  requiredSha256(input.datasetManifestSha256);
  const githubPolicy = githubPolicyFor(input);
  const envelope: HistoricalPromotionCanonicalInputEnvelope = {
    schemaVersion: 1,
    format: "reader-summary-promotion-v2-canonical-input-v1",
    date: input.date,
    policyVersion: readerSummaryPromotionV2HistoricalPolicyVersion,
    sourcePublication: {
      kind: "active-database-publication",
      publicationId: requiredUuid(input.sourcePublication.publicationId),
      artifactId: requiredUuid(input.sourcePublication.artifactId),
      reportSha256: requiredSha256(input.sourcePublication.reportSha256),
      proofSha256: requiredSha256(input.sourcePublication.proofSha256),
    },
    datasetManifest: {
      format: input.datasetManifest.format,
      aggregateSha256: requiredSha256(
        input.datasetManifest.dataset.aggregateSha256,
      ),
      feedRowsSha256: requiredSha256(
        input.datasetManifest.dataset.feedRowsSha256,
      ),
      githubEligibilitySha256: requiredSha256(
        input.datasetManifest.dataset.githubEligibilitySha256,
      ),
      feedRowCount: exactCount(input.datasetManifest.dataset.feedRowCount),
      githubEligibilityRowCount: exactCount(
        input.datasetManifest.dataset.githubEligibilityRowCount,
      ),
      providerCounts: sortedCounts(
        input.datasetManifest.dataset.providerCounts,
      ),
      timestampPolicy: input.datasetManifest.policy.timestampPolicy,
    },
    supportingEvidence: supportingEvidence(input.supportingEvidence),
    githubPolicy,
  };
  return Object.freeze({
    envelope: Object.freeze(envelope),
    authoritativeInputDigest: historicalPromotionCanonicalInputDigest(envelope),
  });
};

export const historicalPromotionCanonicalInputDigest = (
  envelope: HistoricalPromotionCanonicalInputEnvelope,
): string => sha256(JSON.stringify(envelope));

const supportingEvidence = (
  value: HistoricalPromotionSupportingEvidence,
): HistoricalPromotionSupportingEvidence => value.kind ===
  "active-database-publication"
  ? { kind: value.kind }
  : {
      kind: value.kind,
      sourceReportSha256: requiredSha256(value.sourceReportSha256),
      collectionArtifactSha256: requiredSha256(
        value.collectionArtifactSha256,
      ),
      collectionQualityReportSha256: requiredSha256(
        value.collectionQualityReportSha256,
      ),
    };

const githubPolicyFor = (input: {
  readonly allowHistoricalGitHubOmission: boolean;
  readonly historicalGitHubOmissionReason?: string;
}): HistoricalPromotionCanonicalInputEnvelope["githubPolicy"] => {
  const reason = input.historicalGitHubOmissionReason?.trim();
  if (!input.allowHistoricalGitHubOmission) {
    if (reason !== undefined) {
      throw new Error(
        "Historical promotion GitHub reason requires omission mode",
      );
    }
    return { mode: "verified_collected_rows" };
  }
  if (reason === undefined || reason.length < 20 || reason.length > 500 ||
      /[\r\n]/u.test(reason)) {
    throw new Error("Historical promotion GitHub omission reason is invalid");
  }
  return { mode: "historical_unavailable", reason };
};

const assertDateMatchesManifest = (
  date: string,
  manifest: ReaderSummaryDayDatasetManifest,
): void => {
  const startedAt = `${date}T00:00:00.000Z`;
  const end = new Date(startedAt);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      Number.isNaN(end.getTime()) ||
      end.toISOString().slice(0, 10) !== date) {
    throw new Error("Historical promotion canonical input date is invalid");
  }
  end.setUTCDate(end.getUTCDate() + 1);
  if (manifest.period.startedAt !== startedAt ||
      manifest.period.endedAt !== end.toISOString() ||
      manifest.period.timezone !== "UTC") {
    throw new Error(
      "Historical promotion dataset manifest date does not match input",
    );
  }
};

const sortedCounts = (
  counts: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> => Object.fromEntries(
  Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([provider, count]) => [provider, exactCount(count)]),
);

const exactCount = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Historical promotion canonical input count is invalid");
  }
  return value;
};

const requiredUuid = (value: string): string => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(value)) {
    throw new Error("Historical promotion source publication UUID is invalid");
  }
  return value.toLocaleLowerCase("en-US");
};

const requiredSha256 = (value: string): string => {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Historical promotion canonical input SHA-256 is invalid");
  }
  return value;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
