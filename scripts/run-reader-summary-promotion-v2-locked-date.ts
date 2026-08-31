import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { defaultPostgresRuntimePoolConfig } from
  "@social-monitor/platform-persistence";
import { PrismaSummaryConnection } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";

import { loadDotenvIfPresent } from "./lib/env-file";
import {
  ReaderSummaryDayDatasetGuard,
  readReaderSummaryDayDatasetManifest,
} from "./lib/reader-summary-day-dataset-guard";
import { parseReaderSummaryDayDatasetManifest } from
  "./lib/reader-summary-day-dataset-manifest";
import { resolveProductionDayPromotionRebuild } from
  "./lib/reader-summary-production-day-promotion-rebuild";
import { readerSummaryProductionDayScope } from
  "./lib/reader-summary-production-day-scope";
import {
  assertHistoricalPromotionInputCurrentBeforeMutation,
  historicalPromotionRevalidationFailurePathEnv,
  historicalPromotionUnderLockDriftReason,
  historicalPromotionUnderLockDurableStateReason,
  historicalPromotionUnderLockUnavailableReason,
  writeHistoricalPromotionFailureMarker,
} from "./lib/reader-summary-promotion-v2-input-guard";
import { requiredHistoricalPromotionSystemDatabaseUrl } from
  "./lib/reader-summary-promotion-v2-system-database";
import {
  PostgresHistoricalPromotionAdapter,
} from "./lib/reader-summary-promotion-v2-historical-postgres";
import {
  classifyHistoricalPromotionAuthority,
  historicalPromotionRebuildIdentity,
} from "./lib/reader-summary-promotion-v2-historical-classification";
import { buildHistoricalPromotionCanonicalInput } from
  "./lib/reader-summary-promotion-v2-historical-input";
import {
  historicalPromotionGenerationAuthorityJsonEnv,
  historicalPromotionGenerationAuthoritySha256,
  historicalPromotionGenerationAuthoritySha256Env,
  parseHistoricalPromotionGenerationAuthority,
} from "./lib/reader-summary-promotion-v2-historical-generation-authority";

const datasetManifestPathEnv = "DURABLE_READER_SUMMARY_DATASET_MANIFEST_PATH";
const datasetManifestSha256Env =
  "DURABLE_READER_SUMMARY_DATASET_MANIFEST_SHA256";

if (require.main === module) {
  loadDotenvIfPresent(".env");
  void main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Historical promotion locked preflight failed",
    );
    process.exitCode = 1;
  });
}

export const runHistoricalPromotionLockedPreflight = async (input: {
  readonly revalidate: () => Promise<void>;
  readonly runProductionDay: () => number | null;
}): Promise<number | null> => {
  await input.revalidate();
  return input.runProductionDay();
};

export const historicalPromotionLockedChildCommand = (
  args: readonly string[],
): readonly string[] => args[0] === "--" ? args.slice(1) : args;

