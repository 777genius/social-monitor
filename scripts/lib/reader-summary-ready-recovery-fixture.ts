import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectReaderSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';
import { parseReaderSummaryReadyEvent } from '@social-monitor/delivery/interfaces/events/reader-summary-ready-event.parser';
import { encodeRealtimeReplayCursor } from '@social-monitor/delivery/domain';
import { READER_SUMMARY_READY_CONSUMER } from '@social-monitor/delivery/application/contracts/reader-summary-ready-projection-store';
import { RabbitMqEventPublisher } from '@social-monitor/platform-events/adapters/rabbitmq';
import { canonicalSha256, bytesSha256, originalEnvelope, type RecoveryManifest } from './reader-summary-ready-recovery-manifest';
import { recoveryPersistence, type RecoveryDatabase } from './reader-summary-ready-recovery-persistence';
import { readyRecoveryData } from './reader-summary-ready-recovery-data';
import { createRecoveryEvidenceFilesystemTestHarness } from './reader-summary-recovery-evidence-secure-file';
import { recoveryReceipts } from './reader-summary-ready-recovery-receipts';
import { runReadyRecovery } from './reader-summary-ready-recovery-run';

export function readyRecoveryFixture(count = 1) {
  const directory = mkdtempSync(join(tmpdir(), 'reader-ready-recovery-'));
  const files = createRecoveryEvidenceFilesystemTestHarness(directory);
  const { clock, id, snapshots, manifest } = readyRecoveryData(count);
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
  let cancelled = false;
  const cancelPendingPublishes = () => { cancelled = true; };
  const channel = { assertExchange: jest.fn(async () => undefined), assertQueue: jest.fn(), bindQueue: jest.fn(),
    publish: jest.fn(async () => { if (cancelled) throw new Error('Publishing cancelled'); return true; }),
    waitForConfirms: jest.fn(async () => { await consume(); }) };
  const persistence = recoveryPersistence(db, clock);
  const options = () => { const bytes = Buffer.from(JSON.stringify(manifest)); return { bytes, reviewedSha256: bytesSha256(bytes),
    deployedSha: manifest.deployedSourceSha, apply: true, clock, persistence,
    publisher: new RabbitMqEventPublisher(channel, { exchange: 'social-monitor.events' }), cancelPendingPublishes, sleep: async () => undefined,
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
