import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import type {
  HistoricalPromotionDurableStateReader,
  HistoricalPromotionMutation,
  HistoricalPromotionMutationOutcome,
} from "./reader-summary-promotion-v2-historical-runner";
import {
  historicalPromotionRevalidationFailurePathEnv,
  historicalPromotionUnderLockDriftReason,
  historicalPromotionUnderLockUnavailableReason,
  type HistoricalPromotionUnderLockReason,
} from "./reader-summary-promotion-v2-input-guard";

export class ProductionDayHistoricalPromotionMutation
  implements HistoricalPromotionMutation {
  constructor(private readonly input: {
    artifactOutput: string;
    dailyRunLockPath: string;
    dateLockDirectory: string;
    fenceDirectory: string;
    lockWaitSeconds: number;
    durableState: HistoricalPromotionDurableStateReader;
    verifier: Pick<HistoricalPromotionMutation, "verifyCompleted">;
    environment: Readonly<Record<string, string | undefined>>;
  }) {}

  verifyCompleted: HistoricalPromotionMutation["verifyCompleted"] = (input) =>
    this.input.verifier.verifyCompleted(input);

  async rebuild(
    input: Parameters<HistoricalPromotionMutation["rebuild"]>[0],
  ): Promise<HistoricalPromotionMutationOutcome> {
    const dateOutput = resolve(this.input.artifactOutput, input.date);
    const captureOutput = join(dateOutput, "capture");
    const reportOutput = join(dateOutput, "production-day");
    const fenceTokenPath = join(
      dateOutput,
      `date-fence-token-${randomUUID()}.txt`,
    );
    const revalidationFailurePath = join(
      dateOutput,
      "under-lock-input-revalidation-failure.v1.json",
    );
    mkdirSync(dateOutput, { recursive: true, mode: 0o700 });
    rmSync(revalidationFailurePath, { force: true });
    const command = lockedPreflightCommand(
      historicalPromotionProductionDayCommand(input),
    );
    const status = await spawnExitCode(
      "bash",
      [
        resolve(
          process.cwd(),
          "ops/deploy/production-runtime/reader-summary-date-lock.sh",
        ),
        "--date",
        input.date,
        "--date-lock-dir",
        this.input.dateLockDirectory,
        "--fence-dir",
        this.input.fenceDirectory,
        "--global-lock",
        this.input.dailyRunLockPath,
        "--wait-seconds",
        String(this.input.lockWaitSeconds),
        "--token-output",
        fenceTokenPath,
        "--",
        ...command,
      ],
      {
        ...this.input.environment,
        READER_SUMMARY_PRODUCTION_DAY_ARTIFACT_DIR: captureOutput,
        READER_SUMMARY_PRODUCTION_DAY_REPORT_DIR: reportOutput,
        DURABLE_READER_SUMMARY_DATASET_MANIFEST_PATH:
          input.bundle.datasetManifestPath,
        DURABLE_READER_SUMMARY_DATASET_MANIFEST_SHA256:
          input.bundle.datasetManifestSha256,
        DURABLE_READER_SUMMARY_RECOVERY_TIMESTAMP_POLICY:
          input.bundle.timestampPolicy,
        [historicalPromotionRevalidationFailurePathEnv]:
          revalidationFailurePath,
        DURABLE_READER_SUMMARY_PROMOTION_REBUILD_IDENTITY:
          input.rebuildIdentity,
        DURABLE_READER_SUMMARY_PROMOTION_POLICY_VERSION:
          input.classification.policyVersion,
        DURABLE_READER_SUMMARY_PROMOTION_SOURCE_AUTHORITY_KIND:
          input.bundle.sourceEvidence.kind,
        DURABLE_READER_SUMMARY_AUTHORITATIVE_INPUT_SHA256:
          input.bundle.authoritativeInputDigest,
        DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_ID:
          input.bundle.sourcePublicationId,
        DURABLE_READER_SUMMARY_SOURCE_ARTIFACT_ID:
          input.bundle.sourceArtifactId,
        DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_REPORT_SHA256:
          input.bundle.sourcePublicationReportSha256,
        DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_PROOF_SHA256:
          input.bundle.sourcePublicationProofSha256,
        ...(input.bundle.historicalGitHubOmissionReason === undefined
          ? {}
          : {
              DURABLE_READER_SUMMARY_HISTORICAL_GITHUB_OMISSION_REASON:
                input.bundle.historicalGitHubOmissionReason,
            }),
      },
    );
    const fenceToken = readFenceToken(fenceTokenPath);
    const underLockFailure = readUnderLockFailure(revalidationFailurePath);
    if (underLockFailure !== null) {
      return {
        status: "pending",
        fenceToken,
        reason: underLockFailure,
        retrySafety: "safe-before-paid-operation",
        pointerSwitchAttempted: false,
      };
    }
    const state = await this.input.durableState.reconcile(
      input.date,
      input.rebuildIdentity,
      input.bundle,
    );
    if (state.state === "complete-active") {
      try {
        return {
          status: "completed",
          fenceToken,
          output: await this.verifyCompleted({
            date: input.date,
            rebuildIdentity: input.rebuildIdentity,
            state,
          }),
        };
      } catch {
        return {
          status: "pending",
          fenceToken,
          reason: "active_publication_visibility_requires_reconciliation",
          retrySafety: "requires-durable-reconciliation",
          pointerSwitchAttempted: true,
        };
      }
    }
    if (status === 0) {
      return {
        status: "pending",
        fenceToken,
        reason: state.reason ?? "successful_child_has_ambiguous_publication_state",
        retrySafety: "requires-durable-reconciliation",
        pointerSwitchAttempted: true,
      };
    }
    if (state.state === "none" || state.state === "requested") {
      return {
        status: "pending",
        fenceToken,
        reason: "production_day_failed_before_paid_operation",
        retrySafety: "safe-before-paid-operation",
        pointerSwitchAttempted: false,
      };
    }
    return {
      status: "pending",
      fenceToken,
      reason: state.reason ?? "production_day_failure_requires_reconciliation",
      retrySafety: "requires-durable-reconciliation",
      pointerSwitchAttempted: state.state === "complete-detached",
    };
  }
}

