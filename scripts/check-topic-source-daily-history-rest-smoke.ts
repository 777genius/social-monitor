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

type HttpServer = Parameters<typeof request>[0];
type RequestHeaders = Record<string, string>;

type SourceBindingFixture = {
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
};

const createTopic = async (params: {
  readonly httpServer: HttpServer;
  readonly headers: RequestHeaders;
}): Promise<string> => {
  const topic = await request(params.httpServer)
    .post('/topics')
    .set(params.headers)
    .set('idempotency-key', 'topic-source-daily-history')
    .send({
      name: 'Topic Source History',
      query: 'AI developer tooling trend history',
    })
    .expect(201);

  return topic.body.topicId;
};

const createBindingWithPolicy = async (params: {
  readonly httpServer: HttpServer;
  readonly topicId: string;
  readonly headers: RequestHeaders;
  readonly idempotencyKey: string;
  readonly providerKey: string;
  readonly config: Record<string, unknown>;
}): Promise<SourceBindingFixture> => {
  const binding = await request(params.httpServer)
    .post(`/topics/${params.topicId}/source-bindings`)
    .set(params.headers)
    .set('idempotency-key', `binding-${params.idempotencyKey}`)
    .send({
      providerKey: params.providerKey,
      config: params.config,
    })
    .expect(201);

  const policy = await request(params.httpServer)
    .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
    .set(params.headers)
    .set('idempotency-key', `policy-${params.idempotencyKey}`)
    .send({
      intervalSeconds: 300,
      freshnessSeconds: 900,
      retryBudget: 3,
    })
    .expect(201);

  return {
    sourceBindingId: binding.body.sourceBindingId,
    scanPolicyId: policy.body.scanPolicyId,
  };
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
    idempotencyKey: `topic-source-daily-history-${params.scanJobId}`,
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
        causationId: `topic-source-daily-history-${params.decisionKey}`,
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
    const tenant = tenantId('tenant-topic-source-daily-history-rest-smoke');
    const workspace = workspaceId('workspace-topic-source-daily-history-rest-smoke');
    const adminHeaders = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
      'x-workspace-role': 'admin',
    };
    const viewerHeaders = {
      ...adminHeaders,
      'x-workspace-role': 'viewer',
    };
    const otherWorkspaceHeaders = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspaceId('workspace-topic-source-daily-history-rest-smoke-other'),
      'x-workspace-role': 'viewer',
    };

    const topicId = await createTopic({
      httpServer: app.getHttpServer(),
      headers: adminHeaders,
    });
    const fakeSource = await createBindingWithPolicy({
      httpServer: app.getHttpServer(),
      topicId,
      headers: adminHeaders,
      idempotencyKey: 'fake-source',
      providerKey: 'fake-source',
      config: { mode: 'search', query: 'AI agents' },
    });
    const rss = await createBindingWithPolicy({
      httpServer: app.getHttpServer(),
      topicId,
      headers: adminHeaders,
      idempotencyKey: 'rss',
      providerKey: 'rss',
      config: { feedUrl: 'https://example.com/feed.xml' },
    });
    const completedAt = new Date(Date.now() - 30_000);

    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: fakeSource.sourceBindingId,
      scanPolicyId: fakeSource.scanPolicyId,
      scanJobId: 'topic-source-daily-history-fake-source-success',
      completedAt,
    });
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: rss.sourceBindingId,
      scanPolicyId: rss.scanPolicyId,
      scanJobId: 'topic-source-daily-history-rss-rate-limit',
      completedAt: new Date(completedAt.getTime() + 1_000),
      failureReason: 'Provider rate limit 429',
    });
    await recordSchedulerDecision({
      schedulerDecisions,
      tenant,
      workspace,
      sourceBindingId: fakeSource.sourceBindingId,
      scanPolicyId: fakeSource.scanPolicyId,
      providerKey: 'fake-source',
      decisionKey: 'fake-source-enqueued',
      reason: 'scan_policy_due_now',
      scanJobId: 'topic-source-daily-history-fake-source-success',
      evaluatedAt: new Date(completedAt.getTime() - 2_000),
    });
    await recordSchedulerDecision({
      schedulerDecisions,
      tenant,
      workspace,
      sourceBindingId: rss.sourceBindingId,
      scanPolicyId: rss.scanPolicyId,
      providerKey: 'rss',
      decisionKey: 'rss-rate-limit',
      reason: 'rate_limit_backoff',
      evaluatedAt: new Date(completedAt.getTime() - 1_000),
    });

    const history = await request(app.getHttpServer())
      .get(`/topics/${topicId}/source-bindings/daily-history`)
      .set(viewerHeaders)
      .query({ days: 1 })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/topics/${topicId}/source-bindings/daily-history`)
      .set(otherWorkspaceHeaders)
      .query({ days: 1 })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/topics/${topicId}/source-bindings/daily-history`)
      .set(viewerHeaders)
      .query({ days: 0 })
      .expect(400);

    assert(history.body.topicId === topicId, 'topic source daily history must preserve topic id');
    assert(history.body.days.length === 1, 'topic source daily history must honor days query');
    assert(history.body.summary.sourceBindingCount === 2, 'topic source daily history must count source bindings');
    assert(history.body.summary.configuredSourceBindingCount === 2, 'topic source daily history must count configured bindings');
    assert(history.body.summary.scannedSourceBindingCount === 2, 'topic source daily history must count scanned bindings');
    assert(history.body.summary.scanCoverageState === 'complete', 'topic source daily history must expose complete scan coverage');
    assert(history.body.summary.succeededScans === 1, 'topic source daily history must count successful scans');
    assert(history.body.summary.failedScans === 1, 'topic source daily history must count failed scans');
    assert(history.body.summary.rateLimitedScans === 1, 'topic source daily history must classify rate limits');
    assert(history.body.summary.schedulerDecisionCount === 2, 'topic source daily history must count scheduler decisions');
    assert(history.body.summary.schedulerEnqueuedCount === 1, 'topic source daily history must count scheduler enqueues');
    assert(history.body.summary.schedulerSkippedCount === 1, 'topic source daily history must count scheduler skips');
    assert(
      history.body.summary.schedulerSkippedByReason.rateLimitBackoff === 1,
      'topic source daily history must expose rate-limit scheduler skip breakdown',
    );
    assert(
      history.body.summary.providerBreakdown.some(
        (provider: { providerKey: string; succeededScans: number }) =>
          provider.providerKey === 'fake-source' && provider.succeededScans === 1,
      ),
      'topic source daily history must expose successful fake-source provider breakdown',
    );
    assert(
      history.body.summary.providerBreakdown.some(
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
      'topic source daily history must expose RSS rate-limit provider breakdown',
    );
    assert(
      history.body.days[0].providerBreakdown.length === 2,
      'topic source daily history day view must expose per-provider breakdown',
    );

    const rssOnly = await request(app.getHttpServer())
      .get(`/topics/${topicId}/source-bindings/daily-history`)
      .set(viewerHeaders)
      .query({ days: 1, providerKey: 'rss' })
      .expect(200);

    assert(rssOnly.body.summary.sourceBindingCount === 1, 'provider filter must narrow source binding count');
    assert(
      rssOnly.body.summary.providerBreakdown.length === 1 &&
        rssOnly.body.summary.providerBreakdown[0].providerKey === 'rss',
      'provider filter must narrow provider breakdown',
    );

    console.log('Topic source daily history REST smoke OK');
  } finally {
    await app.close();
  }
}

void main();
