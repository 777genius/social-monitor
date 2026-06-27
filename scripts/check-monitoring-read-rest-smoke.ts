import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ScanJob } from '@social-monitor/monitoring/domain';
import {
  MONITORING_SCAN_JOB_REPOSITORY,
  MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
} from '@social-monitor/monitoring/interfaces/rest/monitoring-provider-tokens';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import type {
  ScanJobRepositoryPort,
  ScanSchedulerDecisionHistoryPort,
  ScanSchedulerDecisionReason,
} from '@social-monitor/monitoring/ports';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const seedCompletedScan = async (params: {
  readonly scanJobs: ScanJobRepositoryPort;
  readonly tenant: ReturnType<typeof tenantId>;
  readonly workspace: ReturnType<typeof workspaceId>;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly scanJobId: string;
  readonly completedAt: Date;
  readonly failureReason?: string;
}): Promise<void> => {
  const requestedAt = new Date(params.completedAt.getTime() - 2_000);
  const enqueuedAt = new Date(params.completedAt.getTime() - 1_000);
  const enqueued = ScanJob.request({
    id: params.scanJobId,
    tenantId: params.tenant,
    workspaceId: params.workspace,
    sourceBindingId: params.sourceBindingId,
    scanPolicyId: params.scanPolicyId,
    idempotencyKey: `read-rest-${params.scanJobId}`,
    requestedAt,
  }).markEnqueued({ enqueuedAt });
  const completed =
    params.failureReason === undefined
      ? enqueued.markSucceeded({ completedAt: params.completedAt })
      : enqueued.markFailed({
          completedAt: params.completedAt,
          failureReason: params.failureReason,
        });

  await params.scanJobs.save(completed);
};

