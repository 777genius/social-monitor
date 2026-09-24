import { PrismaReaderValueMaintenanceScopes } from './prisma-reader-value-maintenance-scopes';
import type { AssessmentSqlClient } from './assessment-sql';

const scope = { tenantId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  interestId: '44444444-4444-4444-8444-444444444444' };

describe('PrismaReaderValueMaintenanceScopes live discovery', () => {
  it('pages enabled interests with visible recent posts and bounded SQL', async () => {
    const query = jest.fn().mockResolvedValue([scope]);
    const tx = { $executeRawUnsafe: jest.fn(), $queryRawUnsafe: query };
    const client = { $transaction: async (operation: (value: typeof tx) => Promise<unknown>) =>
      operation(tx) } as unknown as AssessmentSqlClient;
    const source = new PrismaReaderValueMaintenanceScopes(client);

    expect(await source.nextDiscoverable(scope, '2026-09-24T00:00:00Z', 25))
      .toEqual([scope]);
    const [sql, tenant, workspace, interest, backfill, limit] = query.mock.calls[0]!;
    expect(sql).toContain("i.status='ENABLED' AND i.deleted_at IS NULL");
    expect(sql).toContain("b.status='ENABLED' AND b.deleted_at IS NULL");
    expect(sql).toContain("f.status='VISIBLE'");
    expect(sql).toContain('f.published_at >= $4::timestamptz');
    expect([tenant, workspace, interest, backfill, limit]).toEqual([
      scope.tenantId, scope.workspaceId, scope.interestId, '2026-09-24T00:00:00Z', 25]);
    expect(() => source.nextDiscoverable(undefined, '2026-09-24T00:00:00Z', 26))
      .toThrow(/page limit/u);
  });
});
