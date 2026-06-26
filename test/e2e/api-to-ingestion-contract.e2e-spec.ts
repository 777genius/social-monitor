import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { IngestionWorkerModule } from '../../apps/ingestion-worker/src/ingestion-worker.module';
import { InMemoryFeedItemReadRepository } from '../../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemorySourceItemRepository } from '../../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { NoopScanExecutionReporterAdapter } from '../../libs/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter';
import { RegistrySourceFetcherAdapter } from '../../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { FixtureHackerNewsClient } from '../../libs/ingestion/adapters/source/hacker-news/fixture-hacker-news-client';
import { HackerNewsSourceProvider } from '../../libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider';
import { FixtureRssClient } from '../../libs/ingestion/adapters/source/rss/fixture-rss-client';
import { RssSourceProvider } from '../../libs/ingestion/adapters/source/rss/rss-source.provider';
import { ExecuteScanCommandHandler } from '../../libs/ingestion/interfaces/queue/execute-scan-command.handler';
import type {
  FetchSourceItemsResult,
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
  SourceFetcherPort,
} from '../../libs/ingestion/ports';
import { RecordScanExecutionUseCase } from '../../libs/monitoring/features/record-scan-execution/record-scan-execution.use-case';
import { MonitoringRestModule } from '../../libs/monitoring/interfaces/rest/monitoring-rest.module';

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

class HackerNewsFixtureSourceFetcher implements SourceFetcherPort {
  private readonly provider = new HackerNewsSourceProvider(new FixtureHackerNewsClient());

  async fetch(command: Parameters<SourceFetcherPort['fetch']>[0]): Promise<FetchSourceItemsResult> {
    const validation = this.provider.validateBinding(command.sourceQuery);

    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    const context = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      scanJobId: command.scanJobId,
      correlationId: command.correlationId,
    };
    const result = await this.provider.scan({
      ...this.provider.planScan(command.sourceQuery, context),
      cursor: command.cursor,
    }, context);

    return {
      items: result.items,
      nextCursor: result.nextCursor,
    };
  }
}