async function main(): Promise<void> {
  // ts-node consumes its `--` separator; direct Node execution retains it.
  const command = historicalPromotionLockedChildCommand(process.argv.slice(2));
  if (command.length === 0) {
    throw new Error("Locked historical promotion command is required");
  }
  const manifestPath = requiredEnv(datasetManifestPathEnv);
  const manifestBytes = readFileSync(manifestPath);
  const parsed = parseReaderSummaryDayDatasetManifest(manifestBytes);
  const date = parsed.period.startedAt.slice(0, 10);
  const promotion = resolveProductionDayPromotionRebuild({
    env: process.env,
    recoveryActive: true,
    date,
  });
  if (promotion === undefined) {
    throw new Error("Locked historical promotion authority is required");
  }
  const now = new Date();
  const { manifest, fileSha256 } = readReaderSummaryDayDatasetManifest({
    path: manifestPath,
    expectedFileSha256: requiredEnv(datasetManifestSha256Env),
    tenantId: readerSummaryProductionDayScope.tenantId,
    workspaceId: readerSummaryProductionDayScope.workspaceId,
    startedAt: new Date(parsed.period.startedAt),
    endedAt: new Date(parsed.period.endedAt),
    now,
    expectedTimestampPolicy: parsed.policy.timestampPolicy,
  });
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(
      requiredHistoricalPromotionSystemDatabaseUrl(process.env),
      "daily-runner",
    ),
  );
  const postgres = new PostgresHistoricalPromotionAdapter({
    databaseUrl: requiredHistoricalPromotionSystemDatabaseUrl(process.env),
    tenantId: readerSummaryProductionDayScope.tenantId,
    workspaceId: readerSummaryProductionDayScope.workspaceId,
    artifactOutput: "/tmp/reader-summary-locked-preflight-no-verification",
    api: { verify: async () => ({
      siteReaderRouteHttp200Verified: true,
      siteFacingContractVerified: "not-exposed",
    }) },
  });
  let status: number | null;
  try {
    const guard = new ReaderSummaryDayDatasetGuard(
      connection,
      manifest,
      fileSha256,
      () => new Date(),
    );
    status = await runHistoricalPromotionLockedPreflight({
      revalidate: async () => {
        const marker = requiredEnv(
          historicalPromotionRevalidationFailurePathEnv,
        );
        await assertHistoricalPromotionInputCurrentBeforeMutation({
          datasetGuard: guard,
          client: connection,
          tenantId: readerSummaryProductionDayScope.tenantId,
          workspaceId: readerSummaryProductionDayScope.workspaceId,
          date,
          sourcePublication: {
            publicationId: promotion.sourcePublicationId,
            artifactId: promotion.sourceArtifactId,
            reportSha256: promotion.sourcePublicationReportSha256,
            proofSha256: promotion.sourcePublicationProofSha256,
          },
          failureMarkerPath: marker,
        });
        try {
          const supportingEvidence = promotion.sourceAuthorityKind ===
              "active-database-publication"
            ? { kind: promotion.sourceAuthorityKind } as const
            : {
                kind: promotion.sourceAuthorityKind,
                sourceReportSha256: requiredEnv(
                  "DURABLE_READER_SUMMARY_SOURCE_REPORT_SHA256",
                ),
                collectionArtifactSha256: requiredEnv(
                  "DURABLE_READER_SUMMARY_COLLECTION_ARTIFACT_SHA256",
                ),
                collectionQualityReportSha256: requiredEnv(
                  "DURABLE_READER_SUMMARY_COLLECTION_QUALITY_REPORT_SHA256",
                ),
              } as const;
          const expectedGenerationAuthority =
            parseHistoricalPromotionGenerationAuthority(
              process.env[historicalPromotionGenerationAuthorityJsonEnv],
              process.env[historicalPromotionGenerationAuthoritySha256Env],
            );
          const currentGenerationAuthority =
            await postgres.readGenerationAuthority();
          if (historicalPromotionGenerationAuthoritySha256(
            currentGenerationAuthority,
          ) !== historicalPromotionGenerationAuthoritySha256(
            expectedGenerationAuthority,
          )) {
            throw new UnderLockDriftError();
          }
          const canonical = buildHistoricalPromotionCanonicalInput({
            date,
            sourcePublication: {
              kind: "active-database-publication",
              publicationId: promotion.sourcePublicationId,
              artifactId: promotion.sourceArtifactId,
              reportSha256: promotion.sourcePublicationReportSha256,
              proofSha256: promotion.sourcePublicationProofSha256,
            },
            datasetManifest: manifest,
            datasetManifestSha256: fileSha256,
            supportingEvidence,
            generationAuthority: currentGenerationAuthority,
            allowHistoricalGitHubOmission:
              process.env
                .DURABLE_READER_SUMMARY_HISTORICAL_GITHUB_OMISSION_REASON !==
                undefined,
            historicalGitHubOmissionReason: process.env
              .DURABLE_READER_SUMMARY_HISTORICAL_GITHUB_OMISSION_REASON,
          });
          if (canonical.authoritativeInputDigest !==
                promotion.authoritativeInputDigest ||
              historicalPromotionRebuildIdentity({
                date,
                authoritativeInputDigest: canonical.authoritativeInputDigest,
                authorityInspectionDigest:
                  promotion.authorityInspectionDigest,
              }) !== promotion.rebuildIdentity) {
            throw new UnderLockDriftError();
          }
          const inspection = await postgres.inspect(
            date,
            manifest.policy.timestampPolicy,
          );
          const classification = classifyHistoricalPromotionAuthority({
            date,
            inspection,
          });
          if (classification.kind === "unrebuildable" ||
              classification.authorityInspectionDigest !== requiredEnv(
                "DURABLE_READER_SUMMARY_PROMOTION_AUTHORITY_INSPECTION_SHA256",
              )) {
            throw new UnderLockDriftError();
          }
          const state = await postgres.reconcile(
            date,
            promotion.rebuildIdentity,
            {
              date,
              authoritativeInputDigest: canonical.authoritativeInputDigest,
              canonicalInput: canonical.envelope,
              sourcePublicationId: promotion.sourcePublicationId,
              sourceArtifactId: promotion.sourceArtifactId,
              sourcePublicationReportSha256:
                promotion.sourcePublicationReportSha256,
              sourcePublicationProofSha256:
                promotion.sourcePublicationProofSha256,
              sourceEvidence: supportingEvidence.kind ===
                  "active-database-publication"
                ? supportingEvidence
                : {
                    ...supportingEvidence,
                    sourceReportPath: "/immutable/not-used/source-report",
                    collectionArtifactPath:
                      "/immutable/not-used/collection-artifact",
                    collectionQualityReportPath:
                      "/immutable/not-used/collection-quality",
                  },
              datasetManifestPath: manifestPath,
              datasetManifestSha256: fileSha256,
              timestampPolicy: manifest.policy.timestampPolicy,
              allowHistoricalGitHubOmission:
                process.env
                  .DURABLE_READER_SUMMARY_HISTORICAL_GITHUB_OMISSION_REASON !==
                  undefined,
              historicalGitHubOmissionReason: process.env
                .DURABLE_READER_SUMMARY_HISTORICAL_GITHUB_OMISSION_REASON,
            },
          );
          if (state.state !== "none" && state.state !== "requested") {
            writeHistoricalPromotionFailureMarker(
              marker,
              historicalPromotionUnderLockDurableStateReason,
            );
            throw new Error(historicalPromotionUnderLockDurableStateReason);
          }
        } catch (error) {
          if (error instanceof Error &&
              error.message === historicalPromotionUnderLockDurableStateReason) {
            throw error;
          }
          const reason = error instanceof UnderLockDriftError
            ? historicalPromotionUnderLockDriftReason
            : historicalPromotionUnderLockUnavailableReason;
          writeHistoricalPromotionFailureMarker(marker, reason);
          throw new Error(`Historical promotion ${reason}`);
        }
      },
      runProductionDay: () => spawnSync(command[0]!, command.slice(1), {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      }).status,
    });
  } finally {
    await Promise.all([connection.close(), postgres.close()]);
  }
  if (status !== 0) process.exitCode = status ?? 1;
}

class UnderLockDriftError extends Error {}

const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
};
