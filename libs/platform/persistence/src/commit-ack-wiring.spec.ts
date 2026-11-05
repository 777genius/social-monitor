import type { PrismaPg } from '@prisma/adapter-pg';
import type * as PrismaPgModule from '@prisma/adapter-pg';
import { Pool } from 'pg';

import {
  defaultPostgresRuntimePoolConfig,
  PostgresRuntimePoolRegistry,
} from './postgres-runtime-pool';
import { CommitAckClient } from './postgres-runtime-pool-commit-ack.spec-support';

let mockOwnedPool: Pool;
jest.mock('@prisma/adapter-pg', () => {
  const actual = jest.requireActual<typeof PrismaPgModule>(
    '@prisma/adapter-pg',
  );
  return {
    ...actual,
    PrismaPg: class extends actual.PrismaPg {
      constructor(pool: Pool, options: { disposeExternalPool: boolean }) {
        super(pool, options);
        mockOwnedPool = pool;
      }
    },
  };
});

class RuntimeClient {
  constructor(readonly options: { adapter: PrismaPg }) {}
  async $disconnect(): Promise<void> {}
}

it('rejects ROLLBACK acknowledgement on the default registry owned transport', async () => {
  const registry = new PostgresRuntimePoolRegistry();
  const owner = await registry.acquire(
    defaultPostgresRuntimePoolConfig('postgresql://synthetic.invalid/test', 'api-gateway'),
    RuntimeClient,
  );
  const client = new CommitAckClient();
  try {
    expect(mockOwnedPool).toBeInstanceOf(Pool);
    // Exercise the same event pg-pool emits before exposing a physical lease.
    mockOwnedPool.emit('connect', client);
    await client.connect();
    const pending = client.query({ text: 'COMMIT', values: [], rowMode: 'array' });
    client.wire.complete('ROLLBACK');
    await expect(pending).rejects.toMatchObject({
      name: 'PostgresCommitAcknowledgementError',
      code: 'POSTGRES_COMMIT_ACKNOWLEDGED_ROLLBACK',
    });
    expect(client.wire.queries).toEqual(['COMMIT']);
  } finally {
    await client.end();
    await owner.close();
  }
  expect(registry.diagnostics().poolInstances).toBe(0);
});
