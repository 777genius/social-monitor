import {
  runWithSystemDatabaseAccess,
  withPrismaWriteRetry,
} from '@social-monitor/platform-persistence';
import {
  causationId,
  correlationId,
  eventId,
  redactSensitiveResponseText,
  tenantId,
  workspaceId,
  type EventEnvelope,
} from '@social-monitor/shared-kernel';

import { assertEventOutboxBatchLimit, eventOutboxLeaseDuration } from '../../event-outbox-dispatch-policy';
import { EventOutboxOwnershipError, type ClaimedOutboxRecord, type OutboxStorePort } from '../../event-outbox-store';
import type { PrismaEventOutboxClient } from './prisma-event-outbox-client';
import type { PrismaEventOutboxRecord } from './prisma-event-store-client';

type ClaimedEvent = PrismaEventOutboxRecord & { readonly availableAt: Date };

export class PrismaOutboxStoreAdapter implements OutboxStorePort {
  constructor(private readonly prisma: PrismaEventOutboxClient) {}

  async claimPending(params: Parameters<OutboxStorePort['claimPending']>[0]): Promise<readonly ClaimedOutboxRecord[]> {
    assertEventOutboxBatchLimit(params.limit);
    if (params.limit === 0) return [];
    const leaseMs = eventOutboxLeaseDuration(params);
    // Row selection and ownership happen in one atomic statement. PostgreSQL
    // time is authoritative even when this request waited for a pool connection.
    const records = await runWithSystemDatabaseAccess('event outbox lease claim', () =>
      withPrismaWriteRetry(() => this.prisma.$queryRaw<readonly ClaimedEvent[]>`
        WITH eligible AS (
          SELECT "id" FROM public."outbox_events"
          WHERE "message_kind" = 'EVENT' AND "status" = 'PENDING'
            AND "available_at" <= clock_timestamp()
            AND ("leased_until" IS NULL OR "leased_until" <= clock_timestamp())
          ORDER BY "available_at" ASC, "created_at" ASC, "id" ASC
          LIMIT ${params.limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE public."outbox_events" AS event
        SET "lease_owner" = ${params.leaseOwner},
            "leased_until" = clock_timestamp() + ${leaseMs} * INTERVAL '1 millisecond'
        FROM eligible
        WHERE event."id" = eligible."id"
        RETURNING event."id", event."tenant_id" AS "tenantId",
          event."workspace_id" AS "workspaceId", event."message_kind" AS "messageKind",
          event."event_type" AS "eventType", event."schema_version" AS "schemaVersion",
          event."payload", event."status", event."correlation_id" AS "correlationId",
          event."causation_id" AS "causationId", event."created_at" AS "createdAt",
          event."published_at" AS "publishedAt", event."publish_attempts" AS "publishAttempts",
          event."last_error" AS "lastError", event."available_at" AS "availableAt"
      `),
    );
    // UPDATE RETURNING does not promise the ordering of the locked selection.
    return [...records].sort((left, right) =>
      left.availableAt.getTime() - right.availableAt.getTime() ||
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
    ).map((record) => ({
      id: record.id, publishAttempts: record.publishAttempts, event: eventEnvelopeFromPrisma(record),
    }));
  }

  async renewClaims(params: Parameters<OutboxStorePort['renewClaims']>[0]): Promise<boolean> {
    if (params.ids.length === 0) return true;
    const leaseMs = eventOutboxLeaseDuration(params);
    if (new Set(params.ids).size !== params.ids.length) {
      throw new Error('Event outbox lease renewal contains duplicate identities');
    }
    // MATERIALIZED locks first; the expiry predicate consumes that locked row.
    // A predicate on the UPDATE target alone may run before a row-lock wait.
    const count = await runWithSystemDatabaseAccess('event outbox batch lease renewal', () =>
      withPrismaWriteRetry(() => this.prisma.$executeRaw`
        WITH owned AS MATERIALIZED (
          SELECT "id", "leased_until" FROM public."outbox_events"
          WHERE "id" = ANY(${params.ids}::uuid[])
            AND "message_kind" = 'EVENT' AND "status" = 'PENDING'
            AND "lease_owner" = ${params.leaseOwner}
          ORDER BY "id" FOR UPDATE
        )
        UPDATE public."outbox_events" AS event
        SET "leased_until" = clock_timestamp() + ${leaseMs} * INTERVAL '1 millisecond'
        FROM owned WHERE event."id" = owned."id"
          AND owned."leased_until" > clock_timestamp()
      `),
    );
    return count === params.ids.length;
  }

