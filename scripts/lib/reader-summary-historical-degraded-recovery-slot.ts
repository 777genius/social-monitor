import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { buildReaderSummaryPublicationPayload } from "@social-monitor/summary/adapters/persistence/reader-summary-publication-proof";
import { buildReaderSummaryRecoveryReceiptPayload } from "@social-monitor/summary/adapters/persistence/reader-summary-recovery-receipt";
import type { ReaderSummaryRecoveryFinalizationCommand } from "@social-monitor/summary/ports";

import {
  historicalDegradedRecoveryTenantId,
  historicalDegradedRecoveryWorkspaceId,
  type HistoricalDegradedRecoveryAuthority,
} from "./reader-summary-historical-degraded-recovery-authority";

export type HistoricalDegradedRecoveryPublicationBinding = Readonly<{
  publicationId: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  outboxEventId: string;
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
  slotCount: number;
  currentPublicationId: string | null;
}>;

export const historicalDegradedRecoveryPublicationBinding = (
  command: ReaderSummaryRecoveryFinalizationCommand,
): HistoricalDegradedRecoveryPublicationBinding => {
  const publication = buildReaderSummaryPublicationPayload(command.publication);
  const receipt = buildReaderSummaryRecoveryReceiptPayload({
    publication,
    provenance: command.provenance,
  });
  return Object.freeze({
    publicationId: publication.readerSummaryArtifactId,
    readerSummaryJobId: publication.readerSummaryJobId,
    readerSummaryArtifactId: publication.readerSummaryArtifactId,
    outboxEventId: command.publication.readyEvent.eventId,
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
    !Number.isSafeInteger(state.slotCount) ||
    state.publicationCount < 0 ||
    state.exactPublicationCount < 0 ||
    state.slotCount < 0
  ) {
    throw new Error("Historical degraded recovery publication slot reader failed");
  }
  if (
    state.publicationCount === 0 &&
    state.exactPublicationCount === 0 &&
    state.currentPublicationId === null
  ) {
    return "empty";
  }
  if (
    state.publicationCount === 1 &&
    state.exactPublicationCount === 1 &&
    state.slotCount === 1 &&
    state.currentPublicationId === expectedPublicationId
  ) {
    return "replay";
  }
  throw new Error(
    "Historical degraded recovery requires an empty slot or the exact publication and recovery receipt",
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
          AND receipt.recovery_kind = 'SUMMARY_ONLY'
          AND receipt.provenance = ${params.binding.provenanceJson}::JSONB
          AND receipt.provenance_sha256 = ${params.binding.provenanceSha256}
          AND receipt.exact_receipt = ${params.binding.exactReceiptJson}::JSONB
          AND receipt.receipt_sha256 = ${params.binding.receiptSha256}
          AND receipt.recorded_at = ${params.binding.publishedAt}::TIMESTAMPTZ)
        AS "exactPublicationCount",
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
