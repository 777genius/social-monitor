import type { SourceReadinessProfile } from '@social-monitor/ingestion/ports';
import { FixedClock } from '@social-monitor/shared-kernel';

import { ApiGatewayHealthReporter } from './health-reporter';

const readinessProfiles: readonly SourceReadinessProfile[] = [
  {
    providerKey: 'reddit',
    state: 'enabled_beta',
    runtimeReadiness: 'fixture_ready',
    liveBetaBlockers: ['live credentials pending'],
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

describe('ApiGatewayHealthReporter', () => {
  it('builds deterministic health responses from injected clock and uptime reader', () => {
    const reporter = new ApiGatewayHealthReporter(
      { NODE_ENV: 'test' },
      new FixedClock(new Date('2026-01-02T03:04:05.000Z')),
      () => 12.7,
      readinessProfiles,
    );

    expect(reporter.health()).toEqual({
      status: 'ok',
      service: 'api-gateway',
      checkedAt: '2026-01-02T03:04:05.000Z',
      uptimeSeconds: 12,
    });
  });

  it('builds readiness metadata from injected environment without globals', () => {
    const reporter = new ApiGatewayHealthReporter(
      {
        NODE_ENV: 'production',
        SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
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
        DELIVERY_WEBHOOK_PROVIDER: 'http',
        DELIVERY_ENABLED_CHANNELS: 'webhook',
      },
      new FixedClock(new Date('2026-01-02T03:04:05.000Z')),
      () => 3,
      readinessProfiles,
    );

    expect(reporter.ready()).toEqual(expect.objectContaining({
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
    }));
  });
});
