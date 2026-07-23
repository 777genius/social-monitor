import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  resolveDeliveryEnabledChannels,
  resolveDeliveryPersistenceMode,
  resolveDeliveryWebhookProviderMode,
} from '@social-monitor/delivery/interfaces/rest/delivery-provider-tokens';
import { resolveFeedPersistenceMode } from '@social-monitor/feed/interfaces/rest/feed-provider-tokens';
import { resolveIdentityPersistenceMode } from '@social-monitor/identity/interfaces/rest/identity-provider-tokens';
import { resolveIngestionSupportPersistenceMode } from '@social-monitor/ingestion/interfaces/rest/ingestion-provider-tokens';
import type { SourceReadinessProfile } from '@social-monitor/ingestion/ports';
import {
  resolveMonitoringPersistenceMode,
  resolveMonitoringScanQueueMode,
} from '@social-monitor/monitoring/interfaces/rest/monitoring-provider-tokens';
import { resolveRuntimeProfile } from '@social-monitor/platform-config';
import {
  MetricsRuntime,
  type MetricsRuntimeHealth,
} from '@social-monitor/platform-metrics';
import { resolveRelevancePersistenceMode } from '@social-monitor/relevance/interfaces/rest/relevance-provider-tokens';
import type { Clock } from '@social-monitor/shared-kernel';
import { resolveSubscriptionsPersistenceMode } from '@social-monitor/subscriptions/interfaces/rest/subscriptions-provider-tokens';
import {
  resolveSummaryJobQueueMode,
  resolveSummaryPersistenceMode,
} from '@social-monitor/summary/interfaces/rest/summary-provider-tokens';
import { resolveUsagePersistenceMode } from '@social-monitor/usage/interfaces/rest/usage-provider-tokens';

import {
  resolveDeliveryAttemptDispatchLoopOptions,
  resolveDeliveryAttemptDispatchQueueMode,
  resolveDeliveryAttemptQueueDrainLoopOptions,
  resolveDeliveryAttemptQueueReaderMode,
  resolveDeliveryDigestSchedulerLoopOptions,
  resolveDeliverySummaryReadyEventDrainLoopOptions,
  resolveDeliverySummaryReadyEventReaderMode,
} from '../../delivery-service/src/delivery-service-provider-tokens';
import { resolveEventRelayLoopOptions } from '../../event-relay/src/event-relay-provider-tokens';
import {
  resolveIngestionScanQueueDrainLoopOptions,
  resolveIngestionScanQueueReaderMode,
  resolveIngestionScanSchedulerLoopOptions,
} from '../../ingestion-worker/src/ingestion-worker-provider-tokens';
import {
  resolveIntelligenceSummaryJobLoopOptions,
  resolveIntelligenceSummaryQueueDrainLoopOptions,
  resolveIntelligenceSummaryQueueReaderMode,
} from '../../intelligence-worker/src/intelligence-worker-provider-tokens';
import { resolveSocialResearchRuntimeSettings } from '../../social-research-runtime/src/social-research-runtime-settings';

export type HealthResponse = {
  readonly status: 'ok';
  readonly service: 'api-gateway';
  readonly checkedAt: string;
  readonly uptimeSeconds: number;
};

export type ReadinessResponse = HealthResponse & {
  readonly runtime: {
    readonly nodeEnv: string;
    readonly runtimeProfile: string;
    readonly persistence: {
      readonly monitoring: string;
      readonly feed: string;
      readonly ingestionSupport: string;
      readonly summary: string;
      readonly delivery: string;
      readonly identity: string;
      readonly usage: string;
    };
    readonly workerLoops: {
      readonly ingestionScanScheduler: string;
      readonly ingestionScanQueueDrain: string;
      readonly intelligenceSummaryJob: string;
      readonly intelligenceSummaryQueueDrain: string;
      readonly deliveryDigestScheduler: string;
      readonly deliveryAttemptDispatch: string;
      readonly deliveryAttemptQueueDrain: string;
      readonly deliverySummaryReadyEventDrain: string;
      readonly eventRelay: string;
    };
    readonly queues: {
      readonly monitoringScanPublisher: string;
      readonly ingestionScanReader: string;
      readonly summaryJobPublisher: string;
      readonly intelligenceSummaryReader: string;
      readonly deliveryAttemptPublisher: string;
      readonly deliveryAttemptReader: string;
      readonly deliverySummaryReadyEventReader: string;
    };
    readonly providers: {
      readonly deliveryWebhook: string;
      readonly deliveryEnabledChannels: string;
    };
    readonly metrics: MetricsRuntimeHealth;
  };
  readonly capabilities: {
    readonly rest: 'enabled';
    readonly websocket: 'enabled';
    readonly openapi: 'enabled';
    readonly workerApps: readonly string[];
    readonly enabledBetaSources: readonly string[];
    readonly fixtureReadySources: readonly string[];
    readonly liveBetaReadySources: readonly string[];
    readonly deferredSources: readonly string[];
  };
  readonly checks: readonly {
    readonly name: string;
    readonly status: 'ok';
    readonly detail: string;
  }[];
};

