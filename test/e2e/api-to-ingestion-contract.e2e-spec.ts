import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { IngestionWorkerModule } from '../../apps/ingestion-worker/src/ingestion-worker.module';
import { InMemoryFeedItemReadRepository } from '../../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemorySourceItemRepository } from '../../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { ExecuteScanCommandHandler } from '../../libs/ingestion/interfaces/queue/execute-scan-command.handler';

describe('API to ingestion worker queue contract (e2e)', () => {
  let api: INestApplication;

  beforeAll(async () => {
    const apiModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    api = apiModuleRef.createNestApplication();
    api.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await api.init();
  });

  afterAll(async () => {
    await api.close();
  });

  it('publishes a scan command that the ingestion worker can execute', async () => {
    const tenant = 'tenant-contract-e2e';
    const workspace = 'workspace-contract-e2e';
    const queue = api.get(InMemoryQueuePublisher);

    const topic = await request(api.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'contract-topic')
      .set('idempotency-key', 'contract-topic')
      .send({
        name: 'Contract Monitoring',
        query: 'contract monitoring',
      })
      .expect(201);

    const binding = await request(api.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'contract-binding')
      .set('idempotency-key', 'contract-binding')
      .send({
        providerKey: 'fake-source',
        config: { query: 'contract monitoring' },
      })
      .expect(201);

    await request(api.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'contract-policy')
      .set('idempotency-key', 'contract-policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    const scan = await request(api.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'contract-scan')
      .set('idempotency-key', 'contract-scan')
      .expect(201);

    expect(scan.body).toEqual({
      scanJobId: expect.any(String),
      created: true,
    });
    expect(queue.all()).toHaveLength(1);

    const workerModuleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    }).compile();
    await workerModuleRef.init();

    const handler = workerModuleRef.get(ExecuteScanCommandHandler);
    const repository = workerModuleRef.get(InMemorySourceItemRepository);
    const feedRepository = workerModuleRef.get(InMemoryFeedItemReadRepository);
    const command = queue.all()[0];

    if (command === undefined) {
      throw new Error('Expected API gateway to publish an ingestion scan command');
    }

    const result = await handler.handle(command);

    expect(result).toEqual({
      scanJobId: scan.body.scanJobId,
      fetched: 2,
      inserted: 2,
      skippedDuplicates: 0,
      projected: 2,
    });
    expect(repository.all()).toHaveLength(2);
    expect((await feedRepository.list({
      tenantId: tenantId(tenant),
      workspaceId: workspaceId(workspace),
      limit: 10,
    })).items).toHaveLength(2);

    await workerModuleRef.close();
  });
});
