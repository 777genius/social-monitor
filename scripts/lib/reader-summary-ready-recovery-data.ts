import { FixedClock } from '@social-monitor/shared-kernel';
import { readerSummaryReadyFixture } from '@social-monitor/delivery/test-support/reader-summary-ready.fixture';
import { canonicalSha256, type originalEnvelope, type RecoveryEntry, type RecoveryManifest } from './reader-summary-ready-recovery-manifest';
import type { RecoverySnapshot } from './reader-summary-ready-recovery-evidence';

// Synthetic publication data shared by focused unit tests and the native PG gate.
export function readyRecoveryData(count = 1) {
  const clock = new FixedClock(new Date('2026-09-05T01:00:00.000Z'));
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const snapshots: RecoverySnapshot[] = Array.from({ length: count }, (_, index) => {
    const event = JSON.parse(JSON.stringify(readerSummaryReadyFixture())) as ReturnType<typeof originalEnvelope>;
    const payload = { ...event.payload, readerSummaryId: id(100 + index), readerSummaryJobId: id(200 + index),
      userId: 'synthetic-user', subscriptionId: id(300 + index) };
    const scope = { tenantId: event.tenantId!, workspaceId: event.workspaceId!, scopeType: 'workspace', scopeKey: 'workspace',
      cadence: 'daily', periodStartedAt: new Date('2026-09-03T00:00:00.000Z'), periodEndedAt: new Date('2026-09-04T00:00:00.000Z'),
      periodTimezone: 'UTC', periodKey: readerSummaryReadyFixture().payload.period.periodKey };
    const artifact = { ...scope, id: payload.readerSummaryId, status: 'COMPLETED', modelVersion: 'synthetic', promptVersion: 'fixture',
      headline: 'Synthetic report', summaryText: 'Synthetic summary', artifactPayload: { fixture: true }, citations: [], qualitySignals: {} };
    const report = { schemaVersion: 'reader_summary.publication_report.v1', semanticStatus: 'COMPLETED',
      modelVersion: artifact.modelVersion, promptVersion: artifact.promptVersion, headline: artifact.headline,
      summaryText: artifact.summaryText, artifactPayload: artifact.artifactPayload, citations: [], qualitySignals: {} };
    const proof = { schemaVersion: 'reader_summary.publication_proof.v1', reportSha256: canonicalSha256(report), tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      readerSummaryJobId: payload.readerSummaryJobId, readerSummaryArtifactId: payload.readerSummaryId,
      semanticStatus: 'COMPLETED', period: event.payload.period };
    return { row: { id: id(400 + index), tenantId: scope.tenantId, workspaceId: scope.workspaceId, messageKind: 'EVENT', eventType: 'reader_summary.ready', schemaVersion: 1,
      payload, status: 'FAILED', correlationId: payload.readerSummaryJobId, causationId: payload.readerSummaryJobId,
      createdAt: new Date(event.occurredAt), availableAt: new Date(event.occurredAt), publishedAt: null, publishAttempts: 0,
      lastError: 'NO_ROUTE access_token=fixture-secret\n' + 'x'.repeat(600), leaseOwner: null, leasedUntil: null, rowVersion: 'initial' },
    publication: { ...scope, id: id(500 + index), outboxEventId: id(400 + index), readerSummaryArtifactId: payload.readerSummaryId,
      readerSummaryJobId: payload.readerSummaryJobId, semanticStatus: 'COMPLETED', publishedAt: new Date(event.occurredAt),
      reportSha256: canonicalSha256(report), proofSha256: canonicalSha256(proof), exactProof: proof,
      readerSummaryArtifact: artifact, readerSummaryJob: { ...scope, id: payload.readerSummaryJobId,
        readerSummaryArtifactId: payload.readerSummaryId, status: 'COMPLETED' } }, inbox: null, projections: [] };
  });
  const entries: RecoveryEntry[] = snapshots.map(({ row, publication: p }) => ({ eventId: row.id, tenantId: row.tenantId!,
    workspaceId: row.workspaceId!, createdAt: row.createdAt.toISOString(), correlationId: row.correlationId, causationId: row.causationId,
    readerSummaryId: p!.readerSummaryArtifactId, readerSummaryJobId: p!.readerSummaryJobId!, messageKind: 'EVENT',
    eventType: 'reader_summary.ready', schemaVersion: 1, expectedStatus: 'FAILED', payloadSha256: canonicalSha256(row.payload),
    reportSha256: p!.reportSha256, proofSha256: p!.proofSha256 }));
  const manifest: RecoveryManifest = { operationId: id(600), deployedSourceSha: 'a'.repeat(40),
    window: { startedAt: '2026-09-05T00:59:00.000Z', expiresAt: '2026-09-05T01:59:00.000Z' },
    preconditions: { relayQuiesced: true, exclusiveOperation: true, consumerReady: true, bindingsVerified: true, retentionHeld: true }, events: entries };
  return { clock, id, snapshots, manifest };
}