const recordSchedulerDecision = async (params: {
  readonly schedulerDecisions: ScanSchedulerDecisionHistoryPort;
  readonly tenant: ReturnType<typeof tenantId>;
  readonly workspace: ReturnType<typeof workspaceId>;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly providerKey: string;
  readonly decisionKey: string;
  readonly reason: ScanSchedulerDecisionReason;
  readonly scanJobId?: string;
  readonly evaluatedAt: Date;
}): Promise<void> => {
  await params.schedulerDecisions.recordBatch({
    records: [
      {
        id: `decision-${params.decisionKey}`,
        tenantId: params.tenant,
        workspaceId: params.workspace,
        decisionKey: params.decisionKey,
        scanPolicyId: params.scanPolicyId,
        sourceBindingId: params.sourceBindingId,
        providerKey: params.providerKey,
        decision: params.reason === 'scan_policy_due_now' ? 'enqueued' : 'skipped',
        reason: params.reason,
        scanJobId: params.scanJobId,
        policyDueAt: new Date(params.evaluatedAt.getTime() - 1_000),
        evaluatedAt: params.evaluatedAt,
        nextRunAt: new Date(params.evaluatedAt.getTime() + 300_000),
        configuredIntervalSeconds: 300,
        effectiveIntervalSeconds: 300,
        freshnessSeconds: 900,
        providerMinimumIntervalEnforced: false,
        causationId: `read-rest-${params.decisionKey}`,
      },
    ],
  });
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [MonitoringRestModule],
    providers: [
      {
        provide: APP_FILTER,
        useClass: DomainErrorFilter,
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  try {
    const scanJobs = moduleRef.get<ScanJobRepositoryPort>(MONITORING_SCAN_JOB_REPOSITORY);
    const schedulerDecisions = moduleRef.get<ScanSchedulerDecisionHistoryPort>(
      MONITORING_SCAN_SCHEDULER_DECISION_HISTORY,
    );
    const tenant = tenantId('tenant-monitoring-read-rest-smoke');
    const workspace = workspaceId('workspace-monitoring-read-rest-smoke');
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const otherWorkspaceHeaders = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspaceId('workspace-monitoring-read-rest-smoke-other'),
      'x-workspace-role': 'viewer',
    };
    const otherTenantHeaders = {
      'x-tenant-id': tenantId('tenant-monitoring-read-rest-smoke-other'),
      'x-workspace-id': workspace,
      'x-workspace-role': 'viewer',
    };

    await request(app.getHttpServer())
      .get('/topics')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    const oldTopic = await request(app.getHttpServer())
      .post('/topics')
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'topic-old')
      .send({
        name: 'AI Infrastructure',
        query: 'AI infrastructure',
      })
      .expect(201);

    const newTopic = await request(app.getHttpServer())
      .post('/topics')
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'topic-new')
      .send({
        name: 'Hacker News AI',
        query: 'AI site:news.ycombinator.com',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/topics')
      .set(headers)
      .set('x-workspace-role', 'member')
      .query({ limit: 0 })
      .expect(400);

    const firstTopicPage = await request(app.getHttpServer())
      .get('/topics')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .query({ limit: 1 })
      .expect(200);

    assert(firstTopicPage.body.topics.length === 1, 'topic REST list must honor page limit');
    assert(typeof firstTopicPage.body.nextCursor === 'string', 'topic REST list must return next cursor');

    const secondTopicPage = await request(app.getHttpServer())
      .get('/topics')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .query({ limit: 1, cursor: firstTopicPage.body.nextCursor })
      .expect(200);

    assert(secondTopicPage.body.topics.length === 1, 'topic REST list second page must return remaining topic');
    assert(
      [firstTopicPage.body.topics[0].id, secondTopicPage.body.topics[0].id].sort().join(',') ===
      [oldTopic.body.topicId, newTopic.body.topicId].sort().join(','),
      'topic REST list cursor must page through both created topics',
    );

    await request(app.getHttpServer())
      .post(`/topics/${newTopic.body.topicId}/source-bindings`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .set('idempotency-key', 'binding-forbidden')
      .send({
        providerKey: 'fake-source',
        config: { mode: 'search', query: 'AI', apiToken: 'secret-token' },
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/topics/${newTopic.body.topicId}/source-bindings`)
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'binding-rss-localhost-rejected')
      .send({
        providerKey: 'rss',
        config: { feedUrl: 'http://127.0.0.1/feed.xml' },
      })
      .expect(400);

    const binding = await request(app.getHttpServer())
      .post(`/topics/${newTopic.body.topicId}/source-bindings`)
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'binding-fake-source')
      .send({
        providerKey: 'fake-source',
        config: { mode: 'search', query: 'AI', apiToken: 'secret-token' },
      })
      .expect(201);

    const listedBindings = await request(app.getHttpServer())
      .get(`/topics/${newTopic.body.topicId}/source-bindings`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(listedBindings.body.sourceBindings.length === 1, 'source binding REST list must return binding');
    assert(
      listedBindings.body.sourceBindings[0].id === binding.body.sourceBindingId,
      'source binding REST list must preserve source binding id',
    );
    assert(
      listedBindings.body.sourceBindings[0].configPreview.apiToken.ciphertext === undefined,
      'source binding REST list must not expose encrypted ciphertext',
    );
    assert(
      listedBindings.body.sourceBindings[0].configPreview.apiToken.keyId === undefined,
      'source binding REST list must not expose encrypted key id',
    );
    assert(
      listedBindings.body.sourceBindings[0].configPreview.apiToken.encrypted === true,
      'source binding REST list must expose safe encrypted config marker',
    );

    const scanPolicy = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'scan-policy-fake-source')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    assert(scanPolicy.body.created === true, 'scan policy REST set must create policy');

    const fetchedScanPolicy = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(
      fetchedScanPolicy.body.id === scanPolicy.body.scanPolicyId,
      'scan policy REST get must return created policy',
    );
    assert(fetchedScanPolicy.body.intervalSeconds === 300, 'scan policy REST get must preserve interval');

    const sourceHealth = await request(app.getHttpServer())
      .get(`/topics/${newTopic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(
      sourceHealth.body.schedulerDecision.minimumIntervalSeconds === 60,
      'source binding health must expose provider minimum interval',
    );
    assert(
      sourceHealth.body.schedulerDecision.configuredIntervalSeconds === 300,
      'source binding health must expose configured interval',
    );
    assert(
      sourceHealth.body.schedulerDecision.effectiveIntervalSeconds === 300,
      'source binding health must expose effective interval',
    );
    assert(
      sourceHealth.body.schedulerDecision.providerMinimumIntervalEnforced === false,
      'source binding health must expose provider minimum enforcement flag',
    );

    const dailyHistory = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-requests/daily`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .query({ days: 1 })
      .expect(200);

    assert(
      dailyHistory.body.sourceBindingId === binding.body.sourceBindingId,
      'source binding daily history must preserve source binding id',
    );
    assert(
      dailyHistory.body.topicId === newTopic.body.topicId,
      'source binding daily history must expose topic id for frontend routing',
    );
    assert(
      dailyHistory.body.providerKey === 'fake-source',
      'source binding daily history must expose provider key for frontend grouping',
    );
    assert(
      dailyHistory.body.sourceBindingStatus === 'enabled',
      'source binding daily history must expose source binding status',
    );
    assert(
      dailyHistory.body.cadence.providerKey === 'fake-source',
      'source binding daily history must expose cadence provider key',
    );
    assert(
      dailyHistory.body.cadence.minimumIntervalSeconds === 60,
      'source binding daily history must expose provider minimum interval',
    );
    assert(
      dailyHistory.body.cadence.configuredIntervalSeconds === 300,
      'source binding daily history must expose configured interval',
    );
    assert(
      dailyHistory.body.cadence.effectiveIntervalSeconds === 300,
      'source binding daily history must expose effective interval',
    );
    assert(
      dailyHistory.body.cadence.providerMinimumIntervalEnforced === false,
      'source binding daily history must expose provider minimum enforcement flag',
    );
    assert(
      dailyHistory.body.summary.schedulerDecisionCount === 0,
      'source binding daily history must expose empty scheduler decision count',
    );
    assert(
      dailyHistory.body.summary.schedulerSkippedByReason.queueBackpressure === 0,
      'source binding daily history must expose empty scheduler skip breakdown',
    );
    await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-requests/daily`)
      .set(otherWorkspaceHeaders)
      .query({ days: 1 })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-requests/daily`)
      .set(otherTenantHeaders)
      .query({ days: 1 })
      .expect(404);

    const rssBinding = await request(app.getHttpServer())
      .post(`/topics/${newTopic.body.topicId}/source-bindings`)
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'binding-rss-topic-history')
      .send({
        providerKey: 'rss',
        config: { feedUrl: 'https://example.com/feed.xml' },
      })
      .expect(201);
    const rssPolicy = await request(app.getHttpServer())
      .post(`/source-bindings/${rssBinding.body.sourceBindingId}/scan-policy`)
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'scan-policy-rss-topic-history')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);
    const completedAt = new Date(Date.now() - 30_000);
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: binding.body.sourceBindingId,
      scanPolicyId: scanPolicy.body.scanPolicyId,
      scanJobId: 'topic-history-fake-source-success',
      completedAt,
    });
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: rssBinding.body.sourceBindingId,
      scanPolicyId: rssPolicy.body.scanPolicyId,
      scanJobId: 'topic-history-rss-rate-limit',
      completedAt: new Date(completedAt.getTime() + 1_000),
      failureReason: 'Provider rate limit 429',
    });
    await recordSchedulerDecision({
      schedulerDecisions,
      tenant,
      workspace,
      sourceBindingId: binding.body.sourceBindingId,
      scanPolicyId: scanPolicy.body.scanPolicyId,
      providerKey: 'fake-source',
      decisionKey: 'topic-history-fake-source-enqueued',
      reason: 'scan_policy_due_now',
      scanJobId: 'topic-history-fake-source-success',
      evaluatedAt: new Date(completedAt.getTime() - 2_000),
    });
    const dailyHistoryWithScheduler = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-requests/daily`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .query({ days: 1 })
      .expect(200);
    assert(
      dailyHistoryWithScheduler.body.summary.schedulerDecisionCount === 1,
      'source binding daily history must count scheduler decisions',
    );
    assert(
      dailyHistoryWithScheduler.body.summary.schedulerEnqueuedCount === 1,
      'source binding daily history must count scheduler enqueues',
    );
    assert(
      dailyHistoryWithScheduler.body.days[0].lastSchedulerEvaluatedAt !== undefined,
      'source binding daily history must expose last scheduler evaluation time',
    );
    await recordSchedulerDecision({
      schedulerDecisions,
      tenant,
      workspace,
      sourceBindingId: rssBinding.body.sourceBindingId,
      scanPolicyId: rssPolicy.body.scanPolicyId,
      providerKey: 'rss',
      decisionKey: 'topic-history-rss-rate-limit',
      reason: 'rate_limit_backoff',
      evaluatedAt: new Date(completedAt.getTime() - 1_000),
    });

    const topicDailyHistory = await request(app.getHttpServer())
      .get(`/topics/${newTopic.body.topicId}/source-bindings/daily-history`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .query({ days: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/topics/${newTopic.body.topicId}/source-bindings/daily-history`)
      .set(otherWorkspaceHeaders)
      .query({ days: 1 })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/topics/${newTopic.body.topicId}/source-bindings/daily-history`)
      .set(otherTenantHeaders)
      .query({ days: 1 })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/topics/${newTopic.body.topicId}/source-bindings/daily-history`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .query({ days: 0 })
      .expect(400);

    assert(
      topicDailyHistory.body.topicId === newTopic.body.topicId,
      'topic source daily history must preserve topic id',
    );
    assert(topicDailyHistory.body.days.length === 1, 'topic source daily history must honor days query');
    assert(
      topicDailyHistory.body.summary.sourceBindingCount === 2,
      'topic source daily history must count topic source bindings',
    );
    assert(
      topicDailyHistory.body.summary.configuredSourceBindingCount === 2,
      'topic source daily history must count configured bindings',
    );
    assert(
      topicDailyHistory.body.summary.scannedSourceBindingCount === 2,
      'topic source daily history must count scanned bindings',
    );
    assert(
      topicDailyHistory.body.summary.scanCoverageState === 'complete',
      'topic source daily history must expose complete scan coverage',
    );
    assert(topicDailyHistory.body.summary.totalScans === 2, 'topic source daily history must count scans');
    assert(topicDailyHistory.body.summary.succeededScans === 1, 'topic source daily history must count successes');
    assert(topicDailyHistory.body.summary.failedScans === 1, 'topic source daily history must count failures');
    assert(
      topicDailyHistory.body.summary.rateLimitedScans === 1,
      'topic source daily history must count rate-limited scans',
    );
    assert(
      topicDailyHistory.body.summary.schedulerDecisionCount === 2,
      'topic source daily history must count scheduler decisions',
    );
    assert(
      topicDailyHistory.body.summary.schedulerEnqueuedCount === 1,
      'topic source daily history must count scheduler enqueues',
    );
    assert(
      topicDailyHistory.body.summary.schedulerSkippedCount === 1,
      'topic source daily history must count scheduler skips',
    );
    assert(
      topicDailyHistory.body.summary.schedulerSkippedByReason.rateLimitBackoff === 1,
      'topic source daily history must expose rate-limit scheduler skip breakdown',
    );
    assert(
      topicDailyHistory.body.summary.providerBreakdown.some(
        (provider: { providerKey: string; succeededScans: number }) =>
          provider.providerKey === 'fake-source' && provider.succeededScans === 1,
      ),
      'topic source daily history must expose fake-source provider breakdown',
    );
    assert(
      topicDailyHistory.body.summary.providerBreakdown.some(
        (provider: {
          providerKey: string;
          failedScans: number;
          rateLimitedScans: number;
          schedulerSkippedByReason: { rateLimitBackoff: number };
        }) =>
          provider.providerKey === 'rss' &&
          provider.failedScans === 1 &&
          provider.rateLimitedScans === 1 &&
          provider.schedulerSkippedByReason.rateLimitBackoff === 1,
      ),
      'topic source daily history must expose RSS provider rate-limit breakdown',
    );

    const rssTopicDailyHistory = await request(app.getHttpServer())
      .get(`/topics/${newTopic.body.topicId}/source-bindings/daily-history`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .query({ days: 1, providerKey: 'rss' })
      .expect(200);
    assert(
      rssTopicDailyHistory.body.summary.sourceBindingCount === 1,
      'topic source daily history provider filter must narrow source binding count',
    );
    assert(
      rssTopicDailyHistory.body.summary.providerBreakdown.length === 1 &&
        rssTopicDailyHistory.body.summary.providerBreakdown[0].providerKey === 'rss',
      'topic source daily history provider filter must narrow provider breakdown',
    );

    await request(app.getHttpServer())
      .get('/topics/missing-topic/source-bindings')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(404);

    console.log('Monitoring read REST smoke OK');
  } finally {
    await app.close();
  }
}

void main();
