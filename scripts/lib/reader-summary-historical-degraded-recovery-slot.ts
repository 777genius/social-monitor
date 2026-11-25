import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { buildReaderSummaryPublicationPayload } from "@social-monitor/summary/adapters/persistence/reader-summary-publication-proof";
import { buildReaderSummaryRecoveryReceiptPayload } from "@social-monitor/summary/adapters/persistence/reader-summary-recovery-receipt";
import type { ReaderSummaryRecoveryFinalizationCommand } from "@social-monitor/summary/ports";

import {
  historicalDegradedRecoveryTenantId,
  historicalDegradedRecoveryWorkspaceId,
  type HistoricalDegradedRecoveryAuthority,
  type HistoricalDegradedRecoveryDate,
} from "./reader-summary-historical-degraded-recovery-authority";

export type HistoricalDegradedRecoveryPublicationBinding = Readonly<{
  publicationId: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  outboxEventId: string;
  outboxEventType: string;
  outboxSchemaVersion: number;
  outboxTenantId: string;
  outboxWorkspaceId: string;
  outboxPayloadJson: string;
  outboxCorrelationId: string;
  outboxCausationId: string;
  outboxCreatedAt: string;
  periodKey: string;
  requestedUtcDate: string;
  requestedAt: string;
  semanticStatus: "COMPLETED" | "NO_SIGNAL";
  modelVersion: string;
  publishedAt: string;
  reportSha256: string;
  proofSha256: string;
  exactProofJson: string;
  provenanceSha256: string;
  provenanceJson: string;
  receiptSha256: string;
  exactReceiptJson: string;
}>;

type PublicationSlotState = Readonly<{
  publicationCount: number;
  exactPublicationCount: number;
  exactOutboxCount: number;
  completedCandidateCount: number;
  slotCount: number;
  currentPublicationId: string | null;
}>;

export const historicalDegradedRecoveryPublicationBinding = (
  command: ReaderSummaryRecoveryFinalizationCommand,
  expectedRequestedUtcDate: HistoricalDegradedRecoveryDate,
): HistoricalDegradedRecoveryPublicationBinding => {
  const publication = buildReaderSummaryPublicationPayload(command.publication);
  const receipt = buildReaderSummaryRecoveryReceiptPayload({
    publication,
    provenance: command.provenance,
  });
  const readyEvent = publication.readyEvent;
  if (
    publication.requestedUtcDate !== expectedRequestedUtcDate ||
    publication.requestedAt.slice(0, 10) !== expectedRequestedUtcDate ||
    publication.periodStartedAt.slice(0, 10) !== expectedRequestedUtcDate ||
    publication.exactProof.requestedUtcDate !== expectedRequestedUtcDate
  ) {
    throw new Error(
      "Historical degraded recovery proof and publication date do not match the allowlisted target",
    );
  }
  const outboxPayload = {
    ...(readyEvent.payload as Readonly<Record<string, unknown>>),
    publicationProof: publication.exactProof,
    reportSha256: publication.reportSha256,
    proofSha256: publication.proofSha256,
  };
  return Object.freeze({
    publicationId: publication.readerSummaryArtifactId,
    readerSummaryJobId: publication.readerSummaryJobId,
    readerSummaryArtifactId: publication.readerSummaryArtifactId,
    outboxEventId: command.publication.readyEvent.eventId,
    outboxEventType: String(readyEvent.eventType),
    outboxSchemaVersion: Number(readyEvent.schemaVersion),
    outboxTenantId: publication.tenantId,
    outboxWorkspaceId: publication.workspaceId,
    outboxPayloadJson: JSON.stringify(outboxPayload),
    outboxCorrelationId: String(readyEvent.correlationId),
    outboxCausationId: String(readyEvent.causationId),
    outboxCreatedAt: publication.publishedAt,
    periodKey: publication.periodKey,
    requestedUtcDate: publication.requestedUtcDate,
    requestedAt: publication.requestedAt,
    semanticStatus: publication.semanticStatus,
    modelVersion: publication.modelVersion,
    publishedAt: publication.publishedAt,
    reportSha256: publication.reportSha256,
    proofSha256: publication.proofSha256,
    exactProofJson: JSON.stringify(publication.exactProof),
    provenanceSha256: receipt.provenanceSha256,
    provenanceJson: JSON.stringify(receipt.provenance),
    receiptSha256: receipt.receiptSha256,
    exactReceiptJson: JSON.stringify(receipt.exactReceipt),
  });
};