  async recordAttempt(params: Parameters<OutboxStorePort['recordAttempt']>[0]): Promise<number> {
    const rows = await runWithSystemDatabaseAccess('event outbox dispatch start', () =>
      withPrismaWriteRetry(() => this.prisma.$queryRaw<readonly { publishAttempts: number }[]>`
        WITH owned AS MATERIALIZED (
          SELECT "id", "leased_until" FROM public."outbox_events"
          WHERE "id" = ${params.id}::uuid
            AND "message_kind" = 'EVENT' AND "status" = 'PENDING'
            AND "lease_owner" = ${params.leaseOwner}
          FOR UPDATE
        )
        UPDATE public."outbox_events" AS event
        SET "publish_attempts" = event."publish_attempts" + 1,
            "last_error" = 'Dispatch started; outcome unknown. Earlier uninstrumented attempts unknown.'
        FROM owned WHERE event."id" = owned."id"
          AND owned."leased_until" > clock_timestamp()
        RETURNING event."publish_attempts" AS "publishAttempts"
      `),
    );
    assertSingleOwnedEvent(rows.length);
    return rows[0]!.publishAttempts;
  }

  async markPublished(params: Parameters<OutboxStorePort['markPublished']>[0]): Promise<void> {
    const count = await runWithSystemDatabaseAccess('event outbox publish acknowledgement', () =>
      withPrismaWriteRetry(() => this.prisma.$executeRaw`
        WITH owned AS MATERIALIZED (
          SELECT "id", "leased_until" FROM public."outbox_events"
          WHERE "id" = ${params.id}::uuid
            AND "message_kind" = 'EVENT' AND "status" = 'PENDING'
            AND "lease_owner" = ${params.leaseOwner}
          FOR UPDATE
        )
        UPDATE public."outbox_events" AS event
        SET "status" = 'PUBLISHED', "published_at" = ${params.publishedAt},
            "last_error" = NULL, "lease_owner" = NULL, "leased_until" = NULL
        FROM owned WHERE event."id" = owned."id"
          AND owned."leased_until" > clock_timestamp()
      `),
    );
    assertSingleOwnedEvent(count);
  }

  async markFailed(params: Parameters<OutboxStorePort['markFailed']>[0]): Promise<void> {
    const delayMs = params.availableAt.getTime() - params.failedAt.getTime();
    if (!Number.isSafeInteger(delayMs) || delayMs < 0) throw new Error('Invalid event outbox retry delay');
    const reason = redactSensitiveResponseText(params.reason).replace(/[\r\n\t]/g, ' ').slice(0, 500);
    const count = await runWithSystemDatabaseAccess('event outbox failure acknowledgement', () =>
      withPrismaWriteRetry(() => this.prisma.$executeRaw`
        WITH owned AS MATERIALIZED (
          SELECT "id", "leased_until" FROM public."outbox_events"
          WHERE "id" = ${params.id}::uuid
            AND "message_kind" = 'EVENT' AND "status" = 'PENDING'
            AND "lease_owner" = ${params.leaseOwner}
          FOR UPDATE
        )
        UPDATE public."outbox_events" AS event
        SET "status" = (CASE WHEN ${params.terminal} THEN 'FAILED' ELSE 'PENDING' END)::"OutboxStatus",
            "available_at" = clock_timestamp() + ${delayMs} * INTERVAL '1 millisecond',
            "last_error" = ${reason}, "published_at" = NULL,
            "lease_owner" = NULL, "leased_until" = NULL
        FROM owned WHERE event."id" = owned."id"
          AND owned."leased_until" > clock_timestamp()
      `),
    );
    assertSingleOwnedEvent(count);
  }
}

const eventEnvelopeFromPrisma = (
  record: PrismaEventOutboxRecord,
): EventEnvelope<Readonly<Record<string, unknown>>> => ({
  eventId: eventId(record.id),
  eventType: record.eventType,
  schemaVersion: record.schemaVersion,
  occurredAt: record.createdAt,
  tenantId: record.tenantId === null ? undefined : tenantId(record.tenantId),
  workspaceId: record.workspaceId === null ? undefined : workspaceId(record.workspaceId),
  correlationId: correlationId(record.correlationId),
  causationId: record.causationId === null ? undefined : causationId(record.causationId),
  payload: record.payload !== null && typeof record.payload === 'object' && !Array.isArray(record.payload)
    ? record.payload as Readonly<Record<string, unknown>> : { value: record.payload },
});

const assertSingleOwnedEvent = (count: number): void => {
  if (count !== 1) throw new EventOutboxOwnershipError();
};
