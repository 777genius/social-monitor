import { redactSensitiveResponseText } from '@social-monitor/shared-kernel';
import type { PrismaInboxRecord } from '@social-monitor/platform-events/adapters/prisma/prisma-event-store-client';
import { parseReaderSummaryReadyEvent } from '@social-monitor/delivery/interfaces/events/reader-summary-ready-event.parser';
import { ProjectReaderSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';
import { assertSameReaderSummaryProjection } from '@social-monitor/delivery/adapters/persistence/reader-summary-projection-identity';
import { realtimeEventFromPrisma, type PrismaRealtimeEventRecord } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-delivery-records';
import { encodeRealtimeReplayCursor } from '@social-monitor/delivery/domain';
import { READER_SUMMARY_READY_CONSUMER } from '@social-monitor/delivery/application/contracts/reader-summary-ready-projection-store';
import { canonicalSha256, originalEnvelope, requireRecovery, type RecoveryEntry, type RecoveryRow } from './reader-summary-ready-recovery-manifest';

type PublicationScope = {
  tenantId: string; workspaceId: string; scopeType: string; scopeKey: string; cadence: string;
  periodStartedAt: Date; periodEndedAt: Date; periodTimezone: string; periodKey: string;
};
export type RecoveryPublication = PublicationScope & {
  id: string; outboxEventId: string | null; readerSummaryArtifactId: string; readerSummaryJobId: string | null;
  semanticStatus: string; publishedAt: Date; reportSha256: string; proofSha256: string; exactProof: unknown;
  readerSummaryJob: (PublicationScope & { id: string; readerSummaryArtifactId: string | null; status: string }) | null;
  readerSummaryArtifact: PublicationScope & { id: string; status: string; modelVersion: string; promptVersion: string;
    headline: string; summaryText: string | null; artifactPayload: unknown; citations: unknown; qualitySignals: unknown };
};
export type RecoverySnapshot = { row: RecoveryRow; publication: RecoveryPublication | null;
  inbox: PrismaInboxRecord | null; projections: readonly PrismaRealtimeEventRecord[] };

export async function validateRecoveryEvidence(entry: RecoveryEntry, snapshot: RecoverySnapshot): Promise<string | null> {
  const { row, publication: p, inbox, projections } = snapshot;
  requireRecovery(row.id === entry.eventId && row.tenantId === entry.tenantId && row.workspaceId === entry.workspaceId &&
    row.messageKind === entry.messageKind && row.eventType === entry.eventType && row.schemaVersion === entry.schemaVersion &&
    row.createdAt.toISOString() === entry.createdAt && row.correlationId === entry.correlationId &&
    row.causationId === entry.causationId && canonicalSha256(row.payload) === entry.payloadSha256, 'outbox_identity_mismatch');
  const event = parseReaderSummaryReadyEvent(originalEnvelope(row));
  const payload = event.payload;
  requireRecovery(payload.readerSummaryId === entry.readerSummaryId && payload.readerSummaryJobId === entry.readerSummaryJobId,
    'reader_identity_mismatch');
  requireRecovery(p !== null && p.outboxEventId === row.id && p.readerSummaryArtifactId === entry.readerSummaryId &&
    p.readerSummaryJobId === entry.readerSummaryJobId && p.reportSha256 === entry.reportSha256 &&
    p.proofSha256 === entry.proofSha256 && canonicalSha256(p.exactProof) === entry.proofSha256 &&
    p.semanticStatus.toLowerCase() === payload.status && p.publishedAt.getTime() === row.createdAt.getTime(), 'publication_mismatch');
  const proof = p.exactProof as Record<string, unknown>;
  requireRecovery(proof.schemaVersion === 'reader_summary.publication_proof.v1' &&
    proof.tenantId === entry.tenantId && proof.workspaceId === entry.workspaceId &&
    proof.readerSummaryJobId === entry.readerSummaryJobId && proof.readerSummaryArtifactId === entry.readerSummaryId &&
    proof.reportSha256 === entry.reportSha256 && proof.semanticStatus === p.semanticStatus &&
    canonicalSha256(proof.period) === canonicalSha256(payload.period), 'publication_proof_binding_mismatch');
  const a = p.readerSummaryArtifact;
  const j = p.readerSummaryJob;
  // Supersession changes artifact visibility only. The original semantic job,
  // publication, report and proof remain bound to this exact historical event.
  requireRecovery(j !== null && j.id === entry.readerSummaryJobId && j.readerSummaryArtifactId === entry.readerSummaryId &&
    a.id === entry.readerSummaryId && (a.status === p.semanticStatus || a.status === 'SUPERSEDED') &&
    j.status === p.semanticStatus, 'publication_links_mismatch');
  for (const scoped of [p, a, j]) {
    requireRecovery(scoped.tenantId === entry.tenantId && scoped.workspaceId === entry.workspaceId &&
      scoped.scopeType === payload.scope.type && scoped.scopeKey === (payload.scope.type === 'workspace' ? 'workspace' : `interest:${payload.scope.interestId}`) &&
      scoped.cadence === payload.period.cadence && scoped.periodStartedAt.getTime() === payload.period.startedAt.getTime() &&
      scoped.periodEndedAt.getTime() === payload.period.endedAt.getTime() && scoped.periodTimezone === payload.period.timezone &&
      scoped.periodKey === payload.period.periodKey, 'publication_scope_mismatch');
  }
  requireRecovery(canonicalSha256({ schemaVersion: 'reader_summary.publication_report.v1', semanticStatus: p.semanticStatus,
    modelVersion: a.modelVersion, promptVersion: a.promptVersion, headline: a.headline, summaryText: a.summaryText,
    artifactPayload: a.artifactPayload, citations: a.citations, qualitySignals: a.qualitySignals }) === entry.reportSha256,
  'publication_report_mismatch');
  if (inbox === null) { requireRecovery(projections.length === 0, 'orphan_projection'); return null; }
  requireRecovery(inbox.consumerName === READER_SUMMARY_READY_CONSUMER && inbox.eventId === entry.eventId &&
    inbox.tenantId === entry.tenantId && inbox.schemaVersion === 1 && projections.length === 1 &&
    projections[0]?.id === inbox.id, 'retained_inbox_mismatch');
  const existing = realtimeEventFromPrisma(projections[0]).toSnapshot();
  requireRecovery(existing.replayCursor === encodeRealtimeReplayCursor(existing.sequence), 'retained_cursor_mismatch');
  // Reuse the consumer's projection construction without invoking its write store.
  const result = await new ProjectReaderSummaryReadyEventUseCase({ project: async incoming => {
    assertSameReaderSummaryProjection(existing, incoming);
    return { realtimeEventId: existing.id, channel: existing.channel, sequence: existing.sequence, duplicate: true };
  } }).execute({ event });
  requireRecovery(result.ok, 'retained_projection_mismatch');
  return inbox.id;
}
export function recoveryBefore(snapshot: RecoverySnapshot, entry: RecoveryEntry): object {
  const { payload: _payload, lastError, ...metadata } = snapshot.row;
  void _payload;
  return { ...metadata, payloadSha256: entry.payloadSha256, reportSha256: entry.reportSha256, proofSha256: entry.proofSha256,
    lastError: lastError === null ? null : redactSensitiveResponseText(lastError).replace(/[\r\n\t]/g, ' '),
    historicalAttempts: 'unknown', inbox: snapshot.inbox,
    projections: snapshot.projections.map(p => ({ id: p.id, sequence: p.sequence, replayCursor: p.replayCursor,
      identitySha256: canonicalSha256(p) })) };
}