export type UptimeSecondsReader = () => number;
export type ApiGatewayDatabaseReadinessResult = 'queried' | 'skipped';
export type ApiGatewayDatabaseReadiness = {
  check(): Promise<ApiGatewayDatabaseReadinessResult>;
};

export const API_GATEWAY_HEALTH_ENV = Symbol('API_GATEWAY_HEALTH_ENV');
export const API_GATEWAY_HEALTH_CLOCK = Symbol('API_GATEWAY_HEALTH_CLOCK');
export const API_GATEWAY_UPTIME_SECONDS = Symbol('API_GATEWAY_UPTIME_SECONDS');
export const API_GATEWAY_SOURCE_READINESS_PROFILES = Symbol('API_GATEWAY_SOURCE_READINESS_PROFILES');
export const API_GATEWAY_DATABASE_READINESS = Symbol(
  'API_GATEWAY_DATABASE_READINESS',
);

export function createApiGatewayDatabaseReadiness(
  env: NodeJS.ProcessEnv,
  probe: () => Promise<void>,
): ApiGatewayDatabaseReadiness {
  return {
    check: async (): Promise<ApiGatewayDatabaseReadinessResult> => {
      if (!apiGatewayUsesPrismaPersistence(env)) {
        return 'skipped';
      }
      await probe();
      return 'queried';
    },
  };
}

function apiGatewayUsesPrismaPersistence(env: NodeJS.ProcessEnv): boolean {
  return [
    resolveMonitoringPersistenceMode(env),
    resolveFeedPersistenceMode(env),
    resolveIngestionSupportPersistenceMode(env),
    resolveSummaryPersistenceMode(env),
    resolveDeliveryPersistenceMode(env),
    resolveIdentityPersistenceMode(env),
    resolveUsagePersistenceMode(env),
    resolveRelevancePersistenceMode(env),
    resolveSubscriptionsPersistenceMode(env),
    resolveSocialResearchRuntimeSettings(env).resultCache.mode,
  ].includes('prisma');
}

@Injectable()
export class ApiGatewayHealthReporter {
  constructor(
    @Inject(API_GATEWAY_HEALTH_ENV)
    private readonly env: NodeJS.ProcessEnv,
    @Inject(API_GATEWAY_HEALTH_CLOCK)
    private readonly clock: Clock,
    @Inject(API_GATEWAY_UPTIME_SECONDS)
    private readonly uptimeSeconds: UptimeSecondsReader,
    @Inject(API_GATEWAY_SOURCE_READINESS_PROFILES)
    private readonly sourceReadinessProfiles: readonly SourceReadinessProfile[],
    @Inject(API_GATEWAY_DATABASE_READINESS)
    @Optional()
    private readonly databaseReadiness?: ApiGatewayDatabaseReadiness,
    @Optional()
    private readonly metricsRuntime?: MetricsRuntime,
  ) {}

  health(): HealthResponse {
    return this.ok();
  }

