import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type {
  HistoricalPromotionDurableStateReader,
  HistoricalPromotionMutation,
  HistoricalPromotionMutationOutcome,
} from "./reader-summary-promotion-v2-historical-runner";

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
    mkdirSync(dateOutput, { recursive: true, mode: 0o700 });
    const command = productionDayCommand(input);
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
        DURABLE_READER_SUMMARY_PROMOTION_REBUILD_IDENTITY:
          input.rebuildIdentity,
        DURABLE_READER_SUMMARY_PROMOTION_POLICY_VERSION:
          input.classification.policyVersion,
        DURABLE_READER_SUMMARY_AUTHORITATIVE_INPUT_SHA256:
          input.classification.authoritativeInputDigest,
        DURABLE_READER_SUMMARY_SOURCE_PUBLICATION_ID:
          input.bundle.sourcePublicationId,
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

const productionDayCommand = (
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
  "--authoritative-input-sha256",
  input.classification.authoritativeInputDigest,
  "--source-publication-id",
  input.bundle.sourcePublicationId,
  "--source-artifact-id",
  input.bundle.sourceArtifactId,
  "--source-publication-proof-sha256",
  input.bundle.sourcePublicationProofSha256,
  "--reuse-source-report",
  input.bundle.sourceReportPath,
  "--reuse-source-artifact-sha256",
  input.bundle.sourceReportSha256,
  "--reuse-collection-artifact",
  input.bundle.collectionArtifactPath,
  "--reuse-collection-artifact-sha256",
  input.bundle.collectionArtifactSha256,
  "--reuse-collection-quality-report",
  input.bundle.collectionQualityReportPath,
  "--reuse-collection-quality-report-sha256",
  input.bundle.collectionQualityReportSha256,
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
