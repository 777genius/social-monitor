import { err, ok } from '@social-monitor/shared-kernel';
import { runWithTenantDatabaseAccess, withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import { captureRetainedSourceContent, readRetainedSourceContentCapture } from '../../../domain/value-objects/retained-source-content-capture';
import { readContentCapture } from '../../../domain/value-objects/source-content-capture';
import { sourceItemProviderContentHash } from '../../../domain/value-objects/source-item-content-fingerprint';
import type { RetainedCaptureBatch, RetainedCaptureReceipt, RetainedSourceCaptureRepository } from '../../../ports/retained-source-capture-repository';
import { sourceItemFromPrisma, type PrismaSourceItemRecord } from './prisma-ingestion-records';

export interface RetainedCaptureSqlTransaction {
  $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
}
export interface RetainedCaptureSqlClient extends RetainedCaptureSqlTransaction {
  $transaction<T>(operation: (tx: RetainedCaptureSqlTransaction) => Promise<T>, options: {
    isolationLevel: 'Serializable'; timeout: number; maxWait: number;
  }): Promise<T>;
}
type LockedSource = { readonly row: Record<string, unknown>; readonly digest: string };
class Refused extends Error {
  constructor(readonly code: 'source_changed' | 'unsupported_capture') { super(code); }
}

/** Metadata-only CAS. Caller must hold the existing external admission/quiet lock.
 * The jobs read refuses known reservations; it is not a mutex against unrelated
 * ReadCommitted API job creation. Serializable/row locks fence source mutations.
 */
export class PrismaRetainedSourceCaptureRepository implements RetainedSourceCaptureRepository {
  constructor(private readonly client: RetainedCaptureSqlClient) {}

  async materialize(batch: RetainedCaptureBatch): ReturnType<RetainedSourceCaptureRepository['materialize']> {
    if (!validBatch(batch)) return err('invalid_batch');
    try {
      return await runWithTenantDatabaseAccess(batch, () => withPrismaWriteRetry(() =>
        this.client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2000ms'");
          const busy = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM reader_summary_jobs
            WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND
              (status IN ('REQUESTED','RUNNING') OR
                (period_started_at=$3::timestamptz AND period_ended_at=$4::timestamptz)) LIMIT 1`,
          batch.tenantId, batch.workspaceId, batch.periodStartedAt, batch.periodEndedAt);
          if (busy.length !== 0) throw new Refused('source_changed');
          const locked = await tx.$queryRawUnsafe<LockedSource[]>(`SELECT row_to_json(s) AS row,
            encode(sha256(convert_to(row_to_json(s)::text,'UTF8')),'hex') AS digest
            FROM source_items s WHERE s.tenant_id=$1::uuid AND s.workspace_id=$2::uuid
              AND s.id=ANY($3::uuid[]) AND s.provider_key IN ('hacker-news','reddit','rss','x-twitter')
              AND jsonb_typeof(s.metadata)='object'
              AND length(trim(s.title)||trim(s.body))>0
              AND (SELECT sum(octet_length(row_to_json(sized)::text)) FROM source_items sized
                WHERE sized.tenant_id=$1::uuid AND sized.workspace_id=$2::uuid AND sized.id=ANY($3::uuid[])) <= 33554432
              AND COALESCE(s.metadata->>'deleted','false')<>'true'
              AND COALESCE(s.metadata->>'dead','false')<>'true'
              AND COALESCE(s.metadata->>'banned','false')<>'true'
              AND EXISTS (SELECT 1 FROM feed_items f
                JOIN source_bindings b ON b.tenant_id=f.tenant_id AND b.workspace_id=f.workspace_id
                  AND b.id=f.source_binding_id AND b.interest_id=f.interest_id
                  AND b.status='ENABLED' AND b.deleted_at IS NULL
                JOIN source_catalog_entries c ON c.id=b.source_catalog_entry_id AND c.provider_key=s.provider_key
                JOIN interests i ON i.tenant_id=f.tenant_id AND i.workspace_id=f.workspace_id
                  AND i.id=f.interest_id AND i.status='ENABLED' AND i.deleted_at IS NULL
                JOIN workspaces w ON w.tenant_id=i.tenant_id AND w.id=i.workspace_id AND w.deleted_at IS NULL
                JOIN tenants t ON t.id=w.tenant_id AND t.deleted_at IS NULL
                WHERE f.tenant_id=s.tenant_id AND f.workspace_id=s.workspace_id AND f.source_item_id=s.id
                  AND f.provider_key=s.provider_key AND f.interest_id=$4::uuid AND f.status='VISIBLE'
                  AND f.published_at >= $5::timestamptz AND f.published_at < $6::timestamptz
                  AND NOT EXISTS (SELECT 1 FROM feed_items revoked WHERE revoked.tenant_id=f.tenant_id
                    AND revoked.workspace_id=f.workspace_id AND revoked.interest_id=f.interest_id
                    AND revoked.source_item_id=f.source_item_id AND revoked.status='TOMBSTONED'))
            ORDER BY s.id FOR UPDATE OF s`, batch.tenantId, batch.workspaceId,
          batch.targets.map((t) => t.sourceItemId), batch.interestId, batch.periodStartedAt, batch.periodEndedAt);
          if (locked.length !== batch.targets.length) throw new Refused('source_changed');
          const planned = locked.map((value) => {
            const record = recordFromRow(value.row);
            const target = batch.targets.find((t) => t.sourceItemId === record.id);
            if (target?.expectedRowSha256 !== value.digest) throw new Refused('source_changed');
            const snapshot = sourceItemFromPrisma(record).toSnapshot();
            const valid = readContentCapture(snapshot) !== undefined ||
              readRetainedSourceContentCapture({ ...snapshot, providerKey: record.providerKey }) !== undefined;
            if (!valid && snapshot.metadata?.contentCapture !== undefined) throw new Refused('unsupported_capture');
            return { record, snapshot, valid };
          });
          const times = await tx.$queryRawUnsafe<{ now: string }[]>(
            `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`);
          const now = times[0]?.now;
          if (now === undefined) throw new Error('Retained capture requires database clock');
          const materialized: RetainedCaptureReceipt['materialized'][number][] = [];
          const skipped: string[] = [];
          for (const item of planned) {
            if (item.valid) { skipped.push(item.record.id); continue; }
            const capture = captureRetainedSourceContent({ ...item.snapshot, providerKey: item.record.providerKey }, now);
            const fingerprint = sourceItemProviderContentHash({ providerKey: item.record.providerKey,
              snapshot: { ...item.snapshot, metadata: { ...item.snapshot.metadata, contentCapture: capture } } });
            // jsonb_set preserves unrelated stored metadata without JS numeric round trips.
            const changed = await tx.$executeRawUnsafe(`UPDATE source_items SET
              metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{contentCapture}',$4::jsonb,true),
              provider_content_hash=$5,content_updated_at=$6::timestamptz
              WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid
                AND (content_updated_at IS NULL OR content_updated_at <= $6::timestamptz)`,
            batch.tenantId, batch.workspaceId, item.record.id, JSON.stringify(capture), fingerprint, now);
            if (changed !== 1) throw new Refused('source_changed');
            materialized.push({ sourceItemId: item.record.id, availableAt: now, captureSha256: capture.sourceSnapshotSha256 });
          }
          return ok({ materialized, skipped });
        }, { isolationLevel: 'Serializable', timeout: 30_000, maxWait: 5_000 })));
    } catch (error: unknown) {
      if (error instanceof Refused) return err(error.code);
      throw error;
    }
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function validBatch(b: RetainedCaptureBatch): boolean {
  return [b.tenantId,b.workspaceId,b.interestId].every((id) => uuid.test(id)) &&
    [b.periodStartedAt,b.periodEndedAt].every((value) =>
      /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0{1,6})?Z$/u.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value.slice(0,10)) &&
    Date.parse(b.periodEndedAt)-Date.parse(b.periodStartedAt) === 86_400_000 &&
    b.targets.length>0 && b.targets.length<=500 && new Set(b.targets.map((t) => t.sourceItemId)).size===b.targets.length &&
    b.targets.every((t) => uuid.test(t.sourceItemId) && /^[a-f0-9]{64}$/u.test(t.expectedRowSha256));
}
function recordFromRow(r: Record<string, unknown>): PrismaSourceItemRecord {
  return {
    id: String(r.id),tenantId: String(r.tenant_id),workspaceId: String(r.workspace_id),
    sourceBindingId: String(r.source_binding_id),providerKey: String(r.provider_key),providerItemId: String(r.provider_item_id),
    canonicalUrl: String(r.canonical_url),title: String(r.title),body: String(r.body),
    authorHandle: r.author_handle === null ? null : String(r.author_handle),
    publishedAt: new Date(String(r.published_at)),observedAt: new Date(String(r.observed_at)),
    createdAt: new Date(String(r.created_at)),contentHash: String(r.content_hash),
    providerContentHash: r.provider_content_hash === null ? null : String(r.provider_content_hash),
    lastObservedAt: r.last_observed_at === null ? null : new Date(String(r.last_observed_at)),
    contentUpdatedAt: r.content_updated_at === null ? null : new Date(String(r.content_updated_at)),metadata: r.metadata,
  };
}
