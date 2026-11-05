import { defaultPostgresRuntimePoolConfig, teardownPostgresRuntimePoolForTests } from '@social-monitor/platform-persistence';
import * as runtimeClient from '@social-monitor/platform-persistence/prisma-runtime-client';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { PrismaArticleCaptureRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-article-capture.repository';
import { PrismaIngestionWorkerConnection } from './prisma-ingestion-worker-connection';

describe('production ingestion SQL capabilities', () => {
  afterEach(async () => {
    await teardownPostgresRuntimePoolForTests();
    jest.restoreAllMocks();
  });

  it('supports the article-capture due query and preserves transaction receiver', async () => {
    class Client {
      readonly sourceItem = { findMany: jest.fn() };
      readonly query = jest.fn(async () => []);
      async $queryRaw(): Promise<readonly unknown[]> {
        return this.query();
      }
      async $transaction<T>(operation: (client: Client) => Promise<T>, options: unknown): Promise<T> {
        expect(options).toEqual({ isolationLevel: 'Serializable' });
        expect(this).toBeInstanceOf(Client);
        return operation(this);
      }
      async $disconnect(): Promise<void> {}
    }
    jest.spyOn(runtimeClient, 'loadPrismaRuntimeClient').mockReturnValue(Client);
    const connection = await PrismaIngestionWorkerConnection.create(defaultPostgresRuntimePoolConfig(
      'postgresql://fixture.invalid/TEST_ingestion', 'ingestion-worker',
    ));
    const captures = new PrismaArticleCaptureRepository(connection);
    await expect(captures.findDueArticleCaptures({
      tenantId: tenantId('00000000-0000-7000-8000-000000000901'),
      workspaceId: workspaceId('00000000-0000-7000-8000-000000000902'),
      sourceBindingId: '00000000-0000-7000-8000-000000000903',
      providerKey: 'hacker-news', now: new Date('2026-10-18T00:00:00Z'),
      limit: 12, liveArticleCredentialIdentities: [],
    })).resolves.toEqual([]);
    await expect(connection.$transaction(async () => 'committed', {
      isolationLevel: 'Serializable',
    })).resolves.toBe('committed');
    await connection.close();
  });
});
