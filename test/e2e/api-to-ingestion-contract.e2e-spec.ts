import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { IngestionWorkerModule } from '../../apps/ingestion-worker/src/ingestion-worker.module';
import { InMemoryFeedItemReadRepository } from '../../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemorySourceItemRepository } from '../../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { NoopScanExecutionReporterAdapter } from '../../libs/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter';
import { FakeSourceFetcherAdapter } from '../../libs/ingestion/adapters/source/fake-source-fetcher.adapter';
import { ExecuteScanCommandHandler } from '../../libs/ingestion/interfaces/queue/execute-scan-command.handler';
import type {
  FetchSourceItemsResult,
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
  SourceFetcherPort,
} from '../../libs/ingestion/ports';
import { RecordScanExecutionUseCase } from '../../libs/monitoring/features/record-scan-execution/record-scan-execution.use-case';

class MonitoringScanExecutionReporter implements ScanExecutionReporterPort {
  constructor(private readonly recordScanExecution: RecordScanExecutionUseCase) {}

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    const result = await this.recordScanExecution.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: command.scanJobId,
      status: 'succeeded',
      completedAt: command.completedAt,
    });

    if (!result.ok) {
      throw result.error;
    }
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    const result = await this.recordScanExecution.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: command.scanJobId,
      status: 'failed',
      completedAt: command.completedAt,
      failureReason: command.failureReason,
    });

    if (!result.ok) {
      throw result.error;
    }
  }
}

class FailingSourceFetcher implements SourceFetcherPort {
  async fetch(): Promise<FetchSourceItemsResult> {
    throw new Error('Provider unavailable');
  }
}

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
      .set('x-workspace-role', 'admin')
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
      .set('x-workspace-role', 'admin')
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
      .set('x-workspace-role', 'admin')
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
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'contract-scan')
      .set('idempotency-key', 'contract-scan')
      .expect(201);

    expect(scan.body).toEqual({
      scanJobId: expect.any(String),
      status: 'enqueued',
      created: true,
    });
    expect(queue.all()).toHaveLength(1);

    const workerModuleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    })
      .overrideProvider(NoopScanExecutionReporterAdapter)
      .useValue(new MonitoringScanExecutionReporter(api.get(RecordScanExecutionUseCase)))
      .compile();
    await workerModuleRef.init();

    const handler = workerModuleRef.get(ExecuteScanCommandHandler);
    const metrics = workerModuleRef.get(InMemoryMetricsRecorder);
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
    expect(
      metrics.counterValue('scan_jobs_total', {
        job_type: 'scan',
        status: 'started',
        worker: 'ingestion-worker',
      }),
    ).toBe(1);
    expect(
      metrics.counterValue('scan_failures_total', {
        failure_class: 'provider_unavailable',
        job_type: 'scan',
        worker: 'ingestion-worker',
      }),
    ).toBe(1);
    expect(
      metrics.counterValue('scan_jobs_total', {
        job_type: 'scan',
        status: 'succeeded',
        worker: 'ingestion-worker',
      }),
    ).toBe(1);
    expect(repository.all()).toHaveLength(2);
    expect((await feedRepository.list({
      tenantId: tenantId(tenant),
      workspaceId: workspaceId(workspace),
      limit: 10,
    })).items).toHaveLength(2);
    await request(api.getHttpServer())
      .get(`/scan-requests/${scan.body.scanJobId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          scanJobId: scan.body.scanJobId,
          status: 'succeeded',
          completedAt: expect.any(String),
        });
      });

    await workerModuleRef.close();
  });

  it('records failed scan status when ingestion worker execution fails', async () => {
    const tenant = 'tenant-contract-failure-e2e';
    const workspace = 'workspace-contract-failure-e2e';
    const queue = api.get(InMemoryQueuePublisher);
    const initialQueueLength = queue.all().length;

    const topic = await request(api.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'contract-failure-topic')
      .set('idempotency-key', 'contract-failure-topic')
      .send({
        name: 'Contract Failure Monitoring',
        query: 'contract failure monitoring',
      })
      .expect(201);

    const binding = await request(api.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'contract-failure-binding')
      .set('idempotency-key', 'contract-failure-binding')
      .send({
        providerKey: 'fake-source',
        config: { query: 'contract failure monitoring' },
      })
      .expect(201);

    await request(api.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'contract-failure-policy')
      .set('idempotency-key', 'contract-failure-policy')
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
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'contract-failure-scan')
      .set('idempotency-key', 'contract-failure-scan')
      .expect(201);
    const command = queue.all()[initialQueueLength];

    if (command === undefined) {
      throw new Error('Expected API gateway to publish failing ingestion scan command');
    }

    const workerModuleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    })
      .overrideProvider(NoopScanExecutionReporterAdapter)
      .useValue(new MonitoringScanExecutionReporter(api.get(RecordScanExecutionUseCase)))
      .overrideProvider(FakeSourceFetcherAdapter)
      .useValue(new FailingSourceFetcher())
      .compile();
    await workerModuleRef.init();

    const handler = workerModuleRef.get(ExecuteScanCommandHandler);
    const metrics = workerModuleRef.get(InMemoryMetricsRecorder);
    await expect(handler.handle(command)).rejects.toThrow('Provider unavailable');
    expect(
      metrics.counterValue('scan_jobs_total', {
        job_type: 'scan',
        status: 'started',
        worker: 'ingestion-worker',
      }),
    ).toBe(1);
    expect(
      metrics.counterValue('scan_jobs_total', {
        job_type: 'scan',
        status: 'failed',
        worker: 'ingestion-worker',
      }),
    ).toBe(1);
    await request(api.getHttpServer())
      .get(`/scan-requests/${scan.body.scanJobId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          scanJobId: scan.body.scanJobId,
          status: 'failed',
          completedAt: expect.any(String),
          failureReason: 'Provider unavailable',
        });
      });

    await workerModuleRef.close();
  });
});
