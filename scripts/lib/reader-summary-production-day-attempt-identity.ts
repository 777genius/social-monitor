import { createHash } from "node:crypto";

import type { ReaderSummaryServingAuthority } from "./reader-summary-serving-authority";

export type ReaderSummaryProductionDayAttemptIdentityInput = Readonly<{
  tenantId: string;
  workspaceId: string;
  periodKey: string;
  servingAuthority: ReaderSummaryServingAuthority;
  sourceProvenance:
    | Readonly<{
        kind: "live-production";
        observationCutoff?: string;
      }>
    | Readonly<{
        kind: "historical-regeneration";
        sourceAuthority:
          | Readonly<{
              kind: "active-database-publication";
              publicationId: string;
              artifactId: string;
              reportSha256: string;
              proofSha256: string;
            }>
          | Readonly<{
              kind: "preserved-production-day-report";
              sourceReportSha256: string;
              collectionArtifactSha256: string;
              collectionQualityReportSha256: string;
            }>;
        datasetManifestSha256: string;
        timestampPolicy: "published_at" | "observed_at";
        historicalGitHubOmissionReason?: string;
        promotionRebuild?: Readonly<{
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
      }>
    | Readonly<{
        kind: "persisted-daily-replay";
        sourceAuthoritySha256: string;
        originalModelJobIdentity: string;
        originalReceiptSha256: string;
      }>;
}>;

// Bump this whenever persisted reader-summary selection or presentation
// semantics change. A production-day retry must not silently reuse an artifact
// produced under an older publication policy.
export const readerSummaryProductionDayArtifactPolicyVersion =
  "reader_summary.artifact_policy.v9";

export const readerSummaryProductionDayAttemptIdentity = (
  input: ReaderSummaryProductionDayAttemptIdentityInput,
): string =>
  sha256(JSON.stringify({
    schemaVersion: "reader_summary.production_day_attempt.v2",
    artifactPolicyVersion: readerSummaryProductionDayArtifactPolicyVersion,
    tenantId: requiredText(input.tenantId, "tenant"),
    workspaceId: requiredText(input.workspaceId, "workspace"),
    periodKey: requiredText(input.periodKey, "period"),
    servingAuthority: servingAuthority(input.servingAuthority),
    sourceProvenance:
      input.sourceProvenance.kind === "live-production"
        ? {
            kind: input.sourceProvenance.kind,
            ...(input.sourceProvenance.observationCutoff === undefined
              ? {}
              : {
                  observationCutoff: requiredIsoTimestamp(
                    input.sourceProvenance.observationCutoff,
                  ),
                }),
          }
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
              sourceAuthority: historicalSourceAuthority(
                input.sourceProvenance.sourceAuthority,
              ),
              datasetManifestSha256: requiredSha256(
                input.sourceProvenance.datasetManifestSha256,
              ),
              timestampPolicy: input.sourceProvenance.timestampPolicy,
              ...(input.sourceProvenance.promotionRebuild === undefined
                ? {}
                : {
                    promotionRebuild: {
                      rebuildIdentity: requiredSha256(
                        input.sourceProvenance.promotionRebuild.rebuildIdentity,
                      ),
                      authoritativeInputDigest: requiredSha256(
                        input.sourceProvenance.promotionRebuild
                          .authoritativeInputDigest,
                      ),
                      policyVersion:
                        input.sourceProvenance.promotionRebuild.policyVersion,
                      sourceAuthorityKind:
                        requiredHistoricalSourceAuthorityKind(
                          input.sourceProvenance.promotionRebuild
                            .sourceAuthorityKind,
                        ),
                      sourcePublicationId: requiredUuid(
                        input.sourceProvenance.promotionRebuild
                          .sourcePublicationId,
                      ),
                      sourceArtifactId: requiredUuid(
                        input.sourceProvenance.promotionRebuild.sourceArtifactId,
                      ),
                      sourcePublicationReportSha256: requiredSha256(
                        input.sourceProvenance.promotionRebuild
                          .sourcePublicationReportSha256,
                      ),
                      sourcePublicationProofSha256: requiredSha256(
                        input.sourceProvenance.promotionRebuild
                          .sourcePublicationProofSha256,
                      ),
                    },
                  }),
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

const historicalSourceAuthority = (
  value: Extract<
    ReaderSummaryProductionDayAttemptIdentityInput["sourceProvenance"],
    { readonly kind: "historical-regeneration" }
  >["sourceAuthority"],
) => value.kind === "active-database-publication"
  ? {
      kind: value.kind,
      publicationId: requiredUuid(value.publicationId),
      artifactId: requiredUuid(value.artifactId),
      reportSha256: requiredSha256(value.reportSha256),
      proofSha256: requiredSha256(value.proofSha256),
    }
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

const requiredHistoricalSourceAuthorityKind = (
  value: string,
): "active-database-publication" | "preserved-production-day-report" => {
  if (value !== "active-database-publication" &&
      value !== "preserved-production-day-report") {
    throw new Error(
      "Reader summary production-day source authority kind is invalid",
    );
  }
  return value;
};

const servingAuthority = (
  value: ReaderSummaryServingAuthority,
): ReaderSummaryServingAuthority => ({
  summaryGenerator: componentAuthority(value.summaryGenerator, "summary generator"),
  topicLabeler: componentAuthority(value.topicLabeler, "topic labeler"),
  topicRelationVerifier: componentAuthority(
    value.topicRelationVerifier,
    "topic relation verifier",
  ),
  storyRelationVerifier: componentAuthority(
    value.storyRelationVerifier,
    "story relation verifier",
  ),
  runtime: value.runtime === null
    ? null
    : {
        engine: requiredText(value.runtime.engine, "runtime engine"),
        packageVersion: requiredText(
          value.runtime.packageVersion,
          "runtime package version",
        ),
        launcherSha256: value.runtime.engine === "subscription-runtime-cli"
          ? requiredSha256(value.runtime.launcherSha256)
          : requiredText(value.runtime.launcherSha256, "launcher SHA-256"),
      },
});

const componentAuthority = <Mode extends string>(
  value: Readonly<{
    mode: Mode;
    provider: string;
    physicalModel: string;
    reasoningPolicy: string;
  }>,
  label: string,
) => ({
  mode: value.mode,
  provider: requiredText(value.provider, `${label} provider`),
  physicalModel: requiredText(value.physicalModel, `${label} physical model`),
  reasoningPolicy: requiredText(value.reasoningPolicy, `${label} reasoning policy`),
});

export const readerSummaryProductionDayIdempotencyKey = (
  attemptIdentity: string,
  promotionRebuildIdentity?: string,
): string =>
  // Historical Promotion V2 deliberately has one durable identity authority:
  // SHA-256(date + complete canonical input digest + policy version).
  promotionRebuildIdentity === undefined
    ? ["durable-reader-summary-daily", requiredSha256(attemptIdentity)].join(":")
    : [
        "durable-reader-summary-daily-promotion-v2",
        requiredSha256(promotionRebuildIdentity),
      ].join(":");

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

const requiredUuid = (value: string): string => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(value)) {
    throw new Error("Reader summary production-day UUID is invalid");
  }
  return value.toLocaleLowerCase("en-US");
};

const requiredIsoTimestamp = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(
      "Reader summary production-day observation cutoff is invalid",
    );
  }

  return value;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
