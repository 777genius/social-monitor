import { createHash } from "node:crypto";

import { PrismaReaderSummaryOperatorCancellation } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-operator-cancellation";
import type { PrismaSummaryClient } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import type { ReaderSummaryOperatorCancellationPort } from
  "@social-monitor/summary/ports";
import { loadPrismaRuntimeClient } from
  "@social-monitor/platform-persistence/prisma-runtime-client";
import { PostgresRuntimePoolRegistry, defaultPostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor } from "@social-monitor/platform-persistence";

type OperatorCancellationCommand = {
  readonly mode: "preview" | "apply";
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly jobIds: readonly string[];
  readonly previewSha256?: string;
};
type OperatorRuntimeClient = PrismaSummaryClient & { $disconnect(): Promise<void> };

const confirmation = "cancel-reader-summary-jobs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export const parseReaderSummaryOperatorCancellationArguments = (
  args: readonly string[],
): OperatorCancellationCommand => {
  const values = new Map<string, string[]>();
  const allowed = new Set([
    "--mode", "--tenant-id", "--workspace-id", "--job-id",
    "--preview-sha256", "--confirm",
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || value === undefined || !allowed.has(key)) {
      throw new Error("operator cancellation arguments are invalid");
    }
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const mode = values.get("--mode")?.[0];
  const tenantId = values.get("--tenant-id")?.[0]?.toLowerCase();
  const workspaceId = values.get("--workspace-id")?.[0]?.toLowerCase();
  const jobIds = values.get("--job-id") ?? [];
  const previewSha256 = values.get("--preview-sha256")?.[0];
  if (["--mode", "--tenant-id", "--workspace-id", "--preview-sha256", "--confirm"]
    .some((key) => (values.get(key)?.length ?? 0) > 1)) {
    throw new Error("operator cancellation arguments are ambiguous");
  }
  if ((mode !== "preview" && mode !== "apply") || tenantId === undefined ||
      workspaceId === undefined || !uuid.test(tenantId) || !uuid.test(workspaceId) ||
      jobIds.length < 1 || jobIds.length > 100 || new Set(jobIds).size !== jobIds.length ||
      jobIds.some((id) => !uuid.test(id))) {
    throw new Error("operator cancellation requires explicit scoped UUID targets");
  }
  if (mode === "apply" &&
      (previewSha256 === undefined || !/^[0-9a-f]{64}$/u.test(previewSha256) ||
       values.get("--confirm")?.[0] !== confirmation)) {
    throw new Error("apply requires reviewed preview SHA-256 and exact confirmation");
  }
  return { mode, tenantId, workspaceId, jobIds: Object.freeze([...jobIds]),
    ...(previewSha256 === undefined ? {} : { previewSha256 }) };
};

export const safeOperatorCancellationPreview = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly rows: readonly { readonly jobId: string; readonly status: string }[];
}) => {
  const rows = params.rows.map((row) => ({ job: sha(row.jobId).slice(0, 12),
    status: row.status })).sort((left, right) => left.job.localeCompare(right.job));
  const scope = { tenant: sha(params.tenantId).slice(0, 12),
    workspace: sha(params.workspaceId).slice(0, 12) };
  const payload = JSON.stringify({ kind: "reader_summary_operator_cancellation_preview.v1",
    scope, rows });
  return { mode: "preview" as const, scope, rows,
    previewSha256: sha(payload) };
};

export const runReaderSummaryOperatorCancellation = async (params: {
  readonly command: OperatorCancellationCommand;
  readonly cancellation: ReaderSummaryOperatorCancellationPort;
}) => {
  const scope = { tenantId: params.command.tenantId,
    workspaceId: params.command.workspaceId, jobIds: params.command.jobIds };
  const preview = safeOperatorCancellationPreview({ ...scope,
    rows: await params.cancellation.preview(scope) });
  if (params.command.mode === "preview") return preview;
  if (params.command.previewSha256 !== preview.previewSha256) {
    throw new Error("preview SHA-256 does not match current scoped job state");
  }
  const result = await params.cancellation.cancel(scope);
  return { mode: "applied" as const, scope: preview.scope,
    outcomes: result.map((item) => ({ job: sha(item.jobId).slice(0, 12),
      status: item.status })), previewSha256: preview.previewSha256 };
};

export const main = async (args: readonly string[], env: NodeJS.ProcessEnv) => {
  const command = parseReaderSummaryOperatorCancellationArguments(args);
  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("operator cancellation requires DATABASE_URL");
  }
  const Client = loadPrismaRuntimeClient<
    PrismaPgRuntimeClientConstructor<OperatorRuntimeClient>
  >();
  const connection = await new PostgresRuntimePoolRegistry().acquire(
    defaultPostgresRuntimePoolConfig(databaseUrl, "admin-tool"), Client,
  );
  try {
    const outcome = await runReaderSummaryOperatorCancellation({ command,
      cancellation: new PrismaReaderSummaryOperatorCancellation(connection.client) });
    process.stdout.write(`${JSON.stringify(outcome)}\n`);
  } finally {
    await connection.close();
  }
};

if (require.main === module) {
  void main(process.argv.slice(2), process.env).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "operator cancellation failed"}\n`);
    process.exitCode = 1;
  });
}
