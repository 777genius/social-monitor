import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ScanJob, ScanPolicy } from '@social-monitor/monitoring/domain';
import {
  MONITORING_SCAN_JOB_REPOSITORY,
  MONITORING_SCAN_POLICY_REPOSITORY,
} from '@social-monitor/monitoring/interfaces/rest/monitoring-provider-tokens';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import type {
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
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

const createInterest = async (params: {
  readonly httpServer: HttpServer;
  readonly headers: RequestHeaders;
  readonly idempotencyKey: string;
  readonly name: string;
  readonly query: string;
}): Promise<string> => {
  const topic = await request(params.httpServer)
    .post('/interests')
    .set(params.headers)
    .set('idempotency-key', params.idempotencyKey)
    .send({
      name: params.name,
      query: params.query,
    })
    .expect(201);

  return topic.body.interestId;
};

const createBindingWithPolicy = async (params: {
  readonly httpServer: HttpServer;
  readonly interestId: string;
  readonly headers: RequestHeaders;
  readonly idempotencyKey: string;
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
  readonly providerKey?: string;
  readonly config?: Record<string, unknown>;
}): Promise<SourceBindingFixture> => {
  const binding = await request(params.httpServer)
    .post(`/interests/${params.interestId}/source-bindings`)
    .set(params.headers)
    .set('idempotency-key', `binding-${params.idempotencyKey}`)
    .send({
      providerKey: params.providerKey ?? 'fake-source',
      config: params.config ?? { mode: 'search', query: `health ${params.idempotencyKey}` },
    })
    .expect(201);

  const policy = await request(params.httpServer)
    .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
    .set(params.headers)
    .set('idempotency-key', `policy-${params.idempotencyKey}`)
    .send({
      intervalSeconds: params.intervalSeconds,
      freshnessSeconds: params.freshnessSeconds,
      retryBudget: 3,
    })
    .expect(201);

  return {
    sourceBindingId: binding.body.sourceBindingId,
    scanPolicyId: policy.body.scanPolicyId,
  };
};

const readHealth = async (params: {
  readonly httpServer: HttpServer;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly headers: RequestHeaders;
}) =>
  request(params.httpServer)
    .get(`/interests/${params.interestId}/source-bindings/${params.sourceBindingId}/health`)
    .set(params.headers)
    .expect(200);

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
    idempotencyKey: `seed-${params.scanJobId}`,
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

const movePolicyNextRunForward = async (params: {
  readonly scanPolicies: ScanPolicyRepositoryPort;
  readonly tenant: ReturnType<typeof tenantId>;
  readonly workspace: ReturnType<typeof workspaceId>;
  readonly sourceBindingId: string;
  readonly nextRunAt: Date;
}): Promise<void> => {
  const policy = await params.scanPolicies.findBySourceBinding({
    tenantId: params.tenant,
    workspaceId: params.workspace,
    sourceBindingId: params.sourceBindingId,
  });
  if (policy === null) {
    throw new Error('scheduled-later fixture must have scan policy');
  }
  await params.scanPolicies.save(policy.scheduleNext({ nextRunAt: params.nextRunAt }));
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
    const scanPolicies = moduleRef.get<ScanPolicyRepositoryPort>(MONITORING_SCAN_POLICY_REPOSITORY);
    const tenant = tenantId('tenant-source-health-rest-smoke');
    const workspace = workspaceId('workspace-source-health-rest-smoke');
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
      'x-workspace-id': workspaceId('workspace-source-health-rest-smoke-other'),
      'x-workspace-role': 'admin',
    };
    const otherTenantHeaders = {
      'x-tenant-id': tenantId('tenant-source-health-rest-smoke-other'),
      'x-workspace-id': workspace,
      'x-workspace-role': 'admin',
    };

    const topic = await request(app.getHttpServer())
      .post('/interests')
      .set(adminHeaders)
      .set('idempotency-key', 'topic')
      .send({
        name: 'Source Health',
        query: 'source operational health',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set(adminHeaders)
      .set('idempotency-key', 'binding')
      .send({
        providerKey: 'fake-source',
        config: { mode: 'search', query: 'health' },
      })
      .expect(201);

    const healthBeforePolicy = await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set(viewerHeaders)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set(otherWorkspaceHeaders)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set(otherTenantHeaders)
      .expect(404);

    assert(
      healthBeforePolicy.body.healthState === 'not_configured',
      'source health must show missing scan policy before policy setup',
    );
    assert(
      healthBeforePolicy.body.operatorAction === 'create_scan_policy_for_source_binding',
      'source health must return setup action before policy exists',
    );
    assert(
      healthBeforePolicy.body.healthExplanation.reasonCode === 'source_not_configured',
      'source health must explain missing scan policy',
    );
    assert(
      healthBeforePolicy.body.recentWindow.providerHealthState === 'unknown',
      'source health must expose unknown provider health before scans',
    );
    assert(
      healthBeforePolicy.body.recentWindow.totalScans === 0,
      'source health recent window must start with no scans',
    );
    assert(
      healthBeforePolicy.body.schedulerDecision.decision === 'not_configured',
      'source health must expose missing-policy scheduler decision',
    );

    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set(adminHeaders)
      .set('idempotency-key', 'policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    const healthAfterPolicy = await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set(viewerHeaders)
      .expect(200);

    assert(healthAfterPolicy.body.healthState === 'scheduled', 'source health must show scheduled source');
    assert(healthAfterPolicy.body.scanPolicy.intervalSeconds === 300, 'source health must expose scan policy');
    assert(healthAfterPolicy.body.latestScan === undefined, 'source health must omit latest scan before first run');
    assert(
      healthAfterPolicy.body.schedulerDecision.decision === 'ready',
      'source health must expose ready scheduler decision after due policy setup',
    );
    assert(
      healthAfterPolicy.body.schedulerDecision.canScanNow === true,
      'source health ready scheduler decision must be scannable',
    );

    const scan = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set(adminHeaders)
      .set('idempotency-key', 'scan')
      .expect(201);
    assert(
      scan.body.requestDecision.decision === 'created',
      'scan request must expose created request decision',
    );
    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set(otherWorkspaceHeaders)
      .set('idempotency-key', 'scan-other-workspace')
      .expect(404);
    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set(otherTenantHeaders)
      .set('idempotency-key', 'scan-other-tenant')
      .expect(404);

    const healthDuringScan = await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set(viewerHeaders)
      .expect(200);

    assert(healthDuringScan.body.healthState === 'scanning', 'source health must show active scan');
    assert(
      healthDuringScan.body.latestScan.scanJobId === scan.body.scanJobId,
      'source health must expose latest scan job id',
    );
    assert(
      healthDuringScan.body.recentWindow.activeScans === 1,
      'source health recent window must count active scans',
    );
    assert(
      healthDuringScan.body.recentWindow.signals.includes('active_scan_in_progress'),
      'source health recent window must expose active scan signal',
    );
    assert(
      healthDuringScan.body.schedulerDecision.decision === 'active_scan',
      'source health must expose active scan scheduler decision',
    );

    await request(app.getHttpServer())
      .patch(`/interests/${topic.body.interestId}/source-bindings/${binding.body.sourceBindingId}/status`)
      .set(adminHeaders)
      .set('idempotency-key', 'pause-binding')
      .send({ status: 'paused' })
      .expect(200);

    const pausedHealth = await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set(viewerHeaders)
      .expect(200);

    assert(pausedHealth.body.healthState === 'paused', 'source health must prioritize paused state');
    assert(
      pausedHealth.body.schedulerDecision.decision === 'paused',
      'source health must expose paused scheduler decision',
    );

    const freshInterestId = await createInterest({
      httpServer: app.getHttpServer(),
      headers: adminHeaders,
      idempotencyKey: 'topic-fresh',
      name: 'Fresh source health',
      query: 'fresh source operational health',
    });
    const fresh = await createBindingWithPolicy({
      httpServer: app.getHttpServer(),
      interestId: freshInterestId,
      headers: adminHeaders,
      idempotencyKey: 'fresh',
      intervalSeconds: 300,
      freshnessSeconds: 900,
    });
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: fresh.sourceBindingId,
      scanPolicyId: fresh.scanPolicyId,
      scanJobId: 'fresh-success-scan',
      completedAt: new Date(Date.now() - 30_000),
    });

    const freshHealth = await readHealth({
      httpServer: app.getHttpServer(),
      interestId: freshInterestId,
      sourceBindingId: fresh.sourceBindingId,
      headers: viewerHeaders,
    });
    assert(
      freshHealth.body.healthState === 'healthy',
      `source health must mark fresh success healthy, got ${freshHealth.body.healthState}`,
    );
    assert(freshHealth.body.freshness.isFresh === true, 'source health must expose fresh successful scan');
    assert(
      freshHealth.body.schedulerDecision.decision === 'fresh_success',
      'source health must expose fresh-success scheduler decision',
    );
    assert(
      freshHealth.body.schedulerDecision.canScanNow === false,
      'fresh-success scheduler decision must not scan again immediately',
    );
    assert(
      freshHealth.body.recentWindow.providerHealthState === 'operational',
      'fresh successful scan must mark provider window operational',
    );
    assert(
      freshHealth.body.recentWindow.signals.includes('recent_success'),
      'fresh successful scan must expose recent success signal',
    );

    const rateLimitedInterestId = await createInterest({
      httpServer: app.getHttpServer(),
      headers: adminHeaders,
      idempotencyKey: 'topic-rate-limited',
      name: 'Rate limited source health',
      query: 'rate limited source operational health',
    });
    const rateLimited = await createBindingWithPolicy({
      httpServer: app.getHttpServer(),
      interestId: rateLimitedInterestId,
      headers: adminHeaders,
      idempotencyKey: 'rate-limited',
      intervalSeconds: 300,
      freshnessSeconds: 900,
    });
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: rateLimited.sourceBindingId,
      scanPolicyId: rateLimited.scanPolicyId,
      scanJobId: 'rate-limited-scan',
      completedAt: new Date(Date.now() - 30_000),
      failureReason: 'Provider rate limit 429',
    });

    const rateLimitedHealth = await readHealth({
      httpServer: app.getHttpServer(),
      interestId: rateLimitedInterestId,
      sourceBindingId: rateLimited.sourceBindingId,
      headers: viewerHeaders,
    });
    assert(rateLimitedHealth.body.healthState === 'rate_limited', 'rate-limited source health must be rate_limited');
    assert(
      rateLimitedHealth.body.healthExplanation.reasonCode === 'source_rate_limited',
      'rate-limited source health must expose rate-limit explanation',
    );
    assert(
      rateLimitedHealth.body.latestScan.failureClass === 'provider_rate_limited',
      'source health must classify latest rate-limit failure',
    );
    assert(
      rateLimitedHealth.body.schedulerDecision.decision === 'rate_limit_backoff',
      'source health must expose rate-limit backoff scheduler decision',
    );
    assert(
      rateLimitedHealth.body.schedulerDecision.rateLimitBackoffUntil !== undefined,
      'rate-limit scheduler decision must expose backoff deadline',
    );
    assert(
      rateLimitedHealth.body.recentWindow.rateLimitedScans === 1,
      'source health recent window must count rate-limited scans',
    );
    assert(
      rateLimitedHealth.body.recentWindow.signals.includes('rate_limited'),
      'source health recent window must expose rate-limit signal',
    );

    const providerFailureInterestId = await createInterest({
      httpServer: app.getHttpServer(),
      headers: adminHeaders,
      idempotencyKey: 'topic-provider-failure',
      name: 'Provider failure source health',
      query: 'provider failure source operational health',
    });
    const providerFailure = await createBindingWithPolicy({
      httpServer: app.getHttpServer(),
      interestId: providerFailureInterestId,
      headers: adminHeaders,
      idempotencyKey: 'provider-failure',
      intervalSeconds: 300,
      freshnessSeconds: 900,
    });
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: providerFailure.sourceBindingId,
      scanPolicyId: providerFailure.scanPolicyId,
      scanJobId: 'provider-failure-scan-1',
      completedAt: new Date(Date.now() - 90_000),
      failureReason: 'kind=auth_failed provider credential rejected',
    });
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: providerFailure.sourceBindingId,
      scanPolicyId: providerFailure.scanPolicyId,
      scanJobId: 'provider-failure-scan-2',
      completedAt: new Date(Date.now() - 30_000),
      failureReason: 'kind=auth_failed provider credential rejected',
    });

    const providerFailureHealth = await readHealth({
      httpServer: app.getHttpServer(),
      interestId: providerFailureInterestId,
      sourceBindingId: providerFailure.sourceBindingId,
      headers: viewerHeaders,
    });
    assert(
      providerFailureHealth.body.healthState === 'auth_failed',
      'source health must keep credential failures separate from provider outages',
    );
    assert(
      providerFailureHealth.body.latestScan.failureClass === 'provider_auth_failed',
      'source health must classify credential failures as auth failures',
    );
    assert(
      providerFailureHealth.body.schedulerDecision.decision === 'provider_failure_backoff',
      'source health must expose provider failure backoff scheduler decision',
    );
    assert(
      providerFailureHealth.body.schedulerDecision.providerFailureBackoffUntil !== undefined,
      'provider failure scheduler decision must expose backoff deadline',
    );
    assert(
      providerFailureHealth.body.recentWindow.authFailedScans === 2,
      'source health recent window must count auth failures',
    );
    assert(
      providerFailureHealth.body.recentWindow.providerUnavailableScans === 0,
      'source health recent window must not collapse auth into provider unavailable',
    );
    assert(
      providerFailureHealth.body.recentWindow.consecutiveFailures === 2,
      'source health recent window must count consecutive provider failures',
    );
    assert(
      providerFailureHealth.body.recentWindow.signals.includes('consecutive_failures'),
      'source health recent window must expose consecutive failure signal',
    );

    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: providerFailure.sourceBindingId,
      scanPolicyId: providerFailure.scanPolicyId,
      scanJobId: 'provider-failure-scan-3',
      completedAt: new Date(Date.now() - 10_000),
      failureReason: 'kind=auth_failed provider credential rejected',
    });

    const providerDownHealth = await readHealth({
      httpServer: app.getHttpServer(),
      interestId: providerFailureInterestId,
      sourceBindingId: providerFailure.sourceBindingId,
      headers: viewerHeaders,
    });
    assert(
      providerDownHealth.body.healthState === 'auth_failed',
      `source health must keep repeated auth failures explainable, got ${providerDownHealth.body.healthState}`,
    );
    assert(
      providerDownHealth.body.recentWindow.providerHealthState === 'down',
      'source health must still mark repeated auth failures down in provider window',
    );
    assert(
      providerDownHealth.body.operatorAction === 'refresh_or_reconnect_source_credentials',
      'source health must expose credential reconnect operator action',
    );

    const scheduledLaterInterestId = await createInterest({
      httpServer: app.getHttpServer(),
      headers: adminHeaders,
      idempotencyKey: 'topic-scheduled-later',
      name: 'Scheduled later source health',
      query: 'scheduled later source operational health',
    });
    const scheduledLater = await createBindingWithPolicy({
      httpServer: app.getHttpServer(),
      interestId: scheduledLaterInterestId,
      headers: adminHeaders,
      idempotencyKey: 'scheduled-later',
      intervalSeconds: 300,
      freshnessSeconds: 900,
    });
    await movePolicyNextRunForward({
      scanPolicies,
      tenant,
      workspace,
      sourceBindingId: scheduledLater.sourceBindingId,
      nextRunAt: new Date(Date.now() + 300_000),
    });

    const scheduledLaterHealth = await readHealth({
      httpServer: app.getHttpServer(),
      interestId: scheduledLaterInterestId,
      sourceBindingId: scheduledLater.sourceBindingId,
      headers: viewerHeaders,
    });
    assert(
      scheduledLaterHealth.body.schedulerDecision.decision === 'scheduled_later',
      'source health must expose scheduled-later scheduler decision',
    );
    assert(
      scheduledLaterHealth.body.schedulerDecision.canScanNow === false,
      'scheduled-later scheduler decision must not scan before nextRunAt',
    );
    assert(
      scheduledLaterHealth.body.schedulerDecision.nextEligibleAt !== undefined,
      'scheduled-later scheduler decision must expose next eligible time',
    );

    const trendingPageInterestId = await createInterest({
      httpServer: app.getHttpServer(),
      headers: adminHeaders,
      idempotencyKey: 'topic-trending-page-cadence',
      name: 'GitHub Trending cadence health',
      query: 'github trending cadence floor',
    });
    const trendingPageBinding = await request(app.getHttpServer())
      .post(`/interests/${trendingPageInterestId}/source-bindings`)
      .set(adminHeaders)
      .set('idempotency-key', 'binding-trending-page-cadence')
      .send({
        providerKey: 'github-trending-page',
        config: {
          spokenLanguage: 'en',
          language: 'TypeScript',
          since: 'daily',
          maxItems: 10,
        },
      })
      .expect(201);

    const tooFastTrendingPagePolicy = await request(app.getHttpServer())
      .post(`/source-bindings/${trendingPageBinding.body.sourceBindingId}/scan-policy`)
      .set(adminHeaders)
      .set('idempotency-key', 'policy-trending-page-too-fast')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(400);
    assert(
      tooFastTrendingPagePolicy.body.code === 'validation.failed',
      'too-fast GitHub Trending page scan policy must return validation problem code',
    );
    assert(
      tooFastTrendingPagePolicy.body.details.providerKey === 'github-trending-page',
      'too-fast GitHub Trending page scan policy problem must expose provider key',
    );
    assert(
      tooFastTrendingPagePolicy.body.details.intervalSeconds === 300,
      'too-fast GitHub Trending page scan policy problem must expose configured interval',
    );
    assert(
      tooFastTrendingPagePolicy.body.details.minimumIntervalSeconds === 86_400,
      'too-fast GitHub Trending page scan policy problem must expose provider minimum interval',
    );

    await scanPolicies.save(
      ScanPolicy.create({
        id: 'legacy-trending-page-cadence-policy',
        tenantId: tenant,
        workspaceId: workspace,
        sourceBindingId: trendingPageBinding.body.sourceBindingId,
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: new Date(Date.now() - 1_000),
        createdAt: new Date(Date.now() - 2_000),
      }),
    );

    const trendingPageHealth = await readHealth({
      httpServer: app.getHttpServer(),
      interestId: trendingPageInterestId,
      sourceBindingId: trendingPageBinding.body.sourceBindingId,
      headers: viewerHeaders,
    });
    assert(
      trendingPageHealth.body.scanPolicy.cadence.minimumIntervalSeconds === 86_400,
      'GitHub Trending page scan policy must expose provider minimum interval',
    );
    assert(
      trendingPageHealth.body.scanPolicy.cadence.configuredIntervalSeconds === 300,
      'GitHub Trending page scan policy must expose legacy configured interval',
    );
    assert(
      trendingPageHealth.body.scanPolicy.cadence.effectiveIntervalSeconds === 86_400,
      'GitHub Trending page scan policy must expose provider-capped effective interval',
    );
    assert(
      trendingPageHealth.body.scanPolicy.cadence.providerMinimumIntervalEnforced === true,
      'GitHub Trending page scan policy must mark provider minimum enforcement',
    );
    assert(
      trendingPageHealth.body.schedulerDecision.minimumIntervalSeconds === 86_400,
      'GitHub Trending page health decision must expose provider minimum interval',
    );
    assert(
      trendingPageHealth.body.schedulerDecision.effectiveIntervalSeconds === 86_400,
      'GitHub Trending page health decision must use provider-capped effective interval',
    );
    assert(
      trendingPageHealth.body.schedulerDecision.providerMinimumIntervalEnforced === true,
      'GitHub Trending page health decision must mark provider minimum enforcement',
    );
    assert(
      trendingPageHealth.body.schedulerDecision.signals.includes('provider_minimum_interval_enforced'),
      'GitHub Trending page health decision must expose provider minimum enforcement signal',
    );

    const repoRadarInterestId = await createInterest({
      httpServer: app.getHttpServer(),
      headers: adminHeaders,
      idempotencyKey: 'topic-repo-radar-cadence',
      name: 'Repo Radar cadence health',
      query: 'repo radar cadence floor',
    });
    const repoRadarBinding = await request(app.getHttpServer())
      .post(`/interests/${repoRadarInterestId}/source-bindings`)
      .set(adminHeaders)
      .set('idempotency-key', 'binding-repo-radar-cadence')
      .send({
        providerKey: 'github-repo-radar',
        config: {
          mode: 'search',
          topics: ['ai'],
          languages: ['TypeScript'],
          windows: ['24h', '7d'],
          maxItems: 10,
          maxCandidates: 20,
        },
      })
      .expect(201);

    const tooFastRepoRadarPolicy = await request(app.getHttpServer())
      .post(`/source-bindings/${repoRadarBinding.body.sourceBindingId}/scan-policy`)
      .set(adminHeaders)
      .set('idempotency-key', 'policy-repo-radar-too-fast')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(400);
    assert(
      tooFastRepoRadarPolicy.body.code === 'validation.failed',
      'too-fast repo-radar scan policy must return validation problem code',
    );
    assert(
      tooFastRepoRadarPolicy.body.details.providerKey === 'github-repo-radar',
      'too-fast repo-radar scan policy problem must expose provider key',
    );
    assert(
      tooFastRepoRadarPolicy.body.details.intervalSeconds === 300,
      'too-fast repo-radar scan policy problem must expose configured interval',
    );
    assert(
      tooFastRepoRadarPolicy.body.details.minimumIntervalSeconds === 21_600,
      'too-fast repo-radar scan policy problem must expose provider minimum interval',
    );

    await scanPolicies.save(
      ScanPolicy.create({
        id: 'legacy-repo-radar-cadence-policy',
        tenantId: tenant,
        workspaceId: workspace,
        sourceBindingId: repoRadarBinding.body.sourceBindingId,
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: new Date(Date.now() - 1_000),
        createdAt: new Date(Date.now() - 2_000),
      }),
    );

    const repoRadarHealth = await readHealth({
      httpServer: app.getHttpServer(),
      interestId: repoRadarInterestId,
      sourceBindingId: repoRadarBinding.body.sourceBindingId,
      headers: viewerHeaders,
    });
    assert(
      repoRadarHealth.body.scanPolicy.cadence.minimumIntervalSeconds === 21_600,
      'repo-radar scan policy must expose provider minimum interval',
    );
    assert(
      repoRadarHealth.body.scanPolicy.cadence.configuredIntervalSeconds === 300,
      'repo-radar scan policy must expose legacy configured interval',
    );
    assert(
      repoRadarHealth.body.scanPolicy.cadence.effectiveIntervalSeconds === 21_600,
      'repo-radar scan policy must expose provider-capped effective interval',
    );
    assert(
      repoRadarHealth.body.scanPolicy.cadence.providerMinimumIntervalEnforced === true,
      'repo-radar scan policy must mark provider minimum enforcement',
    );
    assert(
      repoRadarHealth.body.schedulerDecision.minimumIntervalSeconds === 21_600,
      'repo-radar health decision must expose provider minimum interval',
    );
    assert(
      repoRadarHealth.body.schedulerDecision.effectiveIntervalSeconds === 21_600,
      'repo-radar health decision must use provider-capped effective interval',
    );
    assert(
      repoRadarHealth.body.schedulerDecision.providerMinimumIntervalEnforced === true,
      'repo-radar health decision must mark provider minimum enforcement',
    );
    assert(
      repoRadarHealth.body.schedulerDecision.signals.includes('provider_minimum_interval_enforced'),
      'repo-radar health decision must expose provider minimum enforcement signal',
    );

    const overviewInterestId = await createInterest({
      httpServer: app.getHttpServer(),
      headers: adminHeaders,
      idempotencyKey: 'topic-overview',
      name: 'Source overview health',
      query: 'multi provider source overview health',
    });
    const overviewRss = await createBindingWithPolicy({
      httpServer: app.getHttpServer(),
      interestId: overviewInterestId,
      headers: adminHeaders,
      idempotencyKey: 'overview-rss',
      intervalSeconds: 300,
      freshnessSeconds: 900,
      providerKey: 'rss',
      config: { feedUrl: 'https://example.com/feed.xml' },
    });
    const overviewReddit = await createBindingWithPolicy({
      httpServer: app.getHttpServer(),
      interestId: overviewInterestId,
      headers: adminHeaders,
      idempotencyKey: 'overview-reddit',
      intervalSeconds: 900,
      freshnessSeconds: 900,
      providerKey: 'reddit',
      config: { mode: 'listing', subreddit: 'OpenAI', listing: 'hot' },
    });
    const overviewGithubIssues = await createBindingWithPolicy({
      httpServer: app.getHttpServer(),
      interestId: overviewInterestId,
      headers: adminHeaders,
      idempotencyKey: 'overview-github-issues',
      intervalSeconds: 300,
      freshnessSeconds: 900,
      providerKey: 'github-issues',
      config: { mode: 'search', query: 'repo:777genius/social-monitor provider health' },
    });
    const overviewHackerNews = await createBindingWithPolicy({
      httpServer: app.getHttpServer(),
      interestId: overviewInterestId,
      headers: adminHeaders,
      idempotencyKey: 'overview-hacker-news',
      intervalSeconds: 300,
      freshnessSeconds: 900,
      providerKey: 'hacker-news',
      config: { mode: 'listing', listing: 'top' },
    });
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: overviewRss.sourceBindingId,
      scanPolicyId: overviewRss.scanPolicyId,
      scanJobId: 'overview-rss-fresh-success',
      completedAt: new Date(Date.now() - 30_000),
    });
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: overviewReddit.sourceBindingId,
      scanPolicyId: overviewReddit.scanPolicyId,
      scanJobId: 'overview-reddit-rate-limited',
      completedAt: new Date(Date.now() - 30_000),
      failureReason: 'Provider rate limit 429',
    });
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: overviewGithubIssues.sourceBindingId,
      scanPolicyId: overviewGithubIssues.scanPolicyId,
      scanJobId: 'overview-github-provider-failure-1',
      completedAt: new Date(Date.now() - 90_000),
      failureReason: 'kind=auth_failed provider credential rejected',
    });
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: overviewGithubIssues.sourceBindingId,
      scanPolicyId: overviewGithubIssues.scanPolicyId,
      scanJobId: 'overview-github-provider-failure-2',
      completedAt: new Date(Date.now() - 30_000),
      failureReason: 'kind=auth_failed provider credential rejected',
    });
    await seedCompletedScan({
      scanJobs,
      tenant,
      workspace,
      sourceBindingId: overviewGithubIssues.sourceBindingId,
      scanPolicyId: overviewGithubIssues.scanPolicyId,
      scanJobId: 'overview-github-provider-failure-3',
      completedAt: new Date(Date.now() - 10_000),
      failureReason: 'kind=auth_failed provider credential rejected',
    });
    await movePolicyNextRunForward({
      scanPolicies,
      tenant,
      workspace,
      sourceBindingId: overviewHackerNews.sourceBindingId,
      nextRunAt: new Date(Date.now() + 300_000),
    });

    const overview = await request(app.getHttpServer())
      .get(`/interests/${overviewInterestId}/source-bindings/overview`)
      .set(viewerHeaders)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/interests/${overviewInterestId}/source-bindings/overview`)
      .set(otherWorkspaceHeaders)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/interests/${overviewInterestId}/source-bindings/overview`)
      .set(otherTenantHeaders)
      .expect(404);

    assert(overview.body.items.length === 4, 'source overview must expose every provider binding health item');
    assert(overview.body.summary.totalBindings === 4, 'source overview must count all bindings');
    assert(overview.body.summary.healthyBindings === 1, 'source overview must count healthy bindings');
    assert(overview.body.summary.degradedBindings === 0, 'source overview must not collapse explainable failures into degraded');
    assert(overview.body.summary.downBindings === 0, 'source overview must not collapse auth failures into down');
    assert(overview.body.summary.authFailedBindings === 1, 'source overview must count auth-failed bindings');
    assert(overview.body.summary.scheduledBindings === 1, 'source overview must count scheduled bindings');
    assert(overview.body.summary.freshSuccessSkips === 1, 'source overview must count fresh-success skips');
    assert(overview.body.summary.rateLimitedBindings === 1, 'source overview must count rate-limited bindings');
    assert(
      overview.body.summary.providerFailureBackoffSkips === 1,
      'source overview must count provider failure backoff skips',
    );
    assert(
      overview.body.summary.providerUnavailableScans === 0,
      'source overview must not collapse auth failures into provider unavailable scans',
    );
    assert(
      overview.body.summary.signals.includes('fresh_success_skip'),
      'source overview must expose fresh-success signal',
    );
    assert(
      overview.body.summary.signals.includes('rate_limit_backoff'),
      'source overview must expose rate-limit signal',
    );
    assert(
      overview.body.summary.signals.includes('provider_failure_backoff'),
      'source overview must expose provider failure backoff signal',
    );
    assert(
      overview.body.summary.signals.includes('source_auth_failed'),
      'source overview must expose auth-failed signal',
    );
    assert(
      overview.body.summary.signals.includes('source_rate_limited'),
      'source overview must expose rate-limited health signal',
    );
    assert(
      overview.body.summary.signals.includes('scheduled_later'),
      'source overview must expose scheduled-later signal',
    );
    assert(
      overview.body.summary.providerBreakdown.some(
        (provider: { providerKey: string; healthyBindings: number }) =>
          provider.providerKey === 'rss' && provider.healthyBindings === 1,
      ),
      'source overview must break down RSS healthy binding',
    );
    assert(
      overview.body.summary.providerBreakdown.some(
        (provider: {
          providerKey: string;
          rateLimitedBindings: number;
          degradedBindings: number;
          rateLimitBackoffSkips: number;
        }) =>
          provider.providerKey === 'reddit' &&
          provider.rateLimitedBindings === 1 &&
          provider.degradedBindings === 0 &&
          provider.rateLimitBackoffSkips === 1,
      ),
      'source overview must break down Reddit rate-limit state',
    );
    assert(
      overview.body.summary.providerBreakdown.some(
        (provider: {
          providerKey: string;
          authFailedBindings: number;
          downBindings: number;
          providerFailureBackoffSkips: number;
        }) =>
          provider.providerKey === 'github-issues' &&
          provider.authFailedBindings === 1 &&
          provider.downBindings === 0 &&
          provider.providerFailureBackoffSkips === 1,
      ),
      'source overview must break down GitHub provider failure state',
    );

    console.log('Source binding health REST smoke OK');
  } finally {
    await app.close();
  }
}

void main();
