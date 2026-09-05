import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixedClock } from '@social-monitor/shared-kernel';
import { readerSummaryReadyFixture } from '@social-monitor/delivery/test-support/reader-summary-ready.fixture';
import { ProjectReaderSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';
import { parseReaderSummaryReadyEvent } from '@social-monitor/delivery/interfaces/events/reader-summary-ready-event.parser';
import { encodeRealtimeReplayCursor } from '@social-monitor/delivery/domain';
import { READER_SUMMARY_READY_CONSUMER } from '@social-monitor/delivery/application/contracts/reader-summary-ready-projection-store';
import { RabbitMqEventPublisher } from '@social-monitor/platform-events/adapters/rabbitmq';
import { canonicalSha256, bytesSha256, originalEnvelope, type RecoveryEntry, type RecoveryManifest } from './reader-summary-ready-recovery-manifest';
import { recoveryPersistence, type RecoveryDatabase } from './reader-summary-ready-recovery-persistence';
import type { RecoverySnapshot } from './reader-summary-ready-recovery-evidence';
import { createRecoveryEvidenceFilesystemTestHarness } from './reader-summary-recovery-evidence-secure-file';
import { recoveryReceipts } from './reader-summary-ready-recovery-receipts';
import { runReadyRecovery } from './reader-summary-ready-recovery-run';

export function readyRecoveryFixture(count = 1) {
  const directory = mkdtempSync(join(tmpdir(), 'reader-ready-recovery-'));
  const files = createRecoveryEvidenceFilesystemTestHarness(directory);
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
    const proof = { reportSha256: canonicalSha256(report), tenantId: scope.tenantId, workspaceId: scope.workspaceId,
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
  const db: RecoveryDatabase = {
    $disconnect: async () => undefined, $transaction: async work => work(db),
    $queryRawUnsafe: async <T>(_sql: string, ...values: readonly unknown[]): Promise<T> => {
      const s = snapshots.find(s => s.row.id === values[0]);
      return (s ? [{ version: canonicalSha256({ ...s.row, rowVersion: undefined }) }] : []) as T;
    },
    outboxEvent: { findUnique: async args => copy(snapshots.find(s => s.row.id === args.where.id)?.row ?? null),
      update: jest.fn(async args => {
        const s = snapshots.find(s => s.row.id === args.where.id)!;
        const { publishAttempts, ...data } = args.data;
        s.row = { ...s.row, ...data, publishAttempts: s.row.publishAttempts + (publishAttempts?.increment ?? 0) };
        return copy(s.row);
      }) },
    readerSummaryPublication: { findUnique: async args => copy(snapshots.find(s => s.row.id === args.where.outboxEventId)?.publication ?? null) },
    inboxRecord: { findUnique: async args => copy(snapshots.find(s => s.row.id === args.where.consumerName_eventId.eventId)?.inbox ?? null) },
    realtimeEvent: { findMany: async args => copy(snapshots.flatMap(s => s.projections).filter(p => args.where.OR.some(clause => {
      const c = clause as { id?: string; tenantId?: string; workspaceId?: string; payload?: { equals: string } };
      return c.id === p.id || (c.tenantId === p.tenantId && c.workspaceId === p.workspaceId && c.payload?.equals ===
        (p.payload as Record<string, unknown>).readerSummaryId);
    }))) },
  };
  const consume = async (index = 0) => {
    const s = snapshots[index]!;
    if (s.inbox !== null) return;
    const result = await new ProjectReaderSummaryReadyEventUseCase({ project: async incoming => {
      const { sourceEventId, ...projection } = incoming;
      const projectionId = id(700 + index);
      s.inbox = { id: projectionId, consumerName: READER_SUMMARY_READY_CONSUMER, eventId: sourceEventId,
        tenantId: projection.tenantId, schemaVersion: 1, processedAt: clock.now() };
      s.projections = [{ ...projection, id: projectionId, sequence: index + 1, replayCursor: encodeRealtimeReplayCursor(index + 1) }];
      return { realtimeEventId: projectionId, channel: projection.channel, sequence: index + 1, duplicate: false };
    } }).execute({ event: parseReaderSummaryReadyEvent(originalEnvelope(s.row)) });
    if (!result.ok) throw result.error;
  };
  const channel = { assertExchange: jest.fn(async () => undefined), assertQueue: jest.fn(), bindQueue: jest.fn(),
    publish: jest.fn(async () => true), waitForConfirms: jest.fn(async () => { await consume(); }) };
  const persistence = recoveryPersistence(db, clock);
  const options = () => { const bytes = Buffer.from(JSON.stringify(manifest)); return { bytes, reviewedSha256: bytesSha256(bytes),
    deployedSha: manifest.deployedSourceSha, apply: true, clock, persistence,
    publisher: new RabbitMqEventPublisher(channel, { exchange: 'social-monitor.events' }), sleep: async () => undefined,
    receipts: (m: RecoveryManifest, b: Buffer) => recoveryReceipts(m, b, files) }; };
  return { directory, manifest, snapshots, db, persistence, channel, consume, options,
    run: (apply = true) => runReadyRecovery({ ...options(), apply }),
    receipt: (name: string) => readFileSync(join(directory, 'reader-summary-ready-recovery', manifest.operationId, `${name}.json`), 'utf8'),
    cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (key: string, child: unknown) =>
    typeof child === 'string' && ['createdAt', 'availableAt', 'publishedAt', 'processedAt', 'occurredAt',
      'periodStartedAt', 'periodEndedAt', 'leasedUntil'].includes(key) ? new Date(child) : child) as T;
}