  async ready(): Promise<ReadinessResponse> {
    const databaseReadiness = await this.checkDatabaseReadiness();
    return {
      ...this.ok(),
      runtime: {
        nodeEnv: this.env.NODE_ENV ?? 'development',
        runtimeProfile: resolveRuntimeProfile(this.env),
        persistence: {
          monitoring: resolveMonitoringPersistenceMode(this.env),
          feed: resolveFeedPersistenceMode(this.env),
          ingestionSupport: resolveIngestionSupportPersistenceMode(this.env),
          summary: resolveSummaryPersistenceMode(this.env),
          delivery: resolveDeliveryPersistenceMode(this.env),
          identity: resolveIdentityPersistenceMode(this.env),
          usage: resolveUsagePersistenceMode(this.env),
        },
        workerLoops: {
          ingestionScanScheduler: this.loopMode(resolveIngestionScanSchedulerLoopOptions(this.env).enabled),
          ingestionScanQueueDrain: this.loopMode(resolveIngestionScanQueueDrainLoopOptions(this.env).enabled),
          intelligenceSummaryJob: this.loopMode(resolveIntelligenceSummaryJobLoopOptions(this.env).enabled),
          intelligenceSummaryQueueDrain: this.loopMode(
            resolveIntelligenceSummaryQueueDrainLoopOptions(this.env).enabled,
          ),
          deliveryDigestScheduler: this.loopMode(resolveDeliveryDigestSchedulerLoopOptions(this.env).enabled),
          deliveryAttemptDispatch: this.loopMode(resolveDeliveryAttemptDispatchLoopOptions(this.env).enabled),
          deliveryAttemptQueueDrain: this.loopMode(resolveDeliveryAttemptQueueDrainLoopOptions(this.env).enabled),
          deliverySummaryReadyEventDrain: this.loopMode(
            resolveDeliverySummaryReadyEventDrainLoopOptions(this.env).enabled,
          ),
          eventRelay: this.loopMode(resolveEventRelayLoopOptions(this.env).enabled),
        },
        queues: {
          monitoringScanPublisher: resolveMonitoringScanQueueMode(this.env),
          ingestionScanReader: resolveIngestionScanQueueReaderMode(this.env),
          summaryJobPublisher: resolveSummaryJobQueueMode(this.env),
          intelligenceSummaryReader: resolveIntelligenceSummaryQueueReaderMode(this.env),
          deliveryAttemptPublisher: resolveDeliveryAttemptDispatchQueueMode(this.env),
          deliveryAttemptReader: resolveDeliveryAttemptQueueReaderMode(this.env),
          deliverySummaryReadyEventReader: resolveDeliverySummaryReadyEventReaderMode(this.env),
        },
        providers: {
          deliveryWebhook: resolveDeliveryWebhookProviderMode(this.env),
          deliveryEnabledChannels: resolveDeliveryEnabledChannels(this.env).join(','),
        },
        metrics: this.requireMetricsHealth(),
      },
      capabilities: {
        rest: 'enabled',
        websocket: 'enabled',
        openapi: 'enabled',
        workerApps: ['ingestion-worker', 'intelligence-worker', 'delivery-service', 'event-relay'],
        enabledBetaSources: this.sourceReadinessProfiles
          .filter((profile) => profile.state === 'enabled_beta')
          .map((profile) => profile.providerKey)
          .sort(),
        fixtureReadySources: this.sourceReadinessProfiles
          .filter((profile) => profile.runtimeReadiness === 'fixture_ready')
          .map((profile) => profile.providerKey)
          .sort(),
        liveBetaReadySources: this.sourceReadinessProfiles
          .filter((profile) => profile.runtimeReadiness === 'live_beta_ready')
          .map((profile) => profile.providerKey)
          .sort(),
        deferredSources: this.sourceReadinessProfiles
          .filter((profile) => profile.state !== 'enabled_beta')
          .map((profile) => profile.providerKey)
          .sort(),
      },
      checks: [
        {
          name: 'api_gateway',
          status: 'ok',
          detail: 'Nest application initialized.',
        },
        {
          name: 'source_capability_profiles',
          status: 'ok',
          detail: 'Source readiness profiles loaded.',
        },
        {
          name: 'postgres_runtime_pool',
          status: 'ok',
          detail:
            databaseReadiness === 'queried'
              ? 'A query completed through the bounded shared Prisma pool.'
              : 'Database dependency not required: all API gateway Prisma persistence selectors are disabled; PostgreSQL probe was not executed.',
        },
        {
          name: 'metrics_exporter',
          status: 'ok',
          detail: this.metricsReadinessDetail(),
        },
      ],
    };
  }

  private ok(): HealthResponse {
    return {
      status: 'ok',
      service: 'api-gateway',
      checkedAt: this.clock.now().toISOString(),
      uptimeSeconds: Math.floor(this.uptimeSeconds()),
    };
  }

  private async checkDatabaseReadiness(): Promise<ApiGatewayDatabaseReadinessResult> {
    if (this.databaseReadiness !== undefined) {
      return this.databaseReadiness.check();
    }
    if (apiGatewayUsesPrismaPersistence(this.env)) {
      throw new Error(
        'API gateway PostgreSQL readiness probe is not configured',
      );
    }
    return 'skipped';
  }

  private requireMetricsHealth(): MetricsRuntimeHealth {
    const health = this.metricsRuntime?.health();
    if (health === undefined) {
      throw new Error('API gateway metrics runtime is not configured');
    }
    if (health.lifecycle !== 'active') {
      throw new Error('API gateway metrics runtime is not active');
    }
    if (
      resolveRuntimeProfile(this.env) === 'beta' &&
      health.mode !== 'otlp'
    ) {
      throw new Error('Beta API gateway metrics runtime must use OTLP');
    }
    return health;
  }

  private metricsReadinessDetail(): string {
    const health = this.requireMetricsHealth();
    return health.mode === 'otlp'
      ? `OTLP metrics runtime active; last export state: ${health.exportState}.`
      : 'Deterministic in-memory metrics runtime active.';
  }

  private loopMode(enabled: boolean): 'enabled' | 'disabled' {
    return enabled ? 'enabled' : 'disabled';
  }
}
