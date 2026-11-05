import { PrismaRetainedSourceCaptureRepository, type RetainedCaptureSqlClient,
  type RetainedCaptureSqlTransaction } from './prisma-retained-source-capture.repository';
import { captureRetainedSourceContent } from '../../../domain/value-objects/retained-source-content-capture';
import { captureNativeText } from '../../../domain/value-objects/source-content-capture';
import type { RetainedCaptureBatch } from '../../../ports/retained-source-capture-repository';

const tenant = '00000000-0000-4000-8000-000000000001';
const workspace = '00000000-0000-4000-8000-000000000002';
const sourceId = '00000000-0000-4000-8000-000000000003';
const now = '2026-10-14T18:00:00.123456Z';
const digest = 'a'.repeat(64);
const command: RetainedCaptureBatch = { tenantId: tenant, workspaceId: workspace,
  interestId: '00000000-0000-4000-8000-000000000004',
  periodStartedAt: '2026-09-29T00:00:00Z', periodEndedAt: '2026-09-30T00:00:00Z',
  targets: [{ sourceItemId: sourceId, expectedRowSha256: digest }] };
const original = { id: sourceId,tenant_id: tenant,workspace_id: workspace,
  source_binding_id: '00000000-0000-4000-8000-000000000005',provider_key: 'reddit',
  provider_item_id: 'original-provider-id',canonical_url: 'https://example.test/original',
  title: 'Original title',body: 'Original retained text\n🙂',author_handle: null,
  published_at: '2026-09-29T03:00:00.123456Z', observed_at: '2026-09-29T04:00:00.123456Z',
  last_observed_at: '2026-09-29T04:00:00.123456Z',content_updated_at: '2026-09-29T04:00:00.123456Z',
  created_at: '2026-09-29T04:00:00.123456Z',content_hash: 'b'.repeat(64),
  provider_content_hash: 'c'.repeat(64),metadata: { kind: 'reddit_post', unrelated: { nested: 'keep' } } };

