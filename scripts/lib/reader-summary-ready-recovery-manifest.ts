import { createHash } from 'node:crypto';
import { z } from 'zod';
import { causationId, correlationId, eventId, tenantId, workspaceId, type EventEnvelope } from '@social-monitor/shared-kernel';
import { stablePublicationJson } from '@social-monitor/summary/adapters/persistence/reader-summary-publication-proof';
import { deepFreezeReaderSummaryWeekly } from '@social-monitor/summary/domain/value-objects/reader-summary-weekly-canonical-json';
import type { PrismaEventOutboxRecord } from '@social-monitor/platform-events/adapters/prisma/prisma-event-store-client';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const timestamp = z.string().refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
const identity = z.string().min(1).max(300).refine(v => v.trim() === v);
const entry = z.object({
  eventId: uuid, tenantId: uuid, workspaceId: uuid, createdAt: timestamp,
  correlationId: identity, causationId: identity.nullable(), readerSummaryId: uuid, readerSummaryJobId: uuid,
  messageKind: z.literal('EVENT'), eventType: z.literal('reader_summary.ready'), schemaVersion: z.literal(1),
  expectedStatus: z.literal('FAILED'), payloadSha256: digest, reportSha256: digest, proofSha256: digest,
}).strict();
const schema = z.object({
  operationId: uuid, deployedSourceSha: z.string().regex(/^[0-9a-f]{40}$/),
  window: z.object({ startedAt: timestamp, expiresAt: timestamp }).strict(),
  preconditions: z.object({ relayQuiesced: z.literal(true), exclusiveOperation: z.literal(true),
    consumerReady: z.literal(true), bindingsVerified: z.literal(true), retentionHeld: z.literal(true) }).strict(),
  events: z.array(entry).min(1).max(17),
}).strict();
export type RecoveryManifest = z.infer<typeof schema>;
export type RecoveryEntry = RecoveryManifest['events'][number];
export type RecoveryRow = PrismaEventOutboxRecord & {
  readonly availableAt: Date; readonly leaseOwner: string | null; readonly leasedUntil: Date | null; readonly rowVersion: string;
};
export class RecoveryError extends Error {}
export function requireRecovery(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RecoveryError(code);
}
export const bytesSha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
export const canonicalSha256 = (value: unknown): string => bytesSha256(stablePublicationJson(value));
export const failureCode = (error: unknown): string => error instanceof RecoveryError ? error.message : 'dependency_failed';

export function parseRecoveryManifest(bytes: Buffer, reviewedSha256: string): RecoveryManifest {
  requireRecovery(bytes.length <= 65_536 && bytesSha256(bytes) === reviewedSha256, 'manifest_digest_mismatch');
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new RecoveryError('manifest_invalid'); }
  const parsed = schema.safeParse(value);
  requireRecovery(parsed.success, 'manifest_invalid');
  const manifest = parsed.data;
  requireRecovery(new Set(manifest.events.map(e => e.eventId)).size === manifest.events.length, 'duplicate_allowlist');
  const span = Date.parse(manifest.window.expiresAt) - Date.parse(manifest.window.startedAt);
  requireRecovery(span > 0 && span <= 3_600_000, 'invalid_operation_window');
  return deepFreezeReaderSummaryWeekly(manifest);
}
export function assertRecoveryWindow(manifest: RecoveryManifest, deployedSha: string, now: Date): void {
  requireRecovery(manifest.deployedSourceSha === deployedSha, 'deployed_source_mismatch');
  requireRecovery(now.getTime() >= Date.parse(manifest.window.startedAt) &&
    now.getTime() < Date.parse(manifest.window.expiresAt), 'operation_window_closed');
}
export function originalEnvelope(row: RecoveryRow): EventEnvelope<Readonly<Record<string, unknown>>> {
  requireRecovery(row.payload !== null && typeof row.payload === 'object' && !Array.isArray(row.payload), 'payload_invalid');
  requireRecovery(row.tenantId !== null && row.workspaceId !== null, 'scope_missing');
  return { eventId: eventId(row.id), eventType: row.eventType, schemaVersion: row.schemaVersion,
    occurredAt: row.createdAt, tenantId: tenantId(row.tenantId), workspaceId: workspaceId(row.workspaceId),
    correlationId: correlationId(row.correlationId),
    ...(row.causationId === null ? {} : { causationId: causationId(row.causationId) }),
    payload: row.payload as Readonly<Record<string, unknown>> };
}
