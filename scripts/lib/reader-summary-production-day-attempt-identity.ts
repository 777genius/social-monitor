import { createHash } from "node:crypto";

import type { ReaderSummaryServingAuthority } from "./reader-summary-serving-authority";

export type ReaderSummaryProductionDayAttemptIdentityInput = Readonly<{
  tenantId: string;
  workspaceId: string;
  periodKey: string;
  servingAuthority: ReaderSummaryServingAuthority;
  sourceProvenance:
    | Readonly<{ kind: "live-production" }>
    | Readonly<{
        kind: "historical-regeneration";
        sourceReportSha256: string;
        collectionArtifactSha256: string;
        collectionQualityReportSha256: string;
        datasetManifestSha256: string;
        timestampPolicy: "published_at" | "observed_at";
        historicalGitHubOmissionReason?: string;
      }>
    | Readonly<{
        kind: "persisted-daily-replay";
        sourceAuthoritySha256: string;
        originalModelJobIdentity: string;
        originalReceiptSha256: string;
      }>;
}>;

export const readerSummaryProductionDayAttemptIdentity = (
  input: ReaderSummaryProductionDayAttemptIdentityInput,
): string =>
  sha256(JSON.stringify({
    schemaVersion: "reader_summary.production_day_attempt.v2",
    tenantId: requiredText(input.tenantId, "tenant"),
    workspaceId: requiredText(input.workspaceId, "workspace"),
    periodKey: requiredText(input.periodKey, "period"),
    servingAuthority: servingAuthority(input.servingAuthority),
    sourceProvenance:
      input.sourceProvenance.kind === "live-production"
        ? { kind: input.sourceProvenance.kind }
        : input.sourceProvenance.kind === "persisted-daily-replay"
          ? {
              kind: input.sourceProvenance.kind,
              sourceAuthoritySha256: requiredSha256(
                input.sourceProvenance.sourceAuthoritySha256,
              ),
              originalModelJobIdentity: requiredSha256(
                input.sourceProvenance.originalModelJobIdentity,
              ),
              originalReceiptSha256: requiredSha256(
                input.sourceProvenance.originalReceiptSha256,
              ),
            }
          : {
              kind: input.sourceProvenance.kind,
              sourceReportSha256: requiredSha256(
                input.sourceProvenance.sourceReportSha256,
              ),
              collectionArtifactSha256: requiredSha256(
                input.sourceProvenance.collectionArtifactSha256,
              ),
              collectionQualityReportSha256: requiredSha256(
                input.sourceProvenance.collectionQualityReportSha256,
              ),
              datasetManifestSha256: requiredSha256(
                input.sourceProvenance.datasetManifestSha256,
              ),
              timestampPolicy: input.sourceProvenance.timestampPolicy,
              ...(input.sourceProvenance.historicalGitHubOmissionReason === undefined
                ? {}
                : {
                    historicalGitHubOmissionReason: requiredText(
                      input.sourceProvenance.historicalGitHubOmissionReason,
                      "historical GitHub omission reason",
                    ),
                  }),
            },
  }));

const servingAuthority = (
  value: ReaderSummaryServingAuthority,
): ReaderSummaryServingAuthority => ({
  summaryModelMode: value.summaryModelMode,
  topicLabelerMode: value.topicLabelerMode,
  provider: requiredText(value.provider, "provider"),
  physicalModel: requiredText(value.physicalModel, "physical model"),
  reasoningEffort: requiredText(value.reasoningEffort, "reasoning effort"),
  runtimeEngine: requiredText(value.runtimeEngine, "runtime engine"),
  runtimePackageVersion: requiredText(
    value.runtimePackageVersion,
    "runtime package version",
  ),
  launcherSha256: value.runtimeEngine === "subscription-runtime-cli"
    ? requiredSha256(value.launcherSha256)
    : requiredText(value.launcherSha256, "launcher SHA-256"),
});

export const readerSummaryProductionDayIdempotencyKey = (
  attemptIdentity: string,
): string =>
  `durable-reader-summary-daily:${requiredSha256(attemptIdentity)}`;

const requiredText = (value: string, label: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Reader summary production-day ${label} is required`);
  }
  return normalized;
};

const requiredSha256 = (value: string): string => {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Reader summary production-day SHA-256 is invalid");
  }
  return value;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
