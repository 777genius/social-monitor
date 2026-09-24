import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { CryptoIdGenerator, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { PrepareReaderValueSummaryUseCase } from
  "@social-monitor/relevance/application/use-cases/prepare-reader-value-summary.use-case";
import { SourceContentSafetyPolicy } from "@social-monitor/relevance/domain/source-content-safety";
import { PrismaReaderValueAssessmentStore } from
  "@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store";
import { PrismaReaderValueInventory } from
  "@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-inventory";
import { ConservativeReaderValueInputBuilder } from
  "@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder";
import type { AssessmentSqlClient, AssessmentSqlTransaction } from
  "@social-monitor/relevance/infrastructure/reader-value/assessment-sql";
import type { ConfiguredInterestReaderPort } from "@social-monitor/relevance/ports";
import { RelevanceReaderSummaryV3PreparationSource } from
  "../../libs/summary/adapters/evidence/relevance-reader-summary-v3-preparation-source";
import { PrismaReaderSummaryJobRepository } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { PrismaReaderSummaryV3Preflight } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-v3-preflight";
import { postgresPreflightClient } from "./reader-summary-v3-postgres-preflight-client";

/** Uses the same inventory, input builder, store, source adapter and preflight
 * composition as production; only the isolated fixture's SQL transport is thin. */
export const runProductionV3Preflight = async (client: PoolClient, scope: {
  readonly tenantId: string; readonly workspaceId: string; readonly jobId: string;
}) => {
  const prisma = postgresPreflightClient(client);
  const jobs = new PrismaReaderSummaryJobRepository(prisma);
  const job = await jobs.findById({ tenantId: tenantId(scope.tenantId),
    workspaceId: workspaceId(scope.workspaceId), readerSummaryJobId: scope.jobId });
  if (job === null) throw new Error("Production V3 preflight fixture job is missing");
  const assessmentClient = postgresAssessmentClient(client);
  const store = new PrismaReaderValueAssessmentStore(assessmentClient);
  const source = new RelevanceReaderSummaryV3PreparationSource(
    new PrepareReaderValueSummaryUseCase(new PrismaReaderValueInventory(assessmentClient),
      new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy()), store,
      new CryptoIdGenerator(), postgresConfiguredInterestReader(client)), store);
  return new PrismaReaderSummaryV3Preflight(prisma, jobs, source).advance({ job,
    requestedAt: job.toSnapshot().requestedAt, startedAt: job.toSnapshot().requestedAt });
};

/** The publication fixture predates ingestion capture provenance. Supply the
 * same persisted capture shape that the production inventory reads. */
export const seedProductionReaderValueCapture = async (client: PoolClient,
  feedItemId: string): Promise<void> => {
  const row = (await client.query<{ readonly title: string; readonly body: string;
    readonly canonical_url: string; readonly observed_at: string }>(`SELECT f.title,
      s.body,s.canonical_url,to_char(f.observed_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') observed_at FROM feed_items f JOIN source_items s
      ON s.tenant_id=f.tenant_id AND s.workspace_id=f.workspace_id AND s.id=f.source_item_id
      WHERE f.id=$1::uuid`, [feedItemId])).rows[0];
  if (row === undefined) throw new Error("Production V3 capture fixture source is missing");
  const native = { origin: "provider_native", offset: 0, length: row.body.length,
    originalLength: row.body.length, fullTextSha256: digest(row.body), truncated: false,
    sourceUrl: row.canonical_url, finalUrl: row.canonical_url,
    extractionVersion: "provider_native.complete.v1", availableAt: row.observed_at };
  const capture = { version: "source_content_capture.v1", native, articleUrl: null,
    sourceSnapshotSha256: digest(JSON.stringify([captureVersion, row.title, row.body, null,
      JSON.stringify([native.origin, native.offset, native.length, native.originalLength,
        native.fullTextSha256, native.truncated, native.sourceUrl, native.finalUrl,
        native.extractionVersion])])) };
  await client.query("UPDATE source_items SET metadata=jsonb_build_object('kind','rss_item','contentCapture',$1::jsonb), content_updated_at=observed_at WHERE id=(SELECT source_item_id FROM feed_items WHERE id=$2::uuid)",
    [JSON.stringify(capture), feedItemId]);
  await client.query("UPDATE feed_items SET provider_metadata=jsonb_build_object('kind','rss_item') WHERE id=$1::uuid",
    [feedItemId]);
};

const captureVersion = "source_content_capture.v1";
const digest = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

const postgresConfiguredInterestReader = (client: PoolClient): ConfiguredInterestReaderPort => ({
  readCurrent: async (scope) => {
    const row = (await client.query<{ readonly query: string }>(`SELECT query FROM interests
      WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid
        AND status='ENABLED' AND deleted_at IS NULL`, [scope.tenantId,
      scope.workspaceId, scope.interestId])).rows[0];
    return row === undefined ? { kind: "missing" } : { kind: "available",
      interest: { ...scope, query: row.query } };
  },
});

const postgresAssessmentClient = (client: PoolClient): AssessmentSqlClient => ({
  $queryRawUnsafe: async <T>(sql: string, ...values: unknown[]) =>
    (await client.query(sql, values)).rows as T,
  $executeRawUnsafe: async (sql: string, ...values: unknown[]) =>
    (await client.query(sql, values)).rowCount ?? 0,
  $transaction: async <T>(operation: (transaction: AssessmentSqlTransaction) => Promise<T>) => {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      const result = await operation(postgresAssessmentClientTransaction(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  },
});

const postgresAssessmentClientTransaction = (client: PoolClient): AssessmentSqlTransaction => ({
  $queryRawUnsafe: async <T>(sql: string, ...values: unknown[]) =>
    (await client.query(sql, values)).rows as T,
  $executeRawUnsafe: async (sql: string, ...values: unknown[]) =>
    (await client.query(sql, values)).rowCount ?? 0,
});
