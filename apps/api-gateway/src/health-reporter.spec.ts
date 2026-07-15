import type { SourceReadinessFreshnessGuard, SourceReadinessProfile } from '@social-monitor/ingestion/ports';
import { FixedClock } from '@social-monitor/shared-kernel';

import { ApiGatewayHealthReporter } from './health-reporter';

const databaseReady = { check: jest.fn(async () => undefined) };

const readinessProfiles: readonly SourceReadinessProfile[] = [
  {
    providerKey: 'reddit',
    state: 'enabled_beta',
    runtimeReadiness: 'fixture_ready',
    liveBetaBlockers: ['live credentials pending'],
    liveEvidenceRequirements: [],
    freshnessGuard: makeFreshnessGuard({
      maxStalenessSeconds: 900,
      minimumScanIntervalSeconds: 900,
      skipRecentlyScanned: true,
    }),
    acquisitionMode: 'api',
    approvalOwner: 'source-owner',
    termsNotes: 'fixture only',
    credentialOwnership: 'platform',
    quotaModel: 'per_app',
    retentionNotes: 'none',
    cursorModel: 'time',
    identityStrategy: ['provider id'],
    supportedContentUnits: ['post'],
    unsupportedContentUnits: ['comment'],
    estimatedCostPerScan: 'low',
    betaEnablementCriteria: ['fixture certification'],
    rollbackPlan: 'disable provider',
  },
  {
    providerKey: 'mastodon',
    state: 'profiled',
    runtimeReadiness: 'deferred',
    liveBetaBlockers: ['scope pending'],
    liveEvidenceRequirements: [],
    freshnessGuard: makeFreshnessGuard({
      maxStalenessSeconds: 86_400,
      minimumScanIntervalSeconds: 86_400,
      skipRecentlyScanned: false,
    }),
    acquisitionMode: 'api',
    approvalOwner: 'source-owner',
    termsNotes: 'not enabled',
    credentialOwnership: 'user',
    quotaModel: 'per_tenant',
    retentionNotes: 'none',
    cursorModel: 'page_token',
    identityStrategy: ['instance', 'provider id'],
    supportedContentUnits: ['post'],
    unsupportedContentUnits: ['media'],
    estimatedCostPerScan: 'unknown',
    betaEnablementCriteria: ['owner approval'],
    rollbackPlan: 'keep deferred',
  },
];

function makeFreshnessGuard(
  overrides: Pick<
    SourceReadinessFreshnessGuard,
    'maxStalenessSeconds' | 'minimumScanIntervalSeconds' | 'skipRecentlyScanned'
  >,
): SourceReadinessFreshnessGuard {
  return {
    ...overrides,
    scanHistoryRequired: true,
    cursorResumeRequired: true,
    rateLimitBackoffRequired: true,
    staleReadModelState: 'stale',
    providerFailureHealthState: 'degraded',
    signals: ['fixture_freshness_guard'],
  };
}

const betaDurableEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
  DATABASE_URL: 'postgresql://social-monitor.test/db',
  RABBITMQ_URL: 'amqp://social-monitor.test',
  MONITORING_PERSISTENCE: 'prisma',
  FEED_PERSISTENCE: 'prisma',
  INGESTION_SUPPORT_PERSISTENCE: 'prisma',
  SUMMARY_PERSISTENCE: 'prisma',
  DELIVERY_PERSISTENCE: 'prisma',
  IDENTITY_PERSISTENCE: 'prisma',
  USAGE_PERSISTENCE: 'prisma',
  MONITORING_SCAN_QUEUE: 'rabbitmq',
  INGESTION_SCAN_QUEUE_READER: 'rabbitmq',
  SUMMARY_JOB_QUEUE_MODE: 'rabbitmq',
  INTELLIGENCE_SUMMARY_QUEUE_READER: 'rabbitmq',
  DELIVERY_ATTEMPT_DISPATCH_QUEUE: 'rabbitmq',
  DELIVERY_ATTEMPT_QUEUE_READER: 'rabbitmq',
  DELIVERY_SUMMARY_READY_EVENT_READER: 'rabbitmq',
  DELIVERY_WEBHOOK_PROVIDER: 'http',
};

