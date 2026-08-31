import { createHash } from "node:crypto";

import type { PrismaSummaryClient } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";

import type { ReaderSummaryDayDatasetGuard } from
  "./reader-summary-day-dataset-guard";
import type {
  ReaderSummaryProductionDayAttemptIdentityInput,
} from "./reader-summary-production-day-attempt-identity";
import {
  resolveProductionDayPromotionRebuild,
  type ProductionDayPromotionRebuild,
} from
  "./reader-summary-production-day-promotion-rebuild";
import { assertHistoricalPromotionInputCurrentBeforeMutation } from
  "./reader-summary-promotion-v2-input-guard";

type HistoricalSourceAuthority = Extract<
  ReaderSummaryProductionDayAttemptIdentityInput["sourceProvenance"],
  { readonly kind: "historical-regeneration" }
>["sourceAuthority"];

export const resolveProductionDayPromotionInput = (input: {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly recoveryActive: boolean;
  readonly date: string;
  readonly timestampPolicy: "published_at" | "observed_at";
  readonly historicalGitHubOmissionReason?: string;
  readonly liveObservationCutoff?: string;
  readonly dailyReplay: Readonly<{
    authoritySha256: string;
    modelJobIdentity: string;
    receiptBytes: Uint8Array;
  }> | null;
}): Readonly<{
  promotionRebuild: ProductionDayPromotionRebuild;
  sourceProvenance: ReaderSummaryProductionDayAttemptIdentityInput[
    "sourceProvenance"
  ];
}> => {
  const promotionRebuild = resolveProductionDayPromotionRebuild({
    env: input.environment,
    recoveryActive: input.recoveryActive,
    date: input.date,
  });
  return {
    promotionRebuild,
    sourceProvenance: productionDaySourceProvenance({
      dailyReplay: input.dailyReplay === null
        ? null
        : {
            sourceAuthoritySha256: input.dailyReplay.authoritySha256,
            originalModelJobIdentity: input.dailyReplay.modelJobIdentity,
            originalReceiptSha256: sha256(input.dailyReplay.receiptBytes),
          },
      recoveryActive: input.recoveryActive,
      promotionRebuild,
      datasetManifestSha256: readEnvironment(
        input.environment,
        "DURABLE_READER_SUMMARY_DATASET_MANIFEST_SHA256",
      ),
      timestampPolicy: input.timestampPolicy,
      historicalGitHubOmissionReason: input.historicalGitHubOmissionReason,
      liveObservationCutoff: input.liveObservationCutoff,
      legacySourceReportSha256: readEnvironment(
        input.environment,
        "DURABLE_READER_SUMMARY_SOURCE_REPORT_SHA256",
      ),
      legacyCollectionArtifactSha256: readEnvironment(
        input.environment,
        "DURABLE_READER_SUMMARY_COLLECTION_ARTIFACT_SHA256",
      ),
      legacyCollectionQualityReportSha256: readEnvironment(
        input.environment,
        "DURABLE_READER_SUMMARY_COLLECTION_QUALITY_REPORT_SHA256",
      ),
    }),
  };
};

export const productionDayHistoricalSourceAuthority = (input: {
  readonly promotionRebuild: ProductionDayPromotionRebuild;
  readonly legacySourceReportSha256?: string;
  readonly legacyCollectionArtifactSha256?: string;
  readonly legacyCollectionQualityReportSha256?: string;
}): HistoricalSourceAuthority => input.promotionRebuild?.sourceAuthorityKind ===
  "active-database-publication"
  ? {
      kind: input.promotionRebuild.sourceAuthorityKind,
      publicationId: input.promotionRebuild.sourcePublicationId,
      artifactId: input.promotionRebuild.sourceArtifactId,
      reportSha256: input.promotionRebuild.sourcePublicationReportSha256,
      proofSha256: input.promotionRebuild.sourcePublicationProofSha256,
    }
  : {
      kind: "preserved-production-day-report",
      sourceReportSha256: requiredSha256(input.legacySourceReportSha256),
      collectionArtifactSha256: requiredSha256(
        input.legacyCollectionArtifactSha256,
      ),
      collectionQualityReportSha256: requiredSha256(
        input.legacyCollectionQualityReportSha256,
      ),
    };

export const productionDaySourceProvenance = (input: {
  readonly dailyReplay: Readonly<{
    sourceAuthoritySha256: string;
    originalModelJobIdentity: string;
    originalReceiptSha256: string;
  }> | null;
  readonly recoveryActive: boolean;
  readonly promotionRebuild: ProductionDayPromotionRebuild;
  readonly datasetManifestSha256?: string;
  readonly timestampPolicy: "published_at" | "observed_at";
  readonly historicalGitHubOmissionReason?: string;
  readonly liveObservationCutoff?: string;
  readonly legacySourceReportSha256?: string;
  readonly legacyCollectionArtifactSha256?: string;
  readonly legacyCollectionQualityReportSha256?: string;
}): ReaderSummaryProductionDayAttemptIdentityInput["sourceProvenance"] => {
  if (input.dailyReplay !== null) {
    return {
      kind: "persisted-daily-replay",
      ...input.dailyReplay,
    };
  }
  if (!input.recoveryActive) {
    return {
      kind: "live-production",
      ...(input.liveObservationCutoff === undefined
        ? {}
        : { observationCutoff: input.liveObservationCutoff }),
    };
  }
  return {
    kind: "historical-regeneration",
    sourceAuthority: productionDayHistoricalSourceAuthority(input),
    datasetManifestSha256: requiredSha256(input.datasetManifestSha256),
    timestampPolicy: input.timestampPolicy,
    ...(input.promotionRebuild === undefined
      ? {}
      : { promotionRebuild: input.promotionRebuild }),
    ...(input.historicalGitHubOmissionReason === undefined
      ? {}
      : {
          historicalGitHubOmissionReason:
            input.historicalGitHubOmissionReason,
        }),
  };
};

export const revalidateProductionDayPromotionInput = async (input: {
  readonly promotionRebuild: ProductionDayPromotionRebuild;
  readonly datasetGuard: ReaderSummaryDayDatasetGuard | null;
  readonly client: Pick<PrismaSummaryClient, "$queryRaw">;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly date: string;
  readonly failureMarkerPath: string | undefined;
}): Promise<void> => {
  if (input.promotionRebuild === undefined || input.datasetGuard === null) return;
  await assertHistoricalPromotionInputCurrentBeforeMutation({
    datasetGuard: input.datasetGuard,
    client: input.client,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    date: input.date,
    sourcePublication: {
      publicationId: input.promotionRebuild.sourcePublicationId,
      artifactId: input.promotionRebuild.sourceArtifactId,
      reportSha256: input.promotionRebuild.sourcePublicationReportSha256,
      proofSha256: input.promotionRebuild.sourcePublicationProofSha256,
    },
    ...(input.failureMarkerPath === undefined
      ? {}
      : { failureMarkerPath: input.failureMarkerPath }),
  });
};

const requiredSha256 = (value: string | undefined): string => {
  if (value === undefined || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Historical regeneration source SHA-256 is required");
  }
  return value;
};

const readEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined => {
  const value = environment[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
