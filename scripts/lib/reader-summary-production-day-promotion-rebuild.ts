import type {
  ReaderSummaryProductionDayAttemptIdentityInput,
} from "./reader-summary-production-day-attempt-identity";
import { historicalPromotionRebuildIdentity } from
  "./reader-summary-promotion-v2-historical-classification";

export type ProductionDayPromotionRebuild = Extract<
  ReaderSummaryProductionDayAttemptIdentityInput["sourceProvenance"],
  { readonly kind: "historical-regeneration" }
>["promotionRebuild"];

const authorityEnvNames = [
  "DURABLE_READER_SUMMARY_PROMOTION_REBUILD_IDENTITY",
  "DURABLE_READER_SUMMARY_PROMOTION_POLICY_VERSION",
  "DURABLE_READER_SUMMARY_PROMOTION_SOURCE_AUTHORITY_KIND",
  "DURABLE_READER_SUMMARY_AUTHORITATIVE_INPUT_SHA256",
  "DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_ID",
  "DURABLE_READER_SUMMARY_SOURCE_ARTIFACT_ID",
  "DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_REPORT_SHA256",
  "DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_PROOF_SHA256",
] as const;

export const resolveProductionDayPromotionRebuild = (input: {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly recoveryActive: boolean;
  readonly date: string;
}): ProductionDayPromotionRebuild => {
  const values = authorityEnvNames.map((name) => readEnv(input.env, name));
  if (values.every((value) => value === undefined)) return undefined;
  if (!input.recoveryActive || values.some((value) => value === undefined)) {
    throw new Error(
      "Promotion V2 rebuild identity requires complete historical recovery authority",
    );
  }
  const [
    rebuildIdentity,
    policyVersion,
    sourceAuthorityKind,
    authoritativeInputDigest,
    sourcePublicationId,
    sourceArtifactId,
    sourcePublicationReportSha256,
    sourcePublicationProofSha256,
  ] = values as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (policyVersion !== "reader_post_promotion.v2") {
    throw new Error("Promotion rebuild policy version must be V2");
  }
  if (sourceAuthorityKind !== "active-database-publication" &&
      sourceAuthorityKind !== "preserved-production-day-report") {
    throw new Error("Promotion rebuild source authority kind is invalid");
  }
  const promotionRebuild = {
    rebuildIdentity,
    authoritativeInputDigest,
    policyVersion,
    sourceAuthorityKind,
    sourcePublicationId,
    sourceArtifactId,
    sourcePublicationReportSha256,
    sourcePublicationProofSha256,
  } as const;
  if (historicalPromotionRebuildIdentity({
    date: input.date,
    authoritativeInputDigest,
    policyVersion,
  }) !== rebuildIdentity) {
    throw new Error("Promotion rebuild identity does not match its authority");
  }
  return promotionRebuild;
};

export const assertProductionDayPromotionRetrySafe = (input: {
  readonly created: boolean;
  readonly status: string;
}): void => {
  if (input.created ||
      ["requested", "completed", "no_signal"].includes(input.status)) {
    return;
  }
  throw new Error(
    "Promotion rebuild durable job requires reconciliation before retry",
  );
};

export const productionDayPromotionRebuildEnvironment = (
  input: NonNullable<ProductionDayPromotionRebuild>,
): Readonly<Record<string, string>> => ({
  DURABLE_READER_SUMMARY_PROMOTION_REBUILD_IDENTITY: input.rebuildIdentity,
  DURABLE_READER_SUMMARY_PROMOTION_POLICY_VERSION: input.policyVersion,
  DURABLE_READER_SUMMARY_PROMOTION_SOURCE_AUTHORITY_KIND:
    input.sourceAuthorityKind,
  DURABLE_READER_SUMMARY_AUTHORITATIVE_INPUT_SHA256:
    input.authoritativeInputDigest,
  DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_ID: input.sourcePublicationId,
  DURABLE_READER_SUMMARY_SOURCE_ARTIFACT_ID: input.sourceArtifactId,
  DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_REPORT_SHA256:
    input.sourcePublicationReportSha256,
  DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_PROOF_SHA256:
    input.sourcePublicationProofSha256,
});

const readEnv = (
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined => {
  const value = env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};