export const assertHistoricalDegradedRecoveryPublicationSlot = (
  state: PublicationSlotState,
  expectedPublicationId: string,
): "empty" | "replay" => {
  if (
    !Number.isSafeInteger(state.publicationCount) ||
    !Number.isSafeInteger(state.exactPublicationCount) ||
    !Number.isSafeInteger(state.exactOutboxCount) ||
    !Number.isSafeInteger(state.completedCandidateCount) ||
    !Number.isSafeInteger(state.slotCount) ||
    state.publicationCount < 0 ||
    state.exactPublicationCount < 0 ||
    state.exactOutboxCount < 0 ||
    state.completedCandidateCount < 0 ||
    state.slotCount < 0
  ) {
    throw new Error("Historical degraded recovery publication slot reader failed");
  }
  if (
    state.publicationCount === 0 &&
    state.exactPublicationCount === 0 &&
    state.exactOutboxCount === 0 &&
    state.completedCandidateCount === 0 &&
    state.currentPublicationId === null
  ) {
    return "empty";
  }
  if (
    state.publicationCount === 1 &&
    state.exactPublicationCount === 1 &&
    state.exactOutboxCount === 1 &&
    state.completedCandidateCount === 1 &&
    state.slotCount === 1 &&
    state.currentPublicationId === expectedPublicationId
  ) {
    return "replay";
  }
  throw new Error(
    "Historical degraded recovery requires an empty slot or the exact terminal publication, outbox event, and recovery receipt",
  );
};

