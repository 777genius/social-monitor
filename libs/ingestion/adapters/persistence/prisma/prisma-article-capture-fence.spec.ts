import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { lockArticleCapture, writeArticleCapture, type ArticleCaptureTransaction } from './prisma-article-capture-fence';
import type { PrismaIngestionClient } from './prisma-ingestion-client';

const now = new Date('2026-09-20T00:00:00Z');
const scope = { tenantId: tenantId('tenant'), workspaceId: workspaceId('workspace'), sourceBindingId: 'binding', providerKey: 'rss' };
const lease = { ...scope, scanJobId: 'scan', workerId: 'worker', fencingToken: 'fence', leasedAt: now, expiresAt: new Date(now.getTime() + 1000) };

describe('article capture SQL fencing contract', () => {
  it('locks the scoped lease and source before reading the database wall clock', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ expires_at: lease.expiresAt }])
      .mockResolvedValueOnce([{ id: 'source' }])
      .mockResolvedValueOnce([{ now }]);
    const result = await lockArticleCapture({ $queryRaw: query } as unknown as PrismaIngestionClient, scope, lease, 'external');
    expect(result?.now).toBe(now);
    expect(query.mock.calls[0]![0].join('?')).toContain('FOR SHARE');
    expect(query.mock.calls[1]![0].join('?')).toContain('FOR UPDATE');
    expect(query.mock.calls[1]!.slice(1)).toEqual([scope.tenantId, scope.workspaceId, scope.sourceBindingId, scope.providerKey, 'external']);
    expect(query.mock.calls[2]![0].join('?')).toContain('clock_timestamp()');
  });

  it('rejects expiry while waiting on the source lock, regardless of caller timestamps', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ expires_at: lease.expiresAt }])
      .mockResolvedValueOnce([{ id: 'source' }])
      .mockResolvedValueOnce([{ now: new Date(lease.expiresAt.getTime() + 1) }]);
    await expect(lockArticleCapture({ $queryRaw: query } as unknown as PrismaIngestionClient, scope, lease, 'external')).resolves.toBeNull();
  });

  it('fails closed without scoped SQL capability or with a cross-workspace lease', async () => {
    await expect(lockArticleCapture({} as PrismaIngestionClient, scope, lease, 'external')).rejects.toThrow('SQL fence support');
    const query = jest.fn();
    await expect(lockArticleCapture({ $queryRaw: query } as unknown as PrismaIngestionClient,
      scope, { ...lease, workspaceId: workspaceId('other') }, 'external')).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('rechecks exact scope, fence and DB expiry in the write instead of trusting a preceding read', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const result = await writeArticleCapture({ $queryRaw: query } as unknown as ArticleCaptureTransaction,
      scope, lease, { id: 'source', metadata: { attempt: 'fixture' }, contentChanged: true });
    expect(result).toBe(false);
    const sql = query.mock.calls[0]![0].join('?');
    expect(sql).toContain('lease.expires_at > clock_timestamp()');
    expect(sql).toContain('source.source_binding_id');
    expect(sql).toContain('fencing_token');
    expect(sql).not.toContain('fixture');
  });
});
