import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { IngestionWorkerModule } from '../../apps/ingestion-worker/src/ingestion-worker.module';
import { InMemoryFeedItemReadRepository } from '../../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemorySourceItemRepository } from '../../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemorySourceProviderRegistry } from '../../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { ExecuteScanCommandHandler } from '../../libs/ingestion/interfaces/queue/execute-scan-command.handler';

describe('ingestion worker execute scan command (e2e)', () => {
  it('handles queued scan command and persists fetched source items idempotently', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    }).compile();

    await moduleRef.init();

    const handler = moduleRef.get(ExecuteScanCommandHandler);
    const repository = moduleRef.get(InMemorySourceItemRepository);
    const feedRepository = moduleRef.get(InMemoryFeedItemReadRepository);
    const providerRegistry = moduleRef.get(InMemorySourceProviderRegistry);
    const command = {
      commandId: 'scan-job-1',
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      causationId: 'scan-request-1',
      payload: {
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        scanJobId: 'scan-job-1',
        sourceBindingId: 'source-binding-1',
        scanPolicyId: 'scan-policy-1',
      },
    };

    const first = await handler.handle(command);
    const second = await handler.handle(command);

    expect(first).toEqual({
      scanJobId: 'scan-job-1',
      fetched: 2,
      inserted: 2,
      skippedDuplicates: 0,
      projected: 2,
    });
    expect(second).toEqual({
      scanJobId: 'scan-job-1',
      fetched: 2,
      inserted: 0,
      skippedDuplicates: 2,
      projected: 2,
    });
    expect(repository.all()).toHaveLength(2);
    expect((await feedRepository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
    })).items).toHaveLength(2);
    await expect(providerRegistry.getReadinessProfile('reddit')).resolves.toEqual(
      expect.objectContaining({
        providerKey: 'reddit',
        state: 'profiled',
      }),
    );

    await moduleRef.close();
  });
});