jest.setTimeout(120_000);

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
    const queue = api.select(MonitoringRestModule).get(InMemoryQueuePublisher, { strict: true });

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

    expect(scan.body).toEqual(expect.objectContaining({
      scanJobId: expect.any(String),
      status: 'enqueued',
      created: true,
      requestDecision: expect.objectContaining({
        decision: 'created',
        reason: 'manual_scan_enqueued',
      }),
    }));
    expect(queue.all()).toHaveLength(1);
    expect(queue.all()[0]?.payload).toEqual(expect.objectContaining({
      providerKey: 'fake-source',
      sourceQuery: { mode: 'search', query: 'contract monitoring' },
    }));

    const workerModuleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    })
      .overrideProvider(NoopScanExecutionReporterAdapter)
      .useValue(new MonitoringScanExecutionReporter(api.get(RecordScanExecutionUseCase)))
      .overrideProvider(InMemoryFeedItemReadRepository)
      .useValue(api.get(InMemoryFeedItemReadRepository))
      .compile();
    await workerModuleRef.init();

    const handler = workerModuleRef.get(ExecuteScanCommandHandler);
    const metrics = workerModuleRef.select(IngestionWorkerModule).get(InMemoryMetricsRecorder, { strict: true });
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
    ).toBe(0);
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
      .get('/feed/items')
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({
          items: [
            expect.objectContaining({
              sourceBindingId: binding.body.sourceBindingId,
              title: 'Fake source post 2',
            }),
            expect.objectContaining({
              sourceBindingId: binding.body.sourceBindingId,
              title: 'Fake source post 1',
            }),
          ],
        }));
      });
    await request(api.getHttpServer())
      .get(`/scan-requests/${scan.body.scanJobId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          scanJobId: scan.body.scanJobId,
          status: 'succeeded',
          completedAt: expect.any(String),
        });
      });
    await request(api.getHttpServer())
      .get(`/topics/${topic.body.topicId}/source-bindings/daily-history`)
      .query({ days: 1 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({
          topicId: topic.body.topicId,
          summary: expect.objectContaining({
            sourceBindingCount: 1,
            enabledSourceBindingCount: 1,
            pausedSourceBindingCount: 0,
            configuredSourceBindingCount: 1,
            unconfiguredSourceBindingCount: 0,
            totalScans: 1,
            succeededScans: 1,
            skippedDuplicates: 0,
            lastCompletedAt: expect.any(String),
            providerBreakdown: [
              expect.objectContaining({
                providerKey: 'fake-source',
                sourceBindingCount: 1,
                enabledSourceBindingCount: 1,
                pausedSourceBindingCount: 0,
                configuredSourceBindingCount: 1,
                unconfiguredSourceBindingCount: 0,
                cadenceSummary: expect.objectContaining({
                  minimumIntervalSeconds: 60,
                  minConfiguredIntervalSeconds: 300,
                  maxEffectiveIntervalSeconds: 300,
                  providerMinimumIntervalEnforced: false,
                }),
                totalScans: 1,
                succeededScans: 1,
              }),
            ],
          }),
          days: [
            expect.objectContaining({
              enabledSourceBindingCount: 1,
              pausedSourceBindingCount: 0,
              configuredSourceBindingCount: 1,
              unconfiguredSourceBindingCount: 0,
              providerBreakdown: [
                expect.objectContaining({
                  providerKey: 'fake-source',
                  enabledSourceBindingCount: 1,
                  configuredSourceBindingCount: 1,
                  totalScans: 1,
                  succeededScans: 1,
                }),
              ],
            }),
          ],
        }));
      });

    await workerModuleRef.close();
  });

  it('publishes and executes an RSS scan command through the same API-to-feed path', async () => {
    const tenant = 'tenant-rss-contract-e2e';
    const workspace = 'workspace-rss-contract-e2e';
    const queue = api.select(MonitoringRestModule).get(InMemoryQueuePublisher, { strict: true });
    const initialQueueLength = queue.all().length;

    const topic = await request(api.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'rss-contract-topic')
      .set('idempotency-key', 'rss-contract-topic')
      .send({
        name: 'RSS Contract Monitoring',
        query: 'rss contract monitoring',
      })
      .expect(201);

    const binding = await request(api.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'rss-contract-binding')
      .set('idempotency-key', 'rss-contract-binding')
      .send({
        providerKey: 'rss',
        config: { feedUrl: 'https://example.test/feed.xml' },
      })
      .expect(201);

    await request(api.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'rss-contract-policy')
      .set('idempotency-key', 'rss-contract-policy')
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
      .set('x-request-id', 'rss-contract-scan')
      .set('idempotency-key', 'rss-contract-scan')
      .expect(201);
    const command = queue.all()[initialQueueLength];

    expect(command?.payload).toEqual(expect.objectContaining({
      providerKey: 'rss',
      sourceQuery: { mode: 'url', query: 'https://example.test/feed.xml' },
    }));

    if (command === undefined) {
      throw new Error('Expected API gateway to publish RSS ingestion scan command');
    }

    const workerModuleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    })
      .overrideProvider(NoopScanExecutionReporterAdapter)
      .useValue(new MonitoringScanExecutionReporter(api.get(RecordScanExecutionUseCase)))
      .overrideProvider(InMemoryFeedItemReadRepository)
      .useValue(api.get(InMemoryFeedItemReadRepository))
      .overrideProvider(RssSourceProvider)
      .useValue(new RssSourceProvider(new FixtureRssClient()))
      .compile();
    await workerModuleRef.init();

    const handler = workerModuleRef.get(ExecuteScanCommandHandler);
    const result = await handler.handle(command);

    expect(result).toEqual({
      scanJobId: scan.body.scanJobId,
      fetched: 2,
      inserted: 2,
      skippedDuplicates: 0,
      projected: 2,
    });

    await request(api.getHttpServer())
      .get('/feed/items')
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({
          items: [
            expect.objectContaining({
              sourceBindingId: binding.body.sourceBindingId,
              title: 'RSS item 2 without guid',
              canonicalUrl: 'https://example.test/rss/item-2',
            }),
            expect.objectContaining({
              sourceBindingId: binding.body.sourceBindingId,
              title: 'RSS item 1',
              canonicalUrl: 'https://example.test/rss/item-1',
            }),
          ],
          sourceBreakdown: expect.objectContaining({
            providerCount: 1,
            sourceCount: 1,
            totalItems: 2,
            sources: [
              expect.objectContaining({
                providerKey: 'rss',
                itemCount: 2,
                sourceBindingIds: [binding.body.sourceBindingId],
              }),
            ],
          }),
        }));
      });

    await request(api.getHttpServer())
      .get(`/scan-requests/${scan.body.scanJobId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
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

  it('publishes and executes a Hacker News scan with provider metrics exposed through feed API', async () => {
    const tenant = 'tenant-hn-contract-e2e';
    const workspace = 'workspace-hn-contract-e2e';
    const queue = api.select(MonitoringRestModule).get(InMemoryQueuePublisher, { strict: true });
    const initialQueueLength = queue.all().length;

    const topic = await request(api.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'hn-contract-topic')
      .set('idempotency-key', 'hn-contract-topic')
      .send({
        name: 'HN Contract Monitoring',
        query: 'hn contract monitoring',
      })
      .expect(201);

    const binding = await request(api.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'hn-contract-binding')
      .set('idempotency-key', 'hn-contract-binding')
      .send({
        providerKey: 'hacker-news',
        config: { mode: 'listing', listing: 'top' },
      })
      .expect(201);

    await request(api.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'hn-contract-policy')
      .set('idempotency-key', 'hn-contract-policy')
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
      .set('x-request-id', 'hn-contract-scan')
      .set('idempotency-key', 'hn-contract-scan')
      .expect(201);
    const command = queue.all()[initialQueueLength];

    expect(command?.payload).toEqual(expect.objectContaining({
      providerKey: 'hacker-news',
      sourceQuery: { mode: 'listing', query: 'top' },
    }));

    if (command === undefined) {
      throw new Error('Expected API gateway to publish Hacker News ingestion scan command');
    }

    const workerModuleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    })
      .overrideProvider(NoopScanExecutionReporterAdapter)
      .useValue(new MonitoringScanExecutionReporter(api.get(RecordScanExecutionUseCase)))
      .overrideProvider(InMemoryFeedItemReadRepository)
      .useValue(api.get(InMemoryFeedItemReadRepository))
      .overrideProvider(RegistrySourceFetcherAdapter)
      .useValue(new HackerNewsFixtureSourceFetcher())
      .compile();
    await workerModuleRef.init();

    const handler = workerModuleRef.get(ExecuteScanCommandHandler);
    const result = await handler.handle(command);

    expect(result).toEqual({
      scanJobId: scan.body.scanJobId,
      fetched: 2,
      inserted: 2,
      skippedDuplicates: 0,
      projected: 2,
    });

    const feed = await request(api.getHttpServer())
      .get('/feed/items')
      .query({ limit: 10, topicId: topic.body.topicId })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(feed.body.items).toEqual([
      expect.objectContaining({
        sourceBindingId: binding.body.sourceBindingId,
        title: 'Ask HN: Reliable RSS and API ingestion',
        providerMetadata: expect.objectContaining({
          kind: 'hacker_news_story',
          source: 'top',
          points: 75,
          comments: 18,
        }),
        providerMetrics: {
          kind: 'hacker_news_story',
          providerKey: 'hacker-news',
          sourceKey: 'hn:top',
          contentType: 'story',
          points: 75,
          comments: 18,
        },
        normalizedSignal: expect.objectContaining({
          basis: 'cohort_baseline_v1',
          cohort: expect.objectContaining({
            providerKey: 'hacker-news',
            sourceKey: 'hn:top',
            contentType: 'story',
            sampleSize: 2,
          }),
        }),
      }),
      expect.objectContaining({
        sourceBindingId: binding.body.sourceBindingId,
        title: 'Show HN: Social monitoring architecture',
        providerMetrics: expect.objectContaining({
          kind: 'hacker_news_story',
          points: 42,
          comments: 9,
        }),
      }),
    ]);

    const detail = await request(api.getHttpServer())
      .get(`/feed/items/${feed.body.items[0].id}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(detail.body).toMatchObject({
      id: feed.body.items[0].id,
      providerMetrics: {
        kind: 'hacker_news_story',
        providerKey: 'hacker-news',
        sourceKey: 'hn:top',
        contentType: 'story',
        points: 75,
        comments: 18,
      },
      normalizedSignal: {
        basis: 'cohort_baseline_v1',
        cohort: {
          baselineWindow: '24h',
          sampleSize: 2,
        },
      },
    });

    await workerModuleRef.close();
  });

  it('records failed scan status when ingestion worker execution fails', async () => {
    const tenant = 'tenant-contract-failure-e2e';
    const workspace = 'workspace-contract-failure-e2e';
    const queue = api.select(MonitoringRestModule).get(InMemoryQueuePublisher, { strict: true });
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
      .overrideProvider(RegistrySourceFetcherAdapter)
      .useValue(new FailingSourceFetcher())
      .compile();
    await workerModuleRef.init();

    const handler = workerModuleRef.get(ExecuteScanCommandHandler);
    const metrics = workerModuleRef.select(IngestionWorkerModule).get(InMemoryMetricsRecorder, { strict: true });
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
      .set('x-workspace-role', 'viewer')
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