export const historicalPromotionProductionDayCommand = (
  input: Parameters<HistoricalPromotionMutation["rebuild"]>[0],
): readonly string[] => [
  process.execPath,
  resolve(process.cwd(), "scripts/run-with-timeout.mjs"),
  "--timeout-ms",
  "11760000",
  "--node-options",
  "--max-old-space-size=1024",
  "--",
  resolve(process.cwd(), "node_modules/.bin/ts-node"),
  "-r",
  "tsconfig-paths/register",
  resolve(process.cwd(), "scripts/run-reader-summary-production-day.ts"),
  "--date",
  input.date,
  "--update",
  "--regenerate-after-passed-collection",
  "--promotion-v2-rebuild",
  "--promotion-rebuild-identity",
  input.rebuildIdentity,
  "--promotion-source-authority-kind",
  input.bundle.sourceEvidence.kind,
  "--authoritative-input-sha256",
  input.bundle.authoritativeInputDigest,
  "--source-publication-id",
  input.bundle.sourcePublicationId,
  "--source-artifact-id",
  input.bundle.sourceArtifactId,
  "--source-publication-report-sha256",
  input.bundle.sourcePublicationReportSha256,
  "--source-publication-proof-sha256",
  input.bundle.sourcePublicationProofSha256,
  ...(input.bundle.sourceEvidence.kind === "active-database-publication"
    ? []
    : [
        "--reuse-source-report",
        input.bundle.sourceEvidence.sourceReportPath,
        "--reuse-source-artifact-sha256",
        input.bundle.sourceEvidence.sourceReportSha256,
        "--reuse-collection-artifact",
        input.bundle.sourceEvidence.collectionArtifactPath,
        "--reuse-collection-artifact-sha256",
        input.bundle.sourceEvidence.collectionArtifactSha256,
        "--reuse-collection-quality-report",
        input.bundle.sourceEvidence.collectionQualityReportPath,
        "--reuse-collection-quality-report-sha256",
        input.bundle.sourceEvidence.collectionQualityReportSha256,
      ]),
  "--reuse-dataset-manifest",
  input.bundle.datasetManifestPath,
  "--reuse-dataset-manifest-sha256",
  input.bundle.datasetManifestSha256,
  "--recovery-timestamp-policy",
  input.bundle.timestampPolicy,
  ...(input.bundle.allowHistoricalGitHubOmission
    ? ["--allow-historical-github-omission"]
    : []),
];

const lockedPreflightCommand = (
  productionDayCommand: readonly string[],
): readonly string[] => [
  process.execPath,
  resolve(process.cwd(), "scripts/run-with-timeout.mjs"),
  "--timeout-ms",
  "11760000",
  "--node-options",
  "--max-old-space-size=1024",
  "--",
  resolve(process.cwd(), "node_modules/.bin/ts-node"),
  "-r",
  "tsconfig-paths/register",
  resolve(
    process.cwd(),
    "scripts/run-reader-summary-promotion-v2-locked-date.ts",
  ),
  "--",
  ...productionDayCommand,
];

const spawnExitCode = (
  command: string,
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): Promise<number | null> => new Promise((resolveExit, reject) => {
  const child = spawn(command, [...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", (code) => resolveExit(code));
});

const readFenceToken = (path: string): string => {
  const value = readFileSync(path, "utf8").trim();
  if (!/^reader-summary-date:\d{4}-\d{2}-\d{2}:\d+$/u.test(value)) {
    throw new Error("Historical promotion date fence token is invalid");
  }
  return value;
};

const readUnderLockFailure = (
  path: string,
): HistoricalPromotionUnderLockReason | null => {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error &&
        error.code === "ENOENT") {
      return null;
    }
    throw new Error("Historical promotion under-lock marker is invalid");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      !("reason" in value) ||
      (value.reason !== historicalPromotionUnderLockDriftReason &&
        value.reason !== historicalPromotionUnderLockUnavailableReason)) {
    throw new Error("Historical promotion under-lock marker is invalid");
  }
  return value.reason;
};
