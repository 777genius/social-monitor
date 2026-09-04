import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

import { SubscriptionRuntimeCliExecutor } from
  "../apps/agent-runtime/src/subscription-runtime-cli-executor";
import {
  FileSubscriptionRuntimeInstallationInspector,
} from "../apps/agent-runtime/src/subscription-runtime-installation";
import { readerPromotionV2CanaryActivationCapability } from
  "../apps/agent-runtime/src/subscription-runtime-purpose-model-policy";
import {
  loadCanaryManifest,
  sha256,
  type CanaryProvenance,
} from "./lib/reader-promotion-v2-production-canary-contract";
import { PostgresReaderPromotionV2ProductionCanaryStore } from
  "./lib/reader-promotion-v2-production-canary-postgres-store";
import { ReaderPromotionV2ProductionCanaryRunner } from
  "./lib/reader-promotion-v2-production-canary-runner";

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = requiredDatabaseUrl(process.env);
  const inspector = new FileSubscriptionRuntimeInstallationInspector();
  const installation = await inspector.inspect(args.runtimeCommand);
  const runtimePackageSha256 = await installedPackageDigest(
    installation.packageRootRealpath,
  );
  const provenance: CanaryProvenance = {
    protectedMainSha: args.targetSha,
    deployedReleaseSha: args.releaseSha,
    deployedBackendSha: args.backendSha,
    deployedControlSha: args.controlSha,
    deployedRuntimeSha: args.runtimeSha,
    runtimeImageId: args.runtimeImageId,
    workflow: args.workflow,
    workflowRunId: args.workflowRunId,
    workflowRunAttempt: args.workflowRunAttempt,
    runtimePackageVersion: installation.runtimePackageVersion,
    runtimePackageSha256,
    launcherSha256: installation.launcherSha256,
  };
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    application_name: "reader-promotion-v2-production-canary",
    statement_timeout: 10_000,
  });
  try {
    await assertInvokerRole(pool);
    const runner = new ReaderPromotionV2ProductionCanaryRunner({
      manifest: loadCanaryManifest(),
      store: new PostgresReaderPromotionV2ProductionCanaryStore(pool),
      executor: new SubscriptionRuntimeCliExecutor({
        command: installation.executablePath,
        ephemeral: true,
        stateRoot: args.runtimeStateRoot,
        installationInspector: inspector,
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
        readerPromotionV2CanaryActivationCapability,
      }),
    });
    const result = await runner.run({
      targetSha: args.targetSha,
      ownerId: args.workflowRunId,
      fence: args.fence,
      provenance,
    });
    process.stdout.write(`${JSON.stringify({
      state: result.state,
      receipt: result.receipt,
    })}\n`);
    if (result.state === "REJECTED") process.exitCode = 1;
    if (result.state === "IN_PROGRESS") process.exitCode = 75;
  } finally {
    await pool.end();
  }
};

type Args = {
  readonly targetSha: string;
  readonly releaseSha: string;
  readonly backendSha: string;
  readonly controlSha: string;
  readonly runtimeSha: string;
  readonly runtimeImageId: string;
  readonly workflow: string;
  readonly workflowRunId: string;
  readonly workflowRunAttempt: number;
  readonly fence: string;
  readonly runtimeCommand: string;
  readonly runtimeStateRoot: string;
};

const parseArgs = (raw: readonly string[]): Args => {
  const values = new Map<string, string>();
  for (let index = 0; index < raw.length; index += 2) {
    const key = raw[index];
    const value = raw[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--") ||
        values.has(key)) throw new Error("canary_cli_arguments_invalid");
    values.set(key, value);
  }
  const required = (key: string): string => {
    const value = values.get(key)?.trim();
    if (value === undefined || value === "") {
      throw new Error(`canary_cli_argument_missing:${key}`);
    }
    return value;
  };
  const attempt = Number(required("--workflow-run-attempt"));
  if (!Number.isSafeInteger(attempt) || attempt <= 0) {
    throw new Error("canary_cli_workflow_attempt_invalid");
  }
  return {
    targetSha: required("--target-sha"),
    releaseSha: required("--release-sha"),
    backendSha: required("--backend-sha"),
    controlSha: required("--control-sha"),
    runtimeSha: required("--runtime-sha"),
    runtimeImageId: required("--runtime-image-id"),
    workflow: required("--workflow"),
    workflowRunId: required("--workflow-run-id"),
    workflowRunAttempt: attempt,
    fence: required("--fence"),
    runtimeCommand: required("--runtime-command"),
    runtimeStateRoot: required("--runtime-state-root"),
  };
};

const requiredDatabaseUrl = (
  env: Readonly<Record<string, string | undefined>>,
): string => {
  const value = env.READER_PROMOTION_V2_CANARY_DATABASE_URL?.trim();
  if (value === undefined || value === "") {
    throw new Error("READER_PROMOTION_V2_CANARY_DATABASE_URL is required");
  }
  const url = new URL(value);
  if (!/^postgres(?:ql)?:$/u.test(url.protocol) ||
      url.username !== "social_monitor_reader_promotion_canary_invoker") {
    throw new Error("reader promotion V2 canary database role is invalid");
  }
  return value;
};

const assertInvokerRole = async (pool: Pool): Promise<void> => {
  const result = await pool.query<{ current_user: string }>(
    "select current_user",
  );
  if (result.rows[0]?.current_user !==
      "social_monitor_reader_promotion_canary_invoker") {
    throw new Error("reader promotion V2 canary invoker role rejected");
  }
};

const installedPackageDigest = async (root: string): Promise<string> => {
  const digest = createHash("sha256");
  const visit = async (directory: string, relative: string): Promise<void> => {
    const names = (await readdir(directory)).sort();
    for (const name of names) {
      const path = join(directory, name);
      const child = relative === "" ? name : `${relative}/${name}`;
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) {
        throw new Error("canary_runtime_package_symlink_rejected");
      }
      if (metadata.isDirectory()) {
        await visit(path, child);
      } else if (metadata.isFile()) {
        const bytes = await readFile(path);
        digest.update(child).update("\0").update(String(bytes.length))
          .update("\0").update(bytes);
      } else {
        throw new Error("canary_runtime_package_entry_rejected");
      }
    }
  };
  await visit(root, "");
  return digest.digest("hex");
};

void main().catch((error: unknown) => {
  const code = error instanceof Error &&
      /^canary_|^reader promotion|^READER_PROMOTION/u.test(error.message)
    ? error.message.split(":", 1)[0]
    : `canary_failed_${sha256(randomUUID()).slice(0, 8)}`;
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});

export { parseArgs, requiredDatabaseUrl };