describe('ApiGatewayHealthReporter', () => {
  it('builds deterministic health responses from injected clock and uptime reader', () => {
    const reporter = new ApiGatewayHealthReporter(
      { NODE_ENV: 'test' },
      new FixedClock(new Date('2026-01-02T03:04:05.000Z')),
      () => 12.7,
      readinessProfiles,
      databaseReady,
    );

    expect(reporter.health()).toEqual({
      status: 'ok',
      service: 'api-gateway',
      checkedAt: '2026-01-02T03:04:05.000Z',
      uptimeSeconds: 12,
    });
  });

  it('builds readiness metadata only after the bounded database probe succeeds', async () => {
    databaseReady.check.mockClear();
    const reporter = new ApiGatewayHealthReporter(
      {
        ...betaDurableEnv,
        DELIVERY_ENABLED_CHANNELS: 'webhook',
      },
      new FixedClock(new Date('2026-01-02T03:04:05.000Z')),
      () => 3,
      readinessProfiles,
      databaseReady,
    );

    await expect(reporter.ready()).resolves.toEqual(
      expect.objectContaining({
        runtime: expect.objectContaining({
          nodeEnv: 'production',
          runtimeProfile: 'beta',
          persistence: {
            monitoring: 'prisma',
            feed: 'prisma',
            ingestionSupport: 'prisma',
            summary: 'prisma',
            delivery: 'prisma',
            identity: 'prisma',
            usage: 'prisma',
          },
          queues: expect.objectContaining({
            monitoringScanPublisher: 'rabbitmq',
            deliveryAttemptReader: 'rabbitmq',
          }),
          providers: {
            deliveryWebhook: 'http',
            deliveryEnabledChannels: 'webhook',
          },
        }),
        capabilities: expect.objectContaining({
          rest: 'enabled',
          websocket: 'enabled',
          openapi: 'enabled',
          enabledBetaSources: ['reddit'],
          fixtureReadySources: ['reddit'],
          liveBetaReadySources: [],
          deferredSources: ['mastodon'],
        }),
      }),
    );
    expect(databaseReady.check).toHaveBeenCalledTimes(1);
  });

  it('reports resolved beta delivery channels when the selector is omitted', async () => {
    const reporter = new ApiGatewayHealthReporter(
      betaDurableEnv,
      new FixedClock(new Date('2026-01-02T03:04:05.000Z')),
      () => 3,
      readinessProfiles,
      databaseReady,
    );

    await expect(reporter.ready()).resolves.toMatchObject({
      runtime: { providers: { deliveryEnabledChannels: 'webhook' } },
    });
  });

  it('rejects beta readiness when durable selectors would fall back to in-memory', async () => {
    const reporter = new ApiGatewayHealthReporter(
      {
        NODE_ENV: 'production',
        SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
        DATABASE_URL: 'postgresql://social-monitor.test/db',
        RABBITMQ_URL: 'amqp://social-monitor.test',
      },
      new FixedClock(new Date('2026-01-02T03:04:05.000Z')),
      () => 3,
      readinessProfiles,
      databaseReady,
    );

    await expect(reporter.ready()).rejects.toThrow(
      'MONITORING_PERSISTENCE=in-memory is not allowed when SOCIAL_MONITOR_RUNTIME_PROFILE=beta',
    );
  });

  it('fails readiness when the bounded database probe fails', async () => {
    const reporter = new ApiGatewayHealthReporter(
      betaDurableEnv,
      new FixedClock(new Date('2026-01-02T03:04:05.000Z')),
      () => 3,
      readinessProfiles,
      { check: async () => Promise.reject(new Error('SQLSTATE 53300')) },
    );

    await expect(reporter.ready()).rejects.toThrow('SQLSTATE 53300');
  });
});
