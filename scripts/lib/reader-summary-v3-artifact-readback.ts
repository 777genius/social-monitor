import type { ReaderSummaryPublicationPostgresClient } from "./reader-summary-publication-postgres-fixture-scope";
import { readerSummaryArtifactFromPrisma, type PrismaReaderSummaryArtifactRecord } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-records";

export const readPersistedV3FixtureArtifact = async (
  client: ReaderSummaryPublicationPostgresClient, artifactId: string,
) => {
  const record = (await client.query<PrismaReaderSummaryArtifactRecord>(`SELECT id::text AS "id",
    tenant_id::text AS "tenantId", workspace_id::text AS "workspaceId", scope_type AS "scopeType",
    scope_key AS "scopeKey", interest_id::text AS "interestId", cadence::text AS "cadence",
    period_started_at AS "periodStartedAt", period_ended_at AS "periodEndedAt", period_timezone AS "periodTimezone",
    period_key AS "periodKey", user_id::text AS "userId", subscription_id::text AS "subscriptionId",
    status::text AS "status", schema_version AS "schemaVersion", model_version AS "modelVersion",
    prompt_version AS "promptVersion", headline AS "headline", summary_text AS "summaryText",
    artifact_payload AS "artifactPayload", citations AS "citations", quality_signals AS "qualitySignals",
    created_at AS "createdAt", updated_at AS "updatedAt" FROM reader_summary_artifacts WHERE id=$1::uuid`,
  [artifactId])).rows[0];
  if (record === undefined) throw new Error("V3 persisted artifact is missing");
  return readerSummaryArtifactFromPrisma(record);
};
