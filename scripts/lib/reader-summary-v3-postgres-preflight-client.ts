import type { PoolClient } from "pg";

import type { PrismaReaderSummaryJobRecord } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import type { PrismaSummaryClient } from
  "../../libs/summary/adapters/persistence/prisma/prisma-summary-client";

/** Narrow Prisma-shaped client backed by the isolated PostgreSQL fixture. */
export const postgresPreflightClient = (client: PoolClient): PrismaSummaryClient => {
  const queryRaw = async <T>(parts: TemplateStringsArray,
    ...values: readonly unknown[]): Promise<T> => taggedQuery(client, parts, values) as T;
  const readerSummaryJob = {
    findFirst: async (args: { readonly where: { readonly tenantId: string;
      readonly workspaceId: string; readonly id?: string } }) => jobRecord(client,
      args.where.tenantId, args.where.workspaceId, args.where.id),
  };
  const transactionClient = { $queryRaw: queryRaw, readerSummaryJob };
  return {
    ...transactionClient,
    $transaction: async <T>(operation: (tx: typeof transactionClient) => Promise<T>) => {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      try {
        const value = await operation(transactionClient);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    },
  } as unknown as PrismaSummaryClient;
};

const taggedQuery = async (client: PoolClient, parts: TemplateStringsArray,
  values: readonly unknown[]): Promise<unknown> => {
  const text = parts.reduce((sql, part, index) =>
    `${sql}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
  return (await client.query(text, [...values])).rows;
};

const jobRecord = async (client: PoolClient, tenant: string, workspace: string,
  jobId: string | undefined): Promise<PrismaReaderSummaryJobRecord | null> => {
  if (jobId === undefined) return null;
  const row = (await client.query<PrismaReaderSummaryJobRecord>(`
    SELECT id::text AS "id", tenant_id::text AS "tenantId", workspace_id::text AS "workspaceId",
      scope_type AS "scopeType", scope_key AS "scopeKey", interest_id::text AS "interestId",
      cadence::text AS "cadence", period_started_at AS "periodStartedAt",
      period_ended_at AS "periodEndedAt", period_timezone AS "periodTimezone",
      period_key AS "periodKey", user_id::text AS "userId", subscription_id::text AS "subscriptionId",
      status::text AS "status", idempotency_key AS "idempotencyKey", requested_at AS "requestedAt",
      started_at AS "startedAt", completed_at AS "completedAt", failed_at AS "failedAt",
      reader_summary_artifact_id::text AS "readerSummaryArtifactId", failure_reason AS "failureReason",
      terminal_failure_code AS "terminalFailureCode", selection_strategy AS "selectionStrategy",
      preparation_config AS "preparationConfig", preparation_manifest AS "preparationManifest",
      preparation_manifest_sha256 AS "preparationManifestSha256",
      preparation_cutoff_at AS "preparationCutoffAt", preparation_deadline_at AS "preparationDeadlineAt",
      preparation_next_check_at AS "preparationNextCheckAt", preparation_ready_at AS "preparationReadyAt",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM reader_summary_jobs WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid
      AND id=$3::uuid`, [tenant, workspace, jobId])).rows[0];
  return row ?? null;
};
