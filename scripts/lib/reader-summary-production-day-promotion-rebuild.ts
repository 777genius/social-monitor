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
  "DURABLE_READER_SUMMARY_AUTHORITATIVE_INPUT_SHA256",
  "DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_ID",
  "DURABLE_READER_SUMMARY_SOURCE_ARTIFACT_ID",
  "DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_PROOF_SHA256",
] as const;

export const resolveProductionDayPromotionRebuild = (input: {
  readonly env: NodeJS.ProcessEnv;
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
    authoritativeInputDigest,
    sourcePublicationId,
    sourceArtifactId,
    sourcePublicationProofSha256,
  ] = values as [string, string, string, string, string, string];
  if (policyVersion !== "reader_post_promotion.v2") {
    throw new Error("Promotion rebuild policy version must be V2");
  }
  const promotionRebuild = {
    rebuildIdentity,
    authoritativeInputDigest,
    policyVersion,
    sourcePublicationId,
    sourceArtifactId,
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
  DURABLE_READER_SUMMARY_AUTHORITATIVE_INPUT_SHA256:
    input.authoritativeInputDigest,
  DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_ID: input.sourcePublicationId,
  DURABLE_READER_SUMMARY_SOURCE_ARTIFACT_ID: input.sourceArtifactId,
  DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_PROOF_SHA256:
    input.sourcePublicationProofSha256,
});

const readEnv = (
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined => {
  const value = env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};