export const verifyHistoricalDegradedRecoveryPublicationSlot = async (params: {
  readonly client: Pick<PrismaReaderSummaryClient, "$queryRaw">;
  readonly authority: HistoricalDegradedRecoveryAuthority;
  readonly binding: HistoricalDegradedRecoveryPublicationBinding;
}): Promise<"empty" | "replay"> => {
  const rows = await params.client.$queryRaw<readonly PublicationSlotState[]>`
    SELECT
      (SELECT count(*)::INTEGER
         FROM reader_summary_publications AS publication
        WHERE publication.tenant_id = ${historicalDegradedRecoveryTenantId}::UUID
          AND publication.workspace_id = ${historicalDegradedRecoveryWorkspaceId}::UUID
          AND publication.scope_type = 'workspace'
          AND publication.scope_key = 'workspace'
          AND publication.cadence = 'daily'
          AND publication.period_started_at = ${new Date(params.authority.period.startedAt)}
          AND publication.period_ended_at = ${new Date(params.authority.period.endedAt)}
          AND publication.period_timezone = 'UTC') AS "publicationCount",
      (SELECT count(*)::INTEGER
         FROM reader_summary_publications AS publication
         JOIN reader_summary_recovery_receipts AS receipt
           ON receipt.publication_id = publication.id
        WHERE publication.tenant_id = ${historicalDegradedRecoveryTenantId}::UUID
          AND publication.workspace_id = ${historicalDegradedRecoveryWorkspaceId}::UUID
          AND publication.scope_type = 'workspace'
          AND publication.scope_key = 'workspace'
          AND publication.cadence = 'daily'
          AND publication.period_started_at = ${new Date(params.authority.period.startedAt)}
          AND publication.period_ended_at = ${new Date(params.authority.period.endedAt)}
          AND publication.period_timezone = 'UTC'
          AND publication.period_key = ${params.binding.periodKey}
          AND publication.requested_utc_date = ${params.binding.requestedUtcDate}::DATE
          AND publication.publication_kind = 'EXACT'
          AND publication.id = ${params.binding.publicationId}::UUID
          AND publication.reader_summary_job_id = ${params.binding.readerSummaryJobId}::UUID
          AND publication.reader_summary_artifact_id = ${params.binding.readerSummaryArtifactId}::UUID
          AND publication.semantic_status = ${params.binding.semanticStatus}::"SummaryStatus"
          AND publication.requested_at = ${params.binding.requestedAt}::TIMESTAMPTZ
          AND publication.model_version = ${params.binding.modelVersion}
          AND publication.outbox_event_id = ${params.binding.outboxEventId}::UUID
          AND publication.report_sha256 = ${params.binding.reportSha256}
          AND publication.proof_sha256 = ${params.binding.proofSha256}
          AND publication.exact_proof = ${params.binding.exactProofJson}::JSONB
          AND publication.published_at = ${params.binding.publishedAt}::TIMESTAMPTZ
          AND receipt.reader_summary_job_id = ${params.binding.readerSummaryJobId}::UUID
          AND receipt.reader_summary_artifact_id = ${params.binding.readerSummaryArtifactId}::UUID
          AND receipt.tenant_id = ${params.binding.outboxTenantId}::UUID
          AND receipt.workspace_id = ${params.binding.outboxWorkspaceId}::UUID
          AND receipt.recovery_kind = 'SUMMARY_ONLY'
          AND receipt.provenance = ${params.binding.provenanceJson}::JSONB
          AND receipt.provenance_sha256 = ${params.binding.provenanceSha256}
          AND receipt.exact_receipt = ${params.binding.exactReceiptJson}::JSONB
          AND receipt.receipt_sha256 = ${params.binding.receiptSha256}
          AND receipt.recorded_at = ${params.binding.publishedAt}::TIMESTAMPTZ)
        AS "exactPublicationCount",
      (SELECT count(*)::INTEGER
         FROM outbox_events AS event
        WHERE event.id = ${params.binding.outboxEventId}::UUID
          AND event.message_kind = 'EVENT'
          AND event.event_type = ${params.binding.outboxEventType}
          AND event.schema_version = ${params.binding.outboxSchemaVersion}
          AND event.tenant_id = ${params.binding.outboxTenantId}::UUID
          AND event.workspace_id = ${params.binding.outboxWorkspaceId}::UUID
          AND event.payload = ${params.binding.outboxPayloadJson}::JSONB
          AND event.correlation_id = ${params.binding.outboxCorrelationId}
          AND event.causation_id = ${params.binding.outboxCausationId}
          AND event.created_at = ${params.binding.outboxCreatedAt}::TIMESTAMPTZ)
        AS "exactOutboxCount",
      (SELECT count(*)::INTEGER
         FROM reader_summary_jobs AS job
         JOIN reader_summary_artifacts AS artifact
           ON artifact.id = job.reader_summary_artifact_id
          AND artifact.tenant_id = job.tenant_id
          AND artifact.workspace_id = job.workspace_id
        WHERE job.id = ${params.binding.readerSummaryJobId}::UUID
          AND job.tenant_id = ${params.binding.outboxTenantId}::UUID
          AND job.workspace_id = ${params.binding.outboxWorkspaceId}::UUID
          AND job.status = 'COMPLETED'
          AND job.completed_at = ${params.binding.publishedAt}::TIMESTAMPTZ
          AND job.reader_summary_artifact_id =
            ${params.binding.readerSummaryArtifactId}::UUID
          AND artifact.status = 'COMPLETED') AS "completedCandidateCount",
      (SELECT count(*)::INTEGER
         FROM reader_summary_publication_slots AS slot
        WHERE slot.tenant_id = ${historicalDegradedRecoveryTenantId}::UUID
          AND slot.workspace_id = ${historicalDegradedRecoveryWorkspaceId}::UUID
          AND slot.scope_type = 'workspace'
          AND slot.scope_key = 'workspace'
          AND slot.cadence = 'daily'
          AND slot.period_started_at = ${new Date(params.authority.period.startedAt)}
          AND slot.period_ended_at = ${new Date(params.authority.period.endedAt)}
          AND slot.period_timezone = 'UTC') AS "slotCount",
      (SELECT slot.current_publication_id::TEXT
         FROM reader_summary_publication_slots AS slot
        WHERE slot.tenant_id = ${historicalDegradedRecoveryTenantId}::UUID
          AND slot.workspace_id = ${historicalDegradedRecoveryWorkspaceId}::UUID
          AND slot.scope_type = 'workspace'
          AND slot.scope_key = 'workspace'
          AND slot.cadence = 'daily'
          AND slot.period_started_at = ${new Date(params.authority.period.startedAt)}
          AND slot.period_ended_at = ${new Date(params.authority.period.endedAt)}
          AND slot.period_timezone = 'UTC') AS "currentPublicationId"
  `;
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error("Historical degraded recovery publication slot reader failed");
  }
  return assertHistoricalDegradedRecoveryPublicationSlot(
    rows[0],
    params.binding.publicationId,
  );
};