function fixture(rows: { row: Record<string, unknown>; digest: string }[] = [{ row: structuredClone(original), digest }], busy = false, failWriteAt = 0) {
  const writes: { sql: string; values: unknown[] }[] = [];
  const committed: typeof writes = [];
  const queries: string[] = [];
  const tx: RetainedCaptureSqlTransaction = {
    $queryRawUnsafe: async <T>(sql: string): Promise<T> => {
      queries.push(sql);
      if (sql.includes('FROM reader_summary_jobs')) return (busy ? [{ id: 'active' }] : []) as T;
      if (sql.includes('FOR UPDATE')) {
        const allowed = /s\.provider_key IN \(([^)]+)\)/u.exec(sql)?.[1];
        return rows.filter((row) => allowed?.includes(`'${String(row.row.provider_key)}'`)) as T;
      }
      return [{ now }] as T;
    },
    $executeRawUnsafe: async (sql, ...values) => {
      if (sql.startsWith('UPDATE')) { writes.push({ sql, values }); return writes.length === failWriteAt ? 0 : 1; }
      return 0;
    },
  };
  const client: RetainedCaptureSqlClient = { ...tx, $transaction: async (operation, options) => {
    expect(options.isolationLevel).toBe('Serializable');
    const result = await operation(tx); committed.push(...writes); return result;
  } };
  return { subject: new PrismaRetainedSourceCaptureRepository(client), writes, committed, queries };
}
describe('metadata-only retained capture CAS', () => {
  it('preserves original source/feed fields and unrelated JSON; database time follows row lock', async () => {
    const f = fixture();
    const before = structuredClone(original);
    const result = await f.subject.materialize(command);
    expect(result).toMatchObject({ ok: true, value: { materialized: [{ sourceItemId: sourceId, availableAt: now }], skipped: [] } });
    expect(original).toEqual(before);
    const write = f.committed[0]!;
    expect(write.sql).toContain("jsonb_set(COALESCE(metadata,'{}'::jsonb)");
    expect(write.sql).not.toMatch(/\b(title|body|published_at|observed_at|content_hash|source_binding_id)\s*=/u);
    expect(write.values.slice(0,3)).toEqual([tenant,workspace,sourceId]);
    expect(JSON.parse(String(write.values[3]))).toMatchObject({ presentationComplete: false, origin: 'retained_snapshot', availability: 'partial' });
    expect(write.values[4]).not.toBe(original.provider_content_hash);
    expect(write.values[5]).toBe(now);
    expect(f.queries.findIndex((q) => q.includes('FOR UPDATE'))).toBeLessThan(f.queries.findIndex((q) => q.includes('SELECT to_char')));
  });
  it('rejects changed metadata/text/full-row CAS without any write', async () => {
    const f = fixture([{ row: original, digest: 'd'.repeat(64) }]);
    expect(await f.subject.materialize(command)).toEqual({ ok: false, error: 'source_changed' });
    expect(f.writes).toEqual([]);
  });
  it('skips a previously valid materialization without refreshing its acquisition clock', async () => {
    const capture = captureRetainedSourceContent({ id: sourceId, providerKey: 'reddit',
      canonicalUrl: original.canonical_url,title: original.title,body: original.body }, now);
    const row = { ...original, metadata: { ...original.metadata, contentCapture: capture } };
    const f = fixture([{ row, digest }]);
    expect(await f.subject.materialize(command)).toEqual({ ok: true, value: { materialized: [], skipped: [sourceId] } });
    expect(f.writes).toEqual([]);
  });
  it('preserves a valid original native capture byte-for-byte', async () => {
    const native = captureNativeText({ title: original.title, body: original.body,
      canonicalUrl: original.canonical_url, metadata: original.metadata }, 'reddit', new Date('2026-09-29T04:00:00Z'));
    const row = { ...original, metadata: native.metadata };
    const f = fixture([{ row, digest }]);
    expect(await f.subject.materialize(command)).toEqual({ ok: true, value: { materialized: [], skipped: [sourceId] } });
    expect(f.writes).toEqual([]);
    expect(row.metadata).toEqual(native.metadata);
  });
  it('uses canonical X identity and refuses unsupported provider aliases in the scoped query', async () => {
    const row = { ...original,provider_key: 'x-twitter',metadata: { kind: 'x_post' } };
    const f = fixture([{ row,digest }]);
    expect(await f.subject.materialize(command)).toMatchObject({ ok: true });
    const captured = JSON.parse(String(f.writes[0]!.values[3]));
    expect(captured.providerKey).toBe('x-twitter');
    const sql = f.queries.find((query) => query.includes('FOR UPDATE'))!;
    expect(sql).toContain("IN ('hacker-news','reddit','rss','x-twitter')");
    expect(sql).not.toMatch(/[, ]'x'[,)]/u);
    const alias = fixture([{ row: { ...row,provider_key: 'x' },digest }]);
    expect(await alias.subject.materialize(command)).toEqual({ ok: false,error: 'source_changed' });
    expect(alias.writes).toEqual([]);
  });
  it('refuses existing malformed capture, scoped row absence, and active/consumed job', async () => {
    const malformed = fixture([{ row: { ...original, metadata: { ...original.metadata, contentCapture: { version: 'unknown' } } }, digest }]);
    expect(await malformed.subject.materialize(command)).toEqual({ ok: false, error: 'unsupported_capture' });
    const absent = fixture([]);
    expect(await absent.subject.materialize(command)).toEqual({ ok: false, error: 'source_changed' });
    const active = fixture(undefined, true);
    expect(await active.subject.materialize(command)).toEqual({ ok: false, error: 'source_changed' });
    expect([...malformed.writes,...absent.writes,...active.writes]).toEqual([]);
  });
  it('rolls back when write count disagrees rather than reporting a partial capture', async () => {
    const secondId = '00000000-0000-4000-8000-000000000009';
    const f = fixture([{ row: original,digest },{ row: { ...original,id: secondId,provider_item_id: 'second' },digest }],false,2);
    expect(await f.subject.materialize({ ...command,targets: [...command.targets,
      { sourceItemId: secondId,expectedRowSha256: digest }] })).toEqual({ ok: false, error: 'source_changed' });
    expect(f.writes).toHaveLength(2);
    expect(f.committed).toEqual([]);
  });
  it.each(['2026-09-30T00:00:00+00:00','2026-09-30T01:00:00Z','not-a-date'])('refuses noncanonical period end %s before SQL', async (end) => {
    const f = fixture();
    expect(await f.subject.materialize({ ...command,periodEndedAt: end })).toEqual({ ok: false,error: 'invalid_batch' });
    expect(f.queries).toEqual([]);
  });
});
